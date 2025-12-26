package com.project.ChatNexus.chat;

import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;

public interface ChatMessageRepository extends MongoRepository<ChatMessage, String> {

    List<ChatMessage> findByChatId(String s);
    List<ChatMessage> findByRecipientIdAndStatus(String recipientId, MessageStatus status);
    long countByRecipientIdAndSenderIdAndStatus(String recipientId, String senderId, MessageStatus status);
}
