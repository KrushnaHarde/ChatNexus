'use strict';

// ===========================
// API Configuration
// ===========================
// Determine API base URL based on environment
const API_BASE_URL = (() => {
    // If running on localhost or 127.0.0.1, use local backend
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'http://localhost:8080';
    }
    // For production (Vercel frontend + Render backend)
    return 'https://chatnexus-backend.onrender.com';
})();

// Helper function to build API URLs
function buildApiUrl(endpoint) {
    return `${API_BASE_URL}${endpoint}`;
}

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    const authPage = document.querySelector('#auth-page');
    const chatPage = document.querySelector('#chat-page');
    const loginForm = document.querySelector('#loginForm');
    const registerForm = document.querySelector('#registerForm');
    const messageForm = document.querySelector('#messageForm');
    const messageInput = document.querySelector('#message');
    const chatArea = document.querySelector('#chat-messages');
    const logout = document.querySelector('#logout');
    const chatHeader = document.querySelector('#chat-with');
    const authTitle = document.querySelector('#auth-title');
    const authSubtitle = document.querySelector('#auth-subtitle');
    const toggleText = document.querySelector('#toggle-text');
    const userSearchInput = document.querySelector('#userSearch');
    const searchResultsDiv = document.querySelector('#searchResults');

    // File upload elements
    const fileInput = document.querySelector('#fileInput');
    const attachBtn = document.querySelector('#attachBtn');
    const filePreview = document.querySelector('#filePreview');
    const filePreviewName = document.querySelector('#filePreviewName');
    const cancelFileBtn = document.querySelector('#cancelFile');
    const uploadProgress = document.querySelector('#uploadProgress');
    const progressFill = document.querySelector('.progress-fill');

    let stompClient = null;
    let username = null;
    let fullname = null;
    let token = null;
    let selectedUserId = null;
    let isLoginMode = true;
    let searchTimeout = null;
    let selectedFile = null; // Store the selected file for upload

    // Store message elements by ID for status updates
    let messageElements = {};
    // Store message timestamps by ID
    let messageTimestamps = {};

    // Check for existing session on page load
    const savedToken = localStorage.getItem('token');
    const savedUsername = localStorage.getItem('username');
    const savedFullname = localStorage.getItem('fullname');

    if (savedToken && savedUsername) {
        token = savedToken;
        username = savedUsername;
        fullname = savedFullname;
        enterChat();
    }

    // Toggle between login and register forms
    function setupToggle() {
        const toggleAuth = document.querySelector('#toggle-auth');
        if (toggleAuth) {
            toggleAuth.addEventListener('click', function(e) {
                e.preventDefault();
                isLoginMode = !isLoginMode;

                if (isLoginMode) {
                    loginForm.classList.remove('hidden');
                    registerForm.classList.add('hidden');
                    authTitle.textContent = 'Welcome Back';
                    authSubtitle.textContent = 'Sign in to continue';
                    toggleText.innerHTML = 'Don\'t have an account? <a href="#" id="toggle-auth">Register</a>';
                } else {
                    loginForm.classList.add('hidden');
                    registerForm.classList.remove('hidden');
                    authTitle.textContent = 'Create Account';
                    authSubtitle.textContent = 'Sign up to get started';
                    toggleText.innerHTML = 'Already have an account? <a href="#" id="toggle-auth">Sign In</a>';
                }
                setupToggle();
            });
        }
    }
    setupToggle();

    // Login form submission
    if (loginForm) {
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();

            const usernameInput = document.querySelector('#login-username').value.trim();
            const password = document.querySelector('#login-password').value;
            const errorDiv = document.querySelector('#login-error');

            try {
                const response = await fetch(buildApiUrl('/api/auth/login'), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ username: usernameInput, password: password })
                });

                const data = await response.json();

                if (response.ok) {
                    token = data.token;
                    username = data.username;
                    fullname = data.fullName;

                    localStorage.setItem('token', token);
                    localStorage.setItem('username', username);
                    localStorage.setItem('fullname', fullname);

                    errorDiv.classList.add('hidden');
                    enterChat();
                } else {
                    errorDiv.textContent = data.error || 'Login failed';
                    errorDiv.classList.remove('hidden');
                }
            } catch (error) {
                console.error('Login error:', error);
                errorDiv.textContent = 'Connection error. Please try again.';
                errorDiv.classList.remove('hidden');
            }
        });
    }

    // Register form submission
    if (registerForm) {
        registerForm.addEventListener('submit', async function(e) {
            e.preventDefault();

            const usernameInput = document.querySelector('#register-username').value.trim();
            const fullnameInput = document.querySelector('#register-fullname').value.trim();
            const password = document.querySelector('#register-password').value;
            const confirmPassword = document.querySelector('#register-confirm-password').value;
            const errorDiv = document.querySelector('#register-error');

            if (password !== confirmPassword) {
                errorDiv.textContent = 'Passwords do not match';
                errorDiv.classList.remove('hidden');
                return;
            }

            try {
                const response = await fetch(buildApiUrl('/api/auth/register'), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        username: usernameInput,
                        fullName: fullnameInput,
                        password: password
                    })
                });

                const data = await response.json();

                if (response.ok) {
                    token = data.token;
                    username = data.username;
                    fullname = data.fullName;

                    localStorage.setItem('token', token);
                    localStorage.setItem('username', username);
                    localStorage.setItem('fullname', fullname);

                    errorDiv.classList.add('hidden');
                    enterChat();
                } else {
                    errorDiv.textContent = data.error || 'Registration failed';
                    errorDiv.classList.remove('hidden');
                }
            } catch (error) {
                console.error('Registration error:', error);
                errorDiv.textContent = 'Connection error. Please try again.';
                errorDiv.classList.remove('hidden');
            }
        });
    }

    function enterChat() {
        authPage.classList.add('hidden');
        chatPage.classList.remove('hidden');

        const wsUrl = buildApiUrl('/ws');
        const socket = new SockJS(wsUrl);
        stompClient = Stomp.over(socket);
        stompClient.debug = null; // Disable debug logs

        stompClient.connect({}, onConnected, onError);

        // Setup search functionality
        setupSearch();
    }

    function setupSearch() {
        if (userSearchInput) {
            userSearchInput.addEventListener('input', function(e) {
                const query = e.target.value.trim();

                // Clear previous timeout
                if (searchTimeout) {
                    clearTimeout(searchTimeout);
                }

                if (query.length === 0) {
                    searchResultsDiv.classList.add('hidden');
                    return;
                }

                // Debounce search
                searchTimeout = setTimeout(() => {
                    searchUsers(query);
                }, 300);
            });

            // Hide search results when clicking outside
            document.addEventListener('click', function(e) {
                if (!userSearchInput.contains(e.target) && !searchResultsDiv.contains(e.target)) {
                    searchResultsDiv.classList.add('hidden');
                }
            });

            // Show search results when focusing on input
            userSearchInput.addEventListener('focus', function() {
                if (userSearchInput.value.trim().length > 0) {
                    searchResultsDiv.classList.remove('hidden');
                }
            });
        }
    }

    async function searchUsers(query) {
        try {
            const response = await fetch(buildApiUrl(`/users/search?query=${encodeURIComponent(query)}`), {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const users = await response.json();
                // Filter out current user
                const filteredUsers = users.filter(user => user.username !== username);
                displaySearchResults(filteredUsers);
            }
        } catch (error) {
            console.error('Error searching users:', error);
        }
    }

    function displaySearchResults(users) {
        searchResultsDiv.innerHTML = '';

        if (users.length === 0) {
            const noResults = document.createElement('div');
            noResults.classList.add('no-results');
            noResults.textContent = 'No users found';
            searchResultsDiv.appendChild(noResults);
        } else {
            users.forEach(user => {
                const resultItem = document.createElement('div');
                resultItem.classList.add('search-result-item');
                resultItem.dataset.username = user.username;
                resultItem.dataset.fullname = user.fullName;

                resultItem.innerHTML = `
                    <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(user.fullName)}&background=667eea&color=fff&size=36" alt="${user.fullName}">
                    <div class="user-info">
                        <div class="fullname">${user.fullName}</div>
                        <div class="username">@${user.username}</div>
                    </div>
                    <span class="status-indicator ${user.status === 'ONLINE' ? 'online' : 'offline'}"></span>
                `;

                resultItem.addEventListener('click', () => selectSearchResult(user));
                searchResultsDiv.appendChild(resultItem);
            });
        }

        searchResultsDiv.classList.remove('hidden');
    }

    function selectSearchResult(user) {
        selectedUserId = user.username;

        // Update chat header
        if (chatHeader) {
            chatHeader.innerHTML = `<i class="fas fa-comment-dots"></i> Chat with ${user.fullName}`;
        }

        // Show message form
        if (messageForm) {
            messageForm.classList.remove('hidden');
        }

        // Clear search
        userSearchInput.value = '';
        searchResultsDiv.classList.add('hidden');

        // Remove active state from all users in list
        document.querySelectorAll('.user-item').forEach(item => {
            item.classList.remove('active');
        });

        // Check if user already exists in contacts list
        const existingUser = document.querySelector(`#user-${CSS.escape(user.username)}`);
        if (existingUser) {
            existingUser.classList.add('active');
            // Clear notification badge
            const nbrMsg = existingUser.querySelector('.nbr-msg');
            if (nbrMsg) {
                nbrMsg.classList.add('hidden');
                nbrMsg.textContent = '0';
            }
        }

        // Fetch and display chat
        fetchAndDisplayUserChat();
    }

    function onConnected() {
        console.log('WebSocket connected!');

        // Subscribe to private messages
        stompClient.subscribe(`/user/${username}/queue/messages`, onPrivateMessageReceived);

        // Subscribe to message status updates (delivery confirmations)
        stompClient.subscribe(`/user/${username}/queue/status`, onStatusUpdateReceived);

        // Subscribe to public topic (user online/offline notifications)
        stompClient.subscribe(`/topic/public`, onPublicMessageReceived);

        // Register the connected user (set status to ONLINE)
        stompClient.send("/app/user.addUser",
            {},
            JSON.stringify({username: username, fullName: fullname, status: 'ONLINE'})
        );

        document.querySelector('#connected-user-fullname').textContent = fullname;

        // Fetch and display connected users
        findAndDisplayConnectedUsers();

        // Fetch and process offline messages
        fetchUndeliveredMessages();
    }

    function onError(error) {
        console.error('WebSocket error:', error);
        if (chatArea) {
            const errorElement = document.createElement('div');
            errorElement.className = 'connecting';
            errorElement.textContent = 'Could not connect to WebSocket server. Please refresh this page to try again!';
            errorElement.style.color = '#ef4444';
            chatArea.appendChild(errorElement);
        }
    }

    // Handle delivery status updates
    function onStatusUpdateReceived(payload) {
        console.log('Status update received:', payload.body);
        const statusUpdate = JSON.parse(payload.body);

        // Try to find message element by ID in our stored references
        let messageElement = messageElements[statusUpdate.id];

        // If not found, search in the DOM by data-message-id attribute
        if (!messageElement) {
            messageElement = chatArea.querySelector(`[data-message-id="${statusUpdate.id}"]`);
            if (messageElement) {
                messageElements[statusUpdate.id] = messageElement;
            }
        }

        // For READ status, also update any messages that might be from this conversation
        // This handles the case where messages were loaded but not tracked in messageElements
        if (statusUpdate.status === 'READ' && selectedUserId === statusUpdate.recipientId) {
            // Update all sender messages in the current chat that aren't already READ
            const allSenderMessages = chatArea.querySelectorAll('.message.sender');
            allSenderMessages.forEach(msgEl => {
                const statusIcon = msgEl.querySelector('.message-status');
                if (statusIcon && !statusIcon.innerHTML.includes('style="color: #667eea;"')) {
                    statusIcon.innerHTML = '<i class="fas fa-check-double" style="color: #667eea;"></i>';
                    statusIcon.title = 'Read';
                }

                // Update the timestamp tooltip to show read time
                if (statusUpdate.readTimestamp) {
                    const msgId = msgEl.dataset.messageId;
                    if (msgId) {
                        // Update stored timestamps
                        if (!messageTimestamps[msgId]) {
                            messageTimestamps[msgId] = {};
                        }
                        messageTimestamps[msgId].readTimestamp = statusUpdate.readTimestamp;

                        // Update tooltip element
                        let tooltipElement = msgEl.querySelector('.message-timestamp-tooltip');
                        if (tooltipElement) {
                            const sentTime = messageTimestamps[msgId].sentTimestamp;
                            let tooltipContent = sentTime ? `Sent: ${formatTimestamp(sentTime)}` : '';
                            tooltipContent += `<br>Read: ${formatTimestamp(statusUpdate.readTimestamp)}`;
                            tooltipElement.innerHTML = tooltipContent;
                        }
                    }
                }
            });
        }

        // Update the specific message element if found
        if (messageElement) {
            const statusIcon = messageElement.querySelector('.message-status');
            if (statusIcon) {
                if (statusUpdate.status === 'DELIVERED') {
                    statusIcon.innerHTML = '<i class="fas fa-check-double"></i>';
                    statusIcon.title = 'Delivered';
                } else if (statusUpdate.status === 'READ') {
                    statusIcon.innerHTML = '<i class="fas fa-check-double" style="color: #667eea;"></i>';
                    statusIcon.title = 'Read';
                }
            }

            // Update timestamp data and tooltip
            if (statusUpdate.readTimestamp) {
                messageTimestamps[statusUpdate.id] = {
                    ...messageTimestamps[statusUpdate.id],
                    readTimestamp: statusUpdate.readTimestamp
                };
                updateTimestampTooltip(messageElement, statusUpdate.id);
            }
        }
    }

    // Format timestamp for display
    function formatTimestamp(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const now = new Date();
        const isToday = date.toDateString() === now.toDateString();

        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        if (isToday) {
            return timeStr;
        } else {
            const dateFormatted = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
            return `${dateFormatted}, ${timeStr}`;
        }
    }

    // Update timestamp tooltip for a message element
    function updateTimestampTooltip(messageElement, messageId) {
        const timestamps = messageTimestamps[messageId];
        if (!timestamps) return;

        let tooltipElement = messageElement.querySelector('.message-timestamp-tooltip');
        if (!tooltipElement) {
            tooltipElement = document.createElement('div');
            tooltipElement.classList.add('message-timestamp-tooltip');
            messageElement.appendChild(tooltipElement);
        }

        let tooltipContent = `Sent: ${formatTimestamp(timestamps.sentTimestamp)}`;
        if (timestamps.readTimestamp) {
            tooltipContent += `<br>Read: ${formatTimestamp(timestamps.readTimestamp)}`;
        }
        tooltipElement.innerHTML = tooltipContent;
    }

    async function fetchUndeliveredMessages() {
        try {
            const response = await fetch(buildApiUrl(`/messages/undelivered/${username}`), {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const messages = await response.json();
                console.log('Undelivered messages:', messages.length);

                // Group messages by sender and update notification badges
                const senderCounts = {};
                messages.forEach(msg => {
                    senderCounts[msg.senderId] = (senderCounts[msg.senderId] || 0) + 1;
                });

                // Update notification badges for each sender after a short delay
                // to ensure user list is loaded
                setTimeout(() => {
                    Object.keys(senderCounts).forEach(senderId => {
                        updateNotificationBadge(senderId, senderCounts[senderId]);
                    });
                }, 500);
            }
        } catch (error) {
            console.error('Error fetching undelivered messages:', error);
        }
    }

    function updateNotificationBadge(senderId, count) {
        const userElement = document.querySelector(`#user-${CSS.escape(senderId)}`);
        if (userElement) {
            const nbrMsg = userElement.querySelector('.nbr-msg');
            if (nbrMsg) {
                const currentCount = parseInt(nbrMsg.textContent) || 0;
                const newCount = currentCount + count;
                nbrMsg.textContent = newCount;
                if (newCount > 0) {
                    nbrMsg.classList.remove('hidden');
                }
            }
        } else {
            // User not in online list - they sent messages while offline
            // Store the count for when we might add them to the list
            console.log(`User ${senderId} sent ${count} messages while both offline`);
        }
    }

    async function findAndDisplayConnectedUsers() {
        try {
            // Fetch chat contacts (previous conversations) instead of online users
            const contactsResponse = await fetch(buildApiUrl(`/contacts/${username}`), {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            let contacts = await contactsResponse.json();
            const connectedUsersList = document.getElementById('connectedUsers');
            connectedUsersList.innerHTML = '';

            if (contacts.length === 0) {
                const emptyMsg = document.createElement('li');
                emptyMsg.classList.add('no-users');
                emptyMsg.innerHTML = '<i class="fas fa-search"></i> Search for users to start chatting';
                emptyMsg.style.color = '#8892b0';
                emptyMsg.style.textAlign = 'center';
                emptyMsg.style.padding = '20px';
                connectedUsersList.appendChild(emptyMsg);
            } else {
                contacts.forEach((contact, index) => {
                    appendContactElement(contact, connectedUsersList);
                    if (index < contacts.length - 1) {
                        const separator = document.createElement('li');
                        separator.classList.add('separator');
                        connectedUsersList.appendChild(separator);
                    }
                });
            }
        } catch (error) {
            console.error('Error fetching contacts:', error);
        }
    }

    function appendContactElement(contact, connectedUsersList) {
        const listItem = document.createElement('li');
        listItem.classList.add('user-item');
        listItem.id = `user-${contact.username}`;
        listItem.dataset.username = contact.username;
        listItem.dataset.fullname = contact.fullName;

        const userImage = document.createElement('img');
        userImage.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(contact.fullName)}&background=667eea&color=fff&size=42`;
        userImage.alt = contact.fullName;

        // Contact info container
        const contactInfo = document.createElement('div');
        contactInfo.classList.add('contact-info');

        // Name row with status indicator
        const nameRow = document.createElement('div');
        nameRow.classList.add('contact-name');

        const usernameSpan = document.createElement('span');
        usernameSpan.textContent = contact.fullName;
        nameRow.appendChild(usernameSpan);

        // Online status indicator
        const statusIndicator = document.createElement('span');
        statusIndicator.classList.add('status-indicator');
        statusIndicator.classList.add(contact.status === 'ONLINE' ? 'online' : 'offline');
        nameRow.appendChild(statusIndicator);

        contactInfo.appendChild(nameRow);

        // Last message preview
        if (contact.lastMessage) {
            const lastMessageSpan = document.createElement('div');
            lastMessageSpan.classList.add('last-message');
            const prefix = contact.lastMessageSenderId === username ? 'You: ' : '';
            lastMessageSpan.textContent = prefix + contact.lastMessage;
            if (contact.unreadCount > 0) {
                lastMessageSpan.classList.add('unread');
            }
            contactInfo.appendChild(lastMessageSpan);
        }

        // Meta info (time + unread badge)
        const metaDiv = document.createElement('div');
        metaDiv.classList.add('contact-meta');

        // Last message time
        if (contact.lastMessageTime) {
            const timeSpan = document.createElement('span');
            timeSpan.classList.add('last-time');
            timeSpan.textContent = formatContactTime(contact.lastMessageTime);
            if (contact.unreadCount > 0) {
                timeSpan.classList.add('unread');
            }
            metaDiv.appendChild(timeSpan);
        }

        // Unread badge
        const receivedMsgs = document.createElement('span');
        receivedMsgs.textContent = contact.unreadCount || '0';
        receivedMsgs.classList.add('nbr-msg');
        if (!contact.unreadCount || contact.unreadCount === 0) {
            receivedMsgs.classList.add('hidden');
        }
        metaDiv.appendChild(receivedMsgs);

        listItem.appendChild(userImage);
        listItem.appendChild(contactInfo);
        listItem.appendChild(metaDiv);

        listItem.addEventListener('click', userItemClick);

        connectedUsersList.appendChild(listItem);
    }

    function formatContactTime(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const now = new Date();
        const isToday = date.toDateString() === now.toDateString();

        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const isYesterday = date.toDateString() === yesterday.toDateString();

        if (isToday) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else if (isYesterday) {
            return 'Yesterday';
        } else {
            return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        }
    }

    function userItemClick(event) {
        document.querySelectorAll('.user-item').forEach(item => {
            item.classList.remove('active');
        });
        if (messageForm) {
            messageForm.classList.remove('hidden');
        }

        const clickedUser = event.currentTarget;
        clickedUser.classList.add('active');

        selectedUserId = clickedUser.dataset.username;

        const selectedUserName = clickedUser.dataset.fullname || clickedUser.querySelector('.contact-name span')?.textContent || clickedUser.querySelector('span')?.textContent;
        if (chatHeader) {
            chatHeader.innerHTML = `<i class="fas fa-comment-dots"></i> Chat with ${selectedUserName}`;
        }

        fetchAndDisplayUserChat();

        // Clear notification badge
        const nbrMsg = clickedUser.querySelector('.nbr-msg');
        if (nbrMsg) {
            nbrMsg.classList.add('hidden');
            nbrMsg.textContent = '0';
        }

        // Clear search
        if (userSearchInput) {
            userSearchInput.value = '';
        }
        if (searchResultsDiv) {
            searchResultsDiv.classList.add('hidden');
        }
    }

    function displayMessage(senderId, content, status = 'DELIVERED', messageId = null, timestamp = null, readTimestamp = null, messageType = 'TEXT', mediaUrl = null, fileName = null) {
        const messageContainer = document.createElement('div');
        messageContainer.classList.add('message');

        if (messageId) {
            messageContainer.dataset.messageId = messageId;
            // Store timestamps for this message
            messageTimestamps[messageId] = {
                sentTimestamp: timestamp,
                readTimestamp: readTimestamp
            };
        }

        if (senderId === username) {
            messageContainer.classList.add('sender');
        } else {
            messageContainer.classList.add('receiver');
        }

        // Handle different message types
        if (messageType === 'IMAGE' && mediaUrl) {
            const mediaDiv = document.createElement('div');
            mediaDiv.classList.add('media-message');

            const img = document.createElement('img');
            img.src = mediaUrl;
            img.alt = fileName || 'Image';
            img.loading = 'lazy';
            img.onclick = () => openLightbox(mediaUrl);
            mediaDiv.appendChild(img);

            if (content) {
                const caption = document.createElement('p');
                caption.classList.add('media-caption');
                caption.textContent = content;
                mediaDiv.appendChild(caption);
            }

            messageContainer.appendChild(mediaDiv);
        } else if (messageType === 'VIDEO' && mediaUrl) {
            const mediaDiv = document.createElement('div');
            mediaDiv.classList.add('media-message');

            const video = document.createElement('video');
            video.src = mediaUrl;
            video.controls = true;
            video.preload = 'metadata';
            mediaDiv.appendChild(video);

            if (content) {
                const caption = document.createElement('p');
                caption.classList.add('media-caption');
                caption.textContent = content;
                mediaDiv.appendChild(caption);
            }

            messageContainer.appendChild(mediaDiv);
        } else if (messageType === 'AUDIO' && mediaUrl) {
            const mediaDiv = document.createElement('div');
            mediaDiv.classList.add('media-message');

            const audio = document.createElement('audio');
            audio.src = mediaUrl;
            audio.controls = true;
            audio.preload = 'metadata';
            mediaDiv.appendChild(audio);

            if (fileName) {
                const fileInfo = document.createElement('div');
                fileInfo.classList.add('file-info');
                fileInfo.innerHTML = `<i class="fas fa-music"></i><span class="file-name">${fileName}</span>`;
                mediaDiv.appendChild(fileInfo);
            }

            if (content) {
                const caption = document.createElement('p');
                caption.classList.add('media-caption');
                caption.textContent = content;
                mediaDiv.appendChild(caption);
            }

            messageContainer.appendChild(mediaDiv);
        } else {
            // Regular text message
            const message = document.createElement('p');
            message.textContent = content;
            messageContainer.appendChild(message);
        }

        // Add status indicator for sent messages
        if (senderId === username) {
            const statusIcon = document.createElement('span');
            statusIcon.classList.add('message-status');
            if (status === 'SENT') {
                statusIcon.innerHTML = '<i class="fas fa-check"></i>';
                statusIcon.title = 'Sent';
            } else if (status === 'DELIVERED') {
                statusIcon.innerHTML = '<i class="fas fa-check-double"></i>';
                statusIcon.title = 'Delivered';
            } else if (status === 'READ') {
                statusIcon.innerHTML = '<i class="fas fa-check-double" style="color: #667eea;"></i>';
                statusIcon.title = 'Read';
            }
            messageContainer.appendChild(statusIcon);

            // Store reference for status updates
            if (messageId) {
                messageElements[messageId] = messageContainer;
            }
        }

        // Add timestamp tooltip (shows on hover)
        if (messageId && timestamp) {
            const tooltipElement = document.createElement('div');
            tooltipElement.classList.add('message-timestamp-tooltip');
            let tooltipContent = `Sent: ${formatTimestamp(timestamp)}`;
            if (readTimestamp) {
                tooltipContent += `<br>Read: ${formatTimestamp(readTimestamp)}`;
            }
            tooltipElement.innerHTML = tooltipContent;
            messageContainer.appendChild(tooltipElement);
        }

        chatArea.appendChild(messageContainer);
        return messageContainer;
    }

    // Open image in lightbox
    function openLightbox(imageUrl) {
        const lightbox = document.createElement('div');
        lightbox.classList.add('lightbox');
        lightbox.innerHTML = `
            <span class="lightbox-close"><i class="fas fa-times"></i></span>
            <img src="${imageUrl}" alt="Full size image">
        `;
        lightbox.onclick = (e) => {
            if (e.target === lightbox || e.target.closest('.lightbox-close')) {
                lightbox.remove();
            }
        };
        document.body.appendChild(lightbox);
    }

    // Send read notification via WebSocket
    function sendReadNotification(senderId) {
        if (stompClient && stompClient.connected) {
            stompClient.send("/app/chat.read", {}, JSON.stringify({
                senderId: senderId,
                recipientId: username
            }));
        }
    }

    async function fetchAndDisplayUserChat() {
        try {
            const userChatResponse = await fetch(buildApiUrl(`/messages/${username}/${selectedUserId}`), {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            const userChat = await userChatResponse.json();
            chatArea.innerHTML = '';
            messageElements = {}; // Clear stored message elements
            messageTimestamps = {}; // Clear stored timestamps

            let hasUnreadMessages = false;
            userChat.forEach(chat => {
                displayMessage(
                    chat.senderId,
                    chat.content,
                    chat.status,
                    chat.id,
                    chat.timeStamp,
                    chat.readTimestamp,
                    chat.messageType || 'TEXT',
                    chat.mediaUrl,
                    chat.fileName
                );
                // Check if there are unread messages from the selected user
                if (chat.senderId === selectedUserId && chat.status !== 'READ') {
                    hasUnreadMessages = true;
                }
            });

            // Send read notification if there are unread messages from the selected user
            if (hasUnreadMessages) {
                sendReadNotification(selectedUserId);
            }

            chatArea.scrollTop = chatArea.scrollHeight;
        } catch (error) {
            console.error('Error fetching chat messages:', error);
        }
    }

    async function sendMessage(event) {
        event.preventDefault();
        const messageContent = messageInput.value.trim();

        // If there's a file selected, upload it first
        if (selectedFile) {
            await sendMediaMessage(messageContent);
            return;
        }

        // Send regular text message
        if (messageContent && stompClient && selectedUserId) {
            const tempId = 'temp-' + Date.now();
            const now = new Date();
            const chatMessage = {
                senderId: username,
                recipientId: selectedUserId,
                content: messageContent,
                timestamp: now,
                messageType: 'TEXT'
            };

            // Display message with SENT status initially
            const msgElement = displayMessage(username, messageContent, 'SENT', tempId, now.toISOString(), null, 'TEXT', null, null);
            messageElements[tempId] = msgElement;

            stompClient.send("/app/chat", {}, JSON.stringify(chatMessage));
            messageInput.value = '';
            chatArea.scrollTop = chatArea.scrollHeight;

            // Refresh contacts list to update last message
            setTimeout(() => {
                findAndDisplayConnectedUsers().then(() => {
                    // Re-apply active state
                    if (selectedUserId) {
                        const selectedUser = document.querySelector(`#user-${CSS.escape(selectedUserId)}`);
                        if (selectedUser) {
                            selectedUser.classList.add('active');
                        }
                    }
                });
            }, 500);
        }
    }

    function onPublicMessageReceived(payload) {
        console.log('Public message received:', payload.body);
        const message = JSON.parse(payload.body);

        // Refresh contacts list when someone connects or disconnects
        findAndDisplayConnectedUsers().then(() => {
            // Re-apply active state if a user was selected
            if (selectedUserId) {
                const selectedUser = document.querySelector(`#user-${CSS.escape(selectedUserId)}`);
                if (selectedUser) {
                    selectedUser.classList.add('active');
                }
            }
        });

        // Show notification for user status change
        if (message.username !== username) {
            const statusText = message.status === 'ONLINE' ? 'is now online' : 'went offline';
            console.log(`${message.fullName} ${statusText}`);
        }
    }

    function onPrivateMessageReceived(payload) {
        console.log('Private message received:', payload.body);
        const message = JSON.parse(payload.body);

        // If the message is from the currently selected user, display it and mark as read
        if (selectedUserId && selectedUserId === message.senderId) {
            displayMessage(
                message.senderId,
                message.content,
                'DELIVERED',
                message.id,
                message.timestamp,
                null,
                message.messageType || 'TEXT',
                message.mediaUrl,
                message.fileName
            );
            chatArea.scrollTop = chatArea.scrollHeight;

            // Send read notification immediately since the chat is open
            sendReadNotification(message.senderId);
        }

        // Refresh contacts list to update last message and order
        findAndDisplayConnectedUsers().then(() => {
            // Re-apply active state if a user was selected
            if (selectedUserId) {
                const selectedUser = document.querySelector(`#user-${CSS.escape(selectedUserId)}`);
                if (selectedUser) {
                    selectedUser.classList.add('active');
                    // Clear badge if it's the selected user
                    if (selectedUserId === message.senderId) {
                        const nbrMsg = selectedUser.querySelector('.nbr-msg');
                        if (nbrMsg) {
                            nbrMsg.classList.add('hidden');
                            nbrMsg.textContent = '0';
                        }
                    }
                }
            }
        });
    }

    // Logout functionality
    if (logout) {
        logout.addEventListener('click', function() {
            if (stompClient) {
                // Send disconnect message
                stompClient.send("/app/user.disconnectUser",
                    {},
                    JSON.stringify({username: username, fullName: fullname, status: 'OFFLINE'})
                );
                stompClient.disconnect();
            }

            localStorage.removeItem('token');
            localStorage.removeItem('username');
            localStorage.removeItem('fullname');

            token = null;
            username = null;
            fullname = null;
            selectedUserId = null;
            messageElements = {};

            chatPage.classList.add('hidden');
            authPage.classList.remove('hidden');

            if (loginForm) loginForm.reset();
            if (registerForm) registerForm.reset();
        });
    }

    // Message form submission
    if (messageForm) {
        messageForm.addEventListener('submit', sendMessage);
    }

    // File attachment functionality
    if (attachBtn && fileInput) {
        attachBtn.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                // Validate file size (50MB max)
                if (file.size > 50 * 1024 * 1024) {
                    alert('File size exceeds 50MB limit');
                    fileInput.value = '';
                    return;
                }

                selectedFile = file;
                filePreviewName.textContent = file.name;
                filePreview.classList.remove('hidden');
            }
        });
    }

    if (cancelFileBtn) {
        cancelFileBtn.addEventListener('click', () => {
            selectedFile = null;
            fileInput.value = '';
            filePreview.classList.add('hidden');
            uploadProgress.classList.add('hidden');
            progressFill.style.width = '0%';
        });
    }

    // Send media message
    async function sendMediaMessage(caption) {
        if (!selectedFile || !stompClient || !selectedUserId) return;

        try {
            // Show upload progress
            uploadProgress.classList.remove('hidden');
            progressFill.style.width = '10%';

            // Show uploading indicator in chat
            const uploadingDiv = document.createElement('div');
            uploadingDiv.classList.add('message', 'sender');
            uploadingDiv.innerHTML = `
                <div class="uploading-indicator">
                    <i class="fas fa-spinner"></i>
                    <span>Uploading ${selectedFile.name}...</span>
                </div>
            `;
            chatArea.appendChild(uploadingDiv);
            chatArea.scrollTop = chatArea.scrollHeight;

            // Upload to Cloudinary via backend
            const formData = new FormData();
            formData.append('file', selectedFile);

            progressFill.style.width = '30%';

            const response = await fetch(buildApiUrl('/api/media/upload'), {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            progressFill.style.width = '70%';

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Upload failed');
            }

            const uploadResult = await response.json();
            progressFill.style.width = '90%';

            // Remove uploading indicator
            uploadingDiv.remove();

            // Send message with media URL via WebSocket
            const tempId = 'temp-' + Date.now();
            const now = new Date();
            const chatMessage = {
                senderId: username,
                recipientId: selectedUserId,
                content: caption || '',
                timestamp: now,
                messageType: uploadResult.messageType,
                mediaUrl: uploadResult.url,
                mediaPublicId: uploadResult.publicId,
                fileName: uploadResult.fileName,
                fileSize: uploadResult.fileSize,
                mimeType: uploadResult.mimeType
            };

            // Display the message locally
            const msgElement = displayMessage(
                username,
                caption || '',
                'SENT',
                tempId,
                now.toISOString(),
                null,
                uploadResult.messageType,
                uploadResult.url,
                uploadResult.fileName
            );
            messageElements[tempId] = msgElement;

            // Send via WebSocket
            stompClient.send("/app/chat", {}, JSON.stringify(chatMessage));

            progressFill.style.width = '100%';

            // Clear file selection
            selectedFile = null;
            fileInput.value = '';
            messageInput.value = '';
            filePreview.classList.add('hidden');

            setTimeout(() => {
                uploadProgress.classList.add('hidden');
                progressFill.style.width = '0%';
            }, 500);

            chatArea.scrollTop = chatArea.scrollHeight;

            // Refresh contacts list
            setTimeout(() => {
                findAndDisplayConnectedUsers().then(() => {
                    if (selectedUserId) {
                        const selectedUser = document.querySelector(`#user-${CSS.escape(selectedUserId)}`);
                        if (selectedUser) {
                            selectedUser.classList.add('active');
                        }
                    }
                });
            }, 500);

        } catch (error) {
            console.error('Error uploading media:', error);
            alert('Failed to upload file: ' + error.message);

            // Remove uploading indicator if exists
            const uploadingIndicator = chatArea.querySelector('.uploading-indicator');
            if (uploadingIndicator) {
                uploadingIndicator.closest('.message').remove();
            }

            // Reset progress
            uploadProgress.classList.add('hidden');
            progressFill.style.width = '0%';
        }
    }

    // Handle page unload - notify server that user is going offline
    window.addEventListener('beforeunload', function() {
        if (stompClient && username) {
            stompClient.send("/app/user.disconnectUser",
                {},
                JSON.stringify({username: username, fullName: fullname, status: 'OFFLINE'})
            );
        }
    });
});
