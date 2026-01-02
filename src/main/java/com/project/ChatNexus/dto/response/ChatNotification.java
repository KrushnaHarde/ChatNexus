package com.project.ChatNexus.dto.response;

import com.project.ChatNexus.model.MessageStatus;
import com.project.ChatNexus.model.MessageType;
import lombok.*;

import java.util.Date;

@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
@Builder
public class ChatNotification {
    private String id;
    private String senderId;
    private String recipientId;
    private String content;
    private MessageStatus status;
    private Date timestamp;
    private Date readTimestamp;

    // Media fields
    @Builder.Default
    private MessageType messageType = MessageType.TEXT;
    private String mediaUrl;
    private String fileName;
    private Long fileSize;
    private String mimeType;
}

