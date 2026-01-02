package com.project.ChatNexus.controller;

import com.project.ChatNexus.dto.response.MediaUploadResponse;
import com.project.ChatNexus.model.MessageType;
import com.project.ChatNexus.service.CloudinaryService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Map;

@RestController
@RequestMapping("/api/media")
@RequiredArgsConstructor
public class MediaController {

    private final CloudinaryService cloudinaryService;

    /**
     * Upload media file to Cloudinary
     * Supports: Images (jpg, jpeg, png, gif, webp, bmp)
     *           Videos (mp4, mov, avi, mkv, webm)
     *           Audio (mp3, wav, ogg, m4a, aac)
     */
    @PostMapping("/upload")
    public ResponseEntity<?> uploadMedia(@RequestParam("file") MultipartFile file) {
        try {
            // Validate file
            if (file.isEmpty()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Please select a file to upload"));
            }

            // Check file size (50MB max)
            if (file.getSize() > 50 * 1024 * 1024) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "File size exceeds maximum limit of 50MB"));
            }

            // Check if file type is allowed
            if (!cloudinaryService.isFileAllowed(file.getOriginalFilename())) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "File type not supported. Allowed: " + cloudinaryService.getAllowedExtensions()));
            }

            // Upload to Cloudinary
            Map<String, Object> uploadResult = cloudinaryService.uploadFile(file);

            MediaUploadResponse response = MediaUploadResponse.builder()
                    .url((String) uploadResult.get("url"))
                    .publicId((String) uploadResult.get("publicId"))
                    .messageType((MessageType) uploadResult.get("messageType"))
                    .fileName((String) uploadResult.get("fileName"))
                    .fileSize((Long) uploadResult.get("fileSize"))
                    .mimeType((String) uploadResult.get("mimeType"))
                    .build();

            return ResponseEntity.ok(response);

        } catch (IOException e) {
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Failed to upload file: " + e.getMessage()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Get allowed file extensions
     */
    @GetMapping("/allowed-extensions")
    public ResponseEntity<?> getAllowedExtensions() {
        return ResponseEntity.ok(Map.of("extensions", cloudinaryService.getAllowedExtensions()));
    }
}

