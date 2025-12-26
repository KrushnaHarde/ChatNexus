package com.project.ChatNexus.chat;

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
}
