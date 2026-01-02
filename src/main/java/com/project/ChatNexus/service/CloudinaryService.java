package com.project.ChatNexus.service;

import com.cloudinary.Cloudinary;
import com.cloudinary.utils.ObjectUtils;
import com.project.ChatNexus.model.MessageType;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
@Slf4j
public class CloudinaryService {

    private final Cloudinary cloudinary;

    // Allowed file extensions
    private static final List<String> ALLOWED_IMAGE_EXTENSIONS = Arrays.asList("jpg", "jpeg", "png", "gif", "webp", "bmp");
    private static final List<String> ALLOWED_VIDEO_EXTENSIONS = Arrays.asList("mp4", "mov", "avi", "mkv", "webm");
    private static final List<String> ALLOWED_AUDIO_EXTENSIONS = Arrays.asList("mp3", "wav", "ogg", "m4a", "aac");

    /**
     * Upload file to Cloudinary
     * @param file the file to upload
     * @return Map containing url and publicId
     */
    public Map<String, Object> uploadFile(MultipartFile file) throws IOException {
        String originalFilename = file.getOriginalFilename();
        String extension = getFileExtension(originalFilename).toLowerCase();
        MessageType messageType = getMessageType(extension);

        if (messageType == null) {
            throw new IllegalArgumentException("File type not supported: " + extension);
        }

        Map<String, Object> uploadParams = new HashMap<>();
        uploadParams.put("folder", "chat_nexus/" + messageType.name().toLowerCase());

        // Set resource type based on file type
        String resourceType = switch (messageType) {
            case IMAGE -> "image";
            case VIDEO -> "video";
            case AUDIO -> "video"; // Cloudinary treats audio as video resource type
            default -> "auto";
        };
        uploadParams.put("resource_type", resourceType);

        // Add unique identifier to prevent duplicates
        uploadParams.put("unique_filename", true);
        uploadParams.put("overwrite", false);

        @SuppressWarnings("unchecked")
        Map<String, Object> uploadResult = cloudinary.uploader().upload(file.getBytes(), uploadParams);

        Map<String, Object> result = new HashMap<>();
        result.put("url", uploadResult.get("secure_url"));
        result.put("publicId", uploadResult.get("public_id"));
        result.put("messageType", messageType);
        result.put("fileName", originalFilename);
        result.put("fileSize", file.getSize());
        result.put("mimeType", file.getContentType());

        log.info("File uploaded successfully: {}", uploadResult.get("secure_url"));
        return result;
    }

    /**
     * Delete file from Cloudinary
     * @param publicId the public ID of the file to delete
     * @param resourceType the type of resource (image, video, raw)
     */
    public void deleteFile(String publicId, String resourceType) throws IOException {
        cloudinary.uploader().destroy(publicId, ObjectUtils.asMap("resource_type", resourceType));
        log.info("File deleted successfully: {}", publicId);
    }

    /**
     * Get the file extension from filename
     */
    private String getFileExtension(String filename) {
        if (filename == null || filename.isEmpty()) {
            return "";
        }
        int lastDotIndex = filename.lastIndexOf('.');
        if (lastDotIndex == -1) {
            return "";
        }
        return filename.substring(lastDotIndex + 1);
    }

    /**
     * Determine MessageType based on file extension
     */
    public MessageType getMessageType(String extension) {
        if (ALLOWED_IMAGE_EXTENSIONS.contains(extension.toLowerCase())) {
            return MessageType.IMAGE;
        } else if (ALLOWED_VIDEO_EXTENSIONS.contains(extension.toLowerCase())) {
            return MessageType.VIDEO;
        } else if (ALLOWED_AUDIO_EXTENSIONS.contains(extension.toLowerCase())) {
            return MessageType.AUDIO;
        }
        return null;
    }

    /**
     * Check if file extension is allowed
     */
    public boolean isFileAllowed(String filename) {
        String extension = getFileExtension(filename).toLowerCase();
        return ALLOWED_IMAGE_EXTENSIONS.contains(extension)
                || ALLOWED_VIDEO_EXTENSIONS.contains(extension)
                || ALLOWED_AUDIO_EXTENSIONS.contains(extension);
    }

    /**
     * Get allowed file extensions as comma-separated string
     */
    public String getAllowedExtensions() {
        StringBuilder sb = new StringBuilder();
        ALLOWED_IMAGE_EXTENSIONS.forEach(ext -> sb.append(".").append(ext).append(","));
        ALLOWED_VIDEO_EXTENSIONS.forEach(ext -> sb.append(".").append(ext).append(","));
        ALLOWED_AUDIO_EXTENSIONS.forEach(ext -> sb.append(".").append(ext).append(","));
        return sb.substring(0, sb.length() - 1);
    }
}

