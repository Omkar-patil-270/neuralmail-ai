package com.email_writer.model;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
@Data
@NoArgsConstructor
@AllArgsConstructor
public class EmailRequest {
    private String emailContent;
    private String threadContext;
    private String tone;
    private String replyLength;
    private String customPrompt;
    private String deviceId;
    private String intentMode;
    private String mediaContent;   // extracted PDF text or image description
    private String mediaType;      // "pdf", "image", "audio"
}
