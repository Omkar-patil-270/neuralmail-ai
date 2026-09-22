package com.email_writer.service;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.reactive.function.BodyInserters;
import org.springframework.web.reactive.function.client.WebClient;

import java.io.IOException;
import java.util.Base64;
import java.util.List;
import java.util.Map;

@Service
public class MediaAnalysisService {

    @Value("${gemini.api.key:}") private String geminiApiKey;
    @Value("${groq.api.key:dummy}") private String groqApiKey;

    // ── PDF TEXT EXTRACTION ───────────────────────────────────
    public String extractPdfText(MultipartFile file) throws IOException {
        if (file == null || file.isEmpty())
            throw new IllegalArgumentException("PDF file is empty");
        try (PDDocument doc = Loader.loadPDF(file.getBytes())) {
            PDFTextStripper stripper = new PDFTextStripper();
            String text = stripper.getText(doc);
            if (text == null || text.isBlank())
                return "PDF has no extractable text (may be scanned image).";
            return text.length() > 3000 ? text.substring(0, 3000) + "...[truncated]" : text;
        }
    }

    // ── IMAGE ANALYSIS VIA GEMINI ─────────────────────────────
    public String analyzeImage(MultipartFile file) throws IOException {
        if (file == null || file.isEmpty())
            throw new IllegalArgumentException("Image file is empty");
        if (geminiApiKey == null || geminiApiKey.isBlank())
            return "Image received. Add GEMINI_API_KEY to use image analysis.";

        String base64 = Base64.getEncoder().encodeToString(file.getBytes());
        String mime   = file.getContentType() != null ? file.getContentType() : "image/jpeg";

        Map<String, Object> body = Map.of("contents", List.of(Map.of("parts", List.of(
            Map.of("text", "Describe this image in detail. Focus on text, charts, documents, or content relevant for an email reply."),
            Map.of("inline_data", Map.of("mime_type", mime, "data", base64))
        ))));

        try {
            WebClient client = WebClient.builder()
                    .baseUrl("https://generativelanguage.googleapis.com/v1beta").build();
            var resp = client.post()
                    .uri("/models/gemini-1.5-flash:generateContent?key=" + geminiApiKey)
                    .header("Content-Type", "application/json")
                    .bodyValue(body).retrieve().bodyToMono(Map.class).block();

            if (resp != null && resp.containsKey("candidates")) {
                var candidates = (List<?>) resp.get("candidates");
                if (!candidates.isEmpty()) {
                    var content = (Map<?, ?>) ((Map<?, ?>) candidates.get(0)).get("content");
                    var parts   = (List<?>) content.get("parts");
                    if (!parts.isEmpty())
                        return (String) ((Map<?, ?>) parts.get(0)).get("text");
                }
            }
        } catch (Exception e) {
            return "Image analysis failed: " + e.getMessage();
        }
        return "Could not analyze image.";
    }

    // ── AUDIO TRANSCRIPTION VIA GROQ WHISPER ─────────────────
    public String transcribeAudio(MultipartFile file) throws IOException {
        if (file == null || file.isEmpty())
            throw new IllegalArgumentException("Audio file is empty");

        String filename = file.getOriginalFilename() != null ? file.getOriginalFilename() : "audio.mp3";
        ByteArrayResource resource = new ByteArrayResource(file.getBytes()) {
            @Override public String getFilename() { return filename; }
        };

        MultipartBodyBuilder builder = new MultipartBodyBuilder();
        builder.part("file", resource).filename(filename);
        builder.part("model", "whisper-large-v3");
        builder.part("response_format", "text");

        try {
            WebClient client = WebClient.builder().baseUrl("https://api.groq.com").build();
            String resp = client.post()
                    .uri("/openai/v1/audio/transcriptions")
                    .header("Authorization", "Bearer " + groqApiKey)
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(BodyInserters.fromMultipartData(builder.build()))
                    .retrieve().bodyToMono(String.class).block();
            return resp != null ? resp.trim() : "Transcription empty.";
        } catch (Exception e) {
            return "Audio transcription failed: " + e.getMessage();
        }
    }
}
