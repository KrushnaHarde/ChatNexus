package com.project.ChatNexus.controller;

import com.project.ChatNexus.dto.response.ChatContactResponse;
import com.project.ChatNexus.dto.response.ChatNotification;
import com.project.ChatNexus.model.ChatMessage;
import com.project.ChatNexus.model.MessageStatus;
import com.project.ChatNexus.service.ChatMessageService;
import com.project.ChatNexus.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;

import java.util.List;
import java.util.Map;

@Controller
@RequiredArgsConstructor
public class ChatController {

    private final ChatMessageService chatMessageService;
    private final SimpMessagingTemplate messagingTemplate;
    private final UserService userService;

    @MessageMapping("/chat")
    public void processMessage(@Payload ChatMessage chatMessage) {
        ChatMessage savedMsg = chatMessageService.save(chatMessage);

        // Only send via WebSocket if recipient is online
        if (userService.isUserOnline(chatMessage.getRecipientId())) {
            // Send message to recipient
            messagingTemplate.convertAndSendToUser(
                    chatMessage.getRecipientId(),
                    "/queue/messages",
                    ChatNotification.builder()
                            .id(savedMsg.getId())
                            .senderId(savedMsg.getSenderId())
                            .recipientId(savedMsg.getRecipientId())
                            .content(savedMsg.getContent())
                            .status(MessageStatus.DELIVERED)
                            .timestamp(savedMsg.getTimeStamp())
                            .messageType(savedMsg.getMessageType())
                            .mediaUrl(savedMsg.getMediaUrl())
                            .fileName(savedMsg.getFileName())
                            .fileSize(savedMsg.getFileSize())
                            .mimeType(savedMsg.getMimeType())
                            .build()
            );

            // Send delivery confirmation back to sender
            messagingTemplate.convertAndSendToUser(
                    chatMessage.getSenderId(),
                    "/queue/status",
                    ChatNotification.builder()
                            .id(savedMsg.getId())
                            .senderId(savedMsg.getSenderId())
                            .recipientId(savedMsg.getRecipientId())
                            .status(MessageStatus.DELIVERED)
                            .timestamp(savedMsg.getTimeStamp())
                            .build()
            );
        }
    }

    @MessageMapping("/chat.read")
    public void markAsRead(@Payload Map<String, String> payload) {
        String senderId = payload.get("senderId");
        String recipientId = payload.get("recipientId");

        List<ChatMessage> readMessages = chatMessageService.markMessagesAsReadAndReturn(senderId, recipientId);

        // Send read confirmation to the original sender if online
        if (userService.isUserOnline(senderId)) {
            readMessages.forEach(msg -> {
                messagingTemplate.convertAndSendToUser(
                        senderId,
                        "/queue/status",
                        ChatNotification.builder()
                                .id(msg.getId())
                                .senderId(msg.getSenderId())
                                .recipientId(msg.getRecipientId())
                                .status(MessageStatus.READ)
                                .timestamp(msg.getTimeStamp())
                                .readTimestamp(msg.getReadTimestamp())
                                .build()
                );
            });
        }
    }

    @GetMapping("/messages/{senderId}/{recipientId}")
    public ResponseEntity<List<ChatMessage>> findChatMessages(
            @PathVariable("senderId") String senderId,
            @PathVariable("recipientId") String recipientId
    ) {
        return ResponseEntity.ok(chatMessageService.findChatMessages(senderId, recipientId));
    }

    @GetMapping("/messages/undelivered/{userId}")
    public ResponseEntity<List<ChatMessage>> getUndeliveredMessages(@PathVariable String userId) {
        List<ChatMessage> undeliveredMessages = chatMessageService.findUndeliveredMessages(userId);

        // Send delivery confirmation to original senders who are online
        undeliveredMessages.forEach(msg -> {
            if (userService.isUserOnline(msg.getSenderId())) {
                messagingTemplate.convertAndSendToUser(
                        msg.getSenderId(),
                        "/queue/status",
                        ChatNotification.builder()
                                .id(msg.getId())
                                .senderId(msg.getSenderId())
                                .recipientId(msg.getRecipientId())
                                .status(MessageStatus.DELIVERED)
                                .build()
                );
            }
        });

        chatMessageService.markMessagesAsDelivered(undeliveredMessages);
        return ResponseEntity.ok(undeliveredMessages);
    }

    @PostMapping("/messages/read/{senderId}/{recipientId}")
    public ResponseEntity<Void> markMessagesAsRead(
            @PathVariable String senderId,
            @PathVariable String recipientId
    ) {
        chatMessageService.markMessagesAsRead(senderId, recipientId);
        return ResponseEntity.ok().build();
    }

    @GetMapping("/contacts/{userId}")
    public ResponseEntity<List<ChatContactResponse>> getChatContacts(@PathVariable String userId) {
        return ResponseEntity.ok(chatMessageService.getChatContacts(userId));
    }
}

