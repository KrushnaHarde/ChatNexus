package com.project.ChatNexus.dto.response;

import com.project.ChatNexus.model.MessageType;
import lombok.*;

@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
@Builder
public class MediaUploadResponse {
    private String url;
    private String publicId;
    private MessageType messageType;
    private String fileName;
    private Long fileSize;
    private String mimeType;
}

