package com.email_writer.controller;

import com.email_writer.fields.EmailResponse;
import com.email_writer.model.IntentResult;
import com.email_writer.service.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/media")
@RequiredArgsConstructor
public class MediaAnalysisController {

    private final MediaAnalysisService mediaService;
    private final EmailGeneratorService emailService;
    private final IntentDetectionService intentService;
    private final DeviceRateLimitService rateLimitService;

    // ── PDF → REPLY ───────────────────────────────────────────
    @PostMapping(value = "/pdf-reply", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<EmailResponse> pdfReply(
            @RequestPart("file") MultipartFile file,
            @RequestParam(defaultValue = "") String emailContext,
            @RequestParam(defaultValue = "professional") String tone,
            @RequestParam(defaultValue = "medium") String replyLength,
            @RequestParam(defaultValue = "") String customPrompt,
            @RequestParam(defaultValue = "nm-local") String deviceId) {
        try {
            rateLimitService.checkRateLimit(deviceId);
            String pdfText = mediaService.extractPdfText(file);
            IntentResult ir = intentService.detect(pdfText);

            String prompt = "You are an expert email assistant.\n\n"
                    + "PDF Content:\n" + pdfText + "\n\n"
                    + (emailContext.isBlank() ? "" : "Email context: " + emailContext + "\n\n")
                    + "Write a " + tone + " email reply acknowledging the PDF content. Length: " + replyLength + ".\n"
                    + (customPrompt.isBlank() ? "" : "Extra instruction: " + customPrompt + "\n")
                    + "\nReturn only the email reply.";

            String reply = emailService.callGroq(prompt);
            EmailResponse resp = EmailResponse.ok(reply);
            resp.setIntent(ir.getIntent());
            resp.setIntentReason("Detected from PDF content");
            resp.setKeywordsFound(ir.getKeywordsFound());
            resp.setPromptUsed("PDF-aware template");
            return ResponseEntity.ok(resp);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(EmailResponse.fail(e.getMessage()));
        }
    }

    // ── IMAGE → REPLY ─────────────────────────────────────────
    @PostMapping(value = "/image-reply", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<EmailResponse> imageReply(
            @RequestPart("file") MultipartFile file,
            @RequestParam(defaultValue = "") String emailContext,
            @RequestParam(defaultValue = "professional") String tone,
            @RequestParam(defaultValue = "medium") String replyLength,
            @RequestParam(defaultValue = "") String customPrompt,
            @RequestParam(defaultValue = "nm-local") String deviceId) {
        try {
            rateLimitService.checkRateLimit(deviceId);
            String imageDesc = mediaService.analyzeImage(file);

            String prompt = "You are an expert email assistant.\n\n"
                    + "Image Description: " + imageDesc + "\n\n"
                    + (emailContext.isBlank() ? "" : "Email context: " + emailContext + "\n\n")
                    + "Write a " + tone + " email reply acknowledging the image content. Length: " + replyLength + ".\n"
                    + (customPrompt.isBlank() ? "" : "Extra instruction: " + customPrompt + "\n")
                    + "\nReturn only the email reply.";

            String reply = emailService.callGroq(prompt);
            EmailResponse resp = EmailResponse.ok(reply);
            resp.setIntent("Image");
            resp.setIntentReason("Analyzed via Gemini Vision");
            resp.setPromptUsed("Image-aware template");
            return ResponseEntity.ok(resp);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(EmailResponse.fail(e.getMessage()));
        }
    }

    // ── AUDIO → REPLY ─────────────────────────────────────────
    @PostMapping(value = "/audio-reply", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<EmailResponse> audioReply(
            @RequestPart("file") MultipartFile file,
            @RequestParam(defaultValue = "") String emailContext,
            @RequestParam(defaultValue = "professional") String tone,
            @RequestParam(defaultValue = "medium") String replyLength,
            @RequestParam(defaultValue = "nm-local") String deviceId) {
        try {
            rateLimitService.checkRateLimit(deviceId);
            String transcript = mediaService.transcribeAudio(file);
            IntentResult ir = intentService.detect(transcript);

            String prompt = "You are an expert email assistant.\n\n"
                    + "Audio transcript: " + transcript + "\n\n"
                    + (emailContext.isBlank() ? "" : "Email context: " + emailContext + "\n\n")
                    + "Write a " + tone + " email reply based on the audio content. Length: " + replyLength + ".\n"
                    + "\nReturn only the email reply.";

            String reply = emailService.callGroq(prompt);
            EmailResponse resp = EmailResponse.ok(reply);
            resp.setIntent(ir.getIntent());
            resp.setIntentReason("Transcribed via Groq Whisper");
            resp.setPromptUsed("Audio-aware template");
            return ResponseEntity.ok(resp);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(EmailResponse.fail(e.getMessage()));
        }
    }

    // ── EXTRACT ONLY ──────────────────────────────────────────
    @PostMapping(value = "/extract-pdf", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<EmailResponse> extractPdf(@RequestPart("file") MultipartFile file) {
        try { return ResponseEntity.ok(EmailResponse.ok(mediaService.extractPdfText(file))); }
        catch (Exception e) { return ResponseEntity.internalServerError().body(EmailResponse.fail(e.getMessage())); }
    }

    @PostMapping(value = "/analyze-image", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<EmailResponse> analyzeImage(@RequestPart("file") MultipartFile file) {
        try { return ResponseEntity.ok(EmailResponse.ok(mediaService.analyzeImage(file))); }
        catch (Exception e) { return ResponseEntity.internalServerError().body(EmailResponse.fail(e.getMessage())); }
    }

    @PostMapping(value = "/transcribe-audio", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<EmailResponse> transcribeAudio(@RequestPart("file") MultipartFile file) {
        try { return ResponseEntity.ok(EmailResponse.ok(mediaService.transcribeAudio(file))); }
        catch (Exception e) { return ResponseEntity.internalServerError().body(EmailResponse.fail(e.getMessage())); }
    }
}
