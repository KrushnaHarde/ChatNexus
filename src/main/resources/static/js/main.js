'use strict';

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

    let stompClient = null;
    let username = null;
    let fullname = null;
    let token = null;
    let selectedUserId = null;
    let isLoginMode = true;

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
                const response = await fetch('/api/auth/login', {
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
                const response = await fetch('/api/auth/register', {
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

        const socket = new SockJS('/ws');
        stompClient = Stomp.over(socket);
        stompClient.debug = null; // Disable debug logs

        stompClient.connect({}, onConnected, onError);
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
            const response = await fetch(`/messages/undelivered/${username}`, {
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
            const connectedUsersResponse = await fetch('/users', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            let connectedUsers = await connectedUsersResponse.json();
            connectedUsers = connectedUsers.filter(user => user.username !== username);
            const connectedUsersList = document.getElementById('connectedUsers');
            connectedUsersList.innerHTML = '';

            if (connectedUsers.length === 0) {
                const emptyMsg = document.createElement('li');
                emptyMsg.classList.add('no-users');
                emptyMsg.textContent = 'No users online';
                emptyMsg.style.color = '#8892b0';
                emptyMsg.style.textAlign = 'center';
                emptyMsg.style.padding = '20px';
                connectedUsersList.appendChild(emptyMsg);
            } else {
                connectedUsers.forEach((user, index) => {
                    appendUserElement(user, connectedUsersList);
                    if (index < connectedUsers.length - 1) {
                        const separator = document.createElement('li');
                        separator.classList.add('separator');
                        connectedUsersList.appendChild(separator);
                    }
                });
            }
        } catch (error) {
            console.error('Error fetching connected users:', error);
        }
    }

    function appendUserElement(user, connectedUsersList) {
        const listItem = document.createElement('li');
        listItem.classList.add('user-item');
        listItem.id = `user-${user.username}`;
        listItem.dataset.username = user.username;

        const userImage = document.createElement('img');
        userImage.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.fullName)}&background=667eea&color=fff&size=42`;
        userImage.alt = user.fullName;

        const usernameSpan = document.createElement('span');
        usernameSpan.textContent = user.fullName;

        // Online status indicator
        const statusIndicator = document.createElement('span');
        statusIndicator.classList.add('status-indicator', 'online');

        const receivedMsgs = document.createElement('span');
        receivedMsgs.textContent = '0';
        receivedMsgs.classList.add('nbr-msg', 'hidden');

        listItem.appendChild(userImage);
        listItem.appendChild(usernameSpan);
        listItem.appendChild(statusIndicator);
        listItem.appendChild(receivedMsgs);

        listItem.addEventListener('click', userItemClick);

        connectedUsersList.appendChild(listItem);
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

        const selectedUserName = clickedUser.querySelector('span').textContent;
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
    }

    function displayMessage(senderId, content, status = 'DELIVERED', messageId = null, timestamp = null, readTimestamp = null) {
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

        const message = document.createElement('p');
        message.textContent = content;
        messageContainer.appendChild(message);

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
            const userChatResponse = await fetch(`/messages/${username}/${selectedUserId}`, {
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
                displayMessage(chat.senderId, chat.content, chat.status, chat.id, chat.timeStamp, chat.readTimestamp);
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

    function sendMessage(event) {
        event.preventDefault();
        const messageContent = messageInput.value.trim();
        if (messageContent && stompClient && selectedUserId) {
            const tempId = 'temp-' + Date.now();
            const now = new Date();
            const chatMessage = {
                senderId: username,
                recipientId: selectedUserId,
                content: messageContent,
                timestamp: now
            };

            // Display message with SENT status initially
            const msgElement = displayMessage(username, messageContent, 'SENT', tempId, now.toISOString(), null);
            messageElements[tempId] = msgElement;

            stompClient.send("/app/chat", {}, JSON.stringify(chatMessage));
            messageInput.value = '';
            chatArea.scrollTop = chatArea.scrollHeight;
        }
    }

    function onPublicMessageReceived(payload) {
        console.log('Public message received:', payload.body);
        const message = JSON.parse(payload.body);

        // Refresh user list when someone connects or disconnects
        findAndDisplayConnectedUsers().then(() => {
            // Re-apply active state if a user was selected
            if (selectedUserId) {
                const selectedUser = document.querySelector(`#user-${CSS.escape(selectedUserId)}`);
                if (selectedUser) {
                    selectedUser.classList.add('active');
                }
            }

            // Re-fetch undelivered messages to update badges
            fetchUndeliveredMessages();
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
            displayMessage(message.senderId, message.content, 'DELIVERED', message.id, message.timestamp, null);
            chatArea.scrollTop = chatArea.scrollHeight;

            // Send read notification immediately since the chat is open
            sendReadNotification(message.senderId);
        } else {
            // Show notification badge for the sender
            updateNotificationBadge(message.senderId, 1);
        }
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
