package com.project.ChatNexus.model;

import lombok.*;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.util.Date;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Document(collection = "chat_messages")
public class ChatMessage {
    @Id
    private String id;
    private String chatId;
    private String senderId;
    private String recipientId;
    private String content;
    private Date timeStamp;
    private Date readTimestamp;
    @Builder.Default
    private MessageStatus status = MessageStatus.SENT;

    // Media fields
    @Builder.Default
    private MessageType messageType = MessageType.TEXT;
    private String mediaUrl;
    private String mediaPublicId;
    private String fileName;
    private Long fileSize;
    private String mimeType;
}

