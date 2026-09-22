package com.email_writer.controller;

import com.email_writer.fields.DualReplyResponse;
import com.email_writer.fields.EmailResponse;
import com.email_writer.model.EmailRequest;
import com.email_writer.model.IntentResult;
import com.email_writer.service.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/email")
@RequiredArgsConstructor
public class EmailGeneratorController {

    private final EmailGeneratorService emailService;
    private final IntentDetectionService intentService;
    private final PromptBuilderService promptBuilder;
    private final DeviceRateLimitService rateLimitService;
    private final ResearchEvaluationService evaluationService;

    @GetMapping("/health")
    public ResponseEntity<String> health() { return ResponseEntity.ok("ok"); }

    @GetMapping("/rate-status")
    public ResponseEntity<EmailResponse> rateStatus(@RequestParam String deviceId) {
        try {
            return ResponseEntity.ok(EmailResponse.ok(String.valueOf(rateLimitService.getRemaining(deviceId))));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(EmailResponse.fail(e.getMessage()));
        }
    }

    @PostMapping("/dual-reply")
    public ResponseEntity<DualReplyResponse> dualReply(@RequestBody EmailRequest req) {
        try {
            if (blank(req.getEmailContent()) && blank(req.getMediaContent()))
                return ResponseEntity.badRequest().body(DualReplyResponse.fail("emailContent or mediaContent is required"));
            rateLimitService.checkRateLimit(req.getDeviceId());
            if (promptBuilder.containsInjection(req.getEmailContent()) || promptBuilder.containsInjection(req.getMediaContent()))
                return ResponseEntity.badRequest().body(DualReplyResponse.fail("Prompt injection detected"));

            IntentResult ir = intentService.detect(req.getEmailContent(), req.getMediaContent());
            String baselineReply = emailService.callGroq(promptBuilder.buildBaselinePrompt(
                    req.getEmailContent(), req.getThreadContext(), req.getMediaContent(), req.getMediaType()));
            String proposedReply = emailService.callGroq(promptBuilder.buildProposedPrompt(
                    req.getEmailContent(), ir.getIntent(), req.getTone(), req.getReplyLength(),
                    req.getThreadContext(), req.getMediaContent(), req.getMediaType()));

            ResearchEvaluationService.EvaluationResult eval = evaluationService.evaluate(
                    baselineReply, proposedReply, ir.getIntent(), req.getMediaContent());

            emailService.saveComparison(req.getEmailContent(), req.getThreadContext(),
                    ir.getIntent(), ir.getReason(), ir.getKeywordsFound(), baselineReply, proposedReply,
                    req.getMediaContent(), eval);

            return ResponseEntity.ok(DualReplyResponse.ok(ir.getIntent(), ir.getReason(),
                    ir.getKeywordsFound(), ir.getPromptLabel(), baselineReply, proposedReply));
        } catch (RuntimeException e) {
            return ResponseEntity.internalServerError().body(DualReplyResponse.fail(e.getMessage()));
        }
    }

    @PostMapping("/reply")
    public ResponseEntity<EmailResponse> generateReply(@RequestBody EmailRequest req) {
        try {
            if (blank(req.getEmailContent()) && blank(req.getMediaContent()))
                return ResponseEntity.badRequest().body(EmailResponse.fail("emailContent or mediaContent is required"));
            rateLimitService.checkRateLimit(req.getDeviceId());
            if (promptBuilder.containsInjection(req.getEmailContent()) || promptBuilder.containsInjection(req.getMediaContent()))
                return ResponseEntity.badRequest().body(EmailResponse.fail("Prompt injection detected"));

            IntentResult ir = intentService.detect(req.getEmailContent(), req.getMediaContent());
            String mode = req.getIntentMode() != null ? req.getIntentMode() : "proposed";
            String prompt = mode.equals("baseline")
                    ? promptBuilder.buildBaselinePrompt(req.getEmailContent(), req.getThreadContext(), req.getMediaContent(), req.getMediaType(), req.getCustomPrompt())
                    : promptBuilder.buildProposedPrompt(req.getEmailContent(), ir.getIntent(),
                        req.getTone(), req.getReplyLength(), req.getThreadContext(), req.getMediaContent(), req.getMediaType(), req.getCustomPrompt());

            String reply = emailService.callGroq(prompt);
            EmailResponse resp = EmailResponse.ok(reply);
            resp.setIntent(ir.getIntent());
            resp.setIntentMode(mode);
            resp.setIntentReason(ir.getReason());
            resp.setKeywordsFound(ir.getKeywordsFound());
            resp.setPromptUsed(ir.getPromptLabel());
            return ResponseEntity.ok(resp);
        } catch (RuntimeException e) {
            return ResponseEntity.internalServerError().body(EmailResponse.fail(e.getMessage()));
        }
    }

    @PostMapping("/decode-subtext")
    public ResponseEntity<EmailResponse> decodeSubtext(@RequestBody EmailRequest req) {
        try {
            if (blank(req.getEmailContent()))
                return ResponseEntity.badRequest().body(EmailResponse.fail("emailContent is required"));
            rateLimitService.checkRateLimit(req.getDeviceId());
            return ResponseEntity.ok(EmailResponse.ok(emailService.decodeSubtext(req)));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(EmailResponse.fail(e.getMessage()));
        }
    }

    @PostMapping("/psych-radar")
    public ResponseEntity<EmailResponse> psychRadar(@RequestBody EmailRequest req) {
        try {
            if (blank(req.getEmailContent()))
                return ResponseEntity.badRequest().body(EmailResponse.fail("emailContent is required"));
            rateLimitService.checkRateLimit(req.getDeviceId());
            return ResponseEntity.ok(EmailResponse.ok(emailService.analyzePsychRadar(req)));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(EmailResponse.fail(e.getMessage()));
        }
    }

    @PostMapping("/negotiate")
    public ResponseEntity<EmailResponse> negotiate(@RequestBody EmailRequest req) {
        try {
            if (blank(req.getEmailContent()))
                return ResponseEntity.badRequest().body(EmailResponse.fail("emailContent is required"));
            rateLimitService.checkRateLimit(req.getDeviceId());
            String strategy = req.getCustomPrompt() != null ? req.getCustomPrompt() : "SALARY_COUNTER";
            return ResponseEntity.ok(EmailResponse.ok(emailService.negotiateDeal(req, strategy)));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(EmailResponse.fail(e.getMessage()));
        }
    }

    @PostMapping("/cultural-diplomat")
    public ResponseEntity<EmailResponse> culturalDiplomat(@RequestBody EmailRequest req) {
        try {
            if (blank(req.getEmailContent()))
                return ResponseEntity.badRequest().body(EmailResponse.fail("emailContent is required"));
            rateLimitService.checkRateLimit(req.getDeviceId());
            String culture = req.getTone() != null ? req.getTone() : "JAPAN";
            return ResponseEntity.ok(EmailResponse.ok(emailService.culturalDiplomat(req, culture)));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(EmailResponse.fail(e.getMessage()));
        }
    }

    @PostMapping("/rewrite")
    public ResponseEntity<EmailResponse> rewriteEmail(@RequestBody EmailRequest req) {
        try {
            if (blank(req.getEmailContent()))
                return ResponseEntity.badRequest().body(EmailResponse.fail("emailContent is required"));
            rateLimitService.checkRateLimit(req.getDeviceId());
            return ResponseEntity.ok(EmailResponse.ok(emailService.rewriteEmail(req)));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(EmailResponse.fail(e.getMessage()));
        }
    }

    @PostMapping("/improve")
    public ResponseEntity<EmailResponse> improveEmail(@RequestBody EmailRequest req) {
        try {
            if (blank(req.getEmailContent()))
                return ResponseEntity.badRequest().body(EmailResponse.fail("emailContent is required"));
            rateLimitService.checkRateLimit(req.getDeviceId());
            return ResponseEntity.ok(EmailResponse.ok(emailService.improveEmail(req)));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(EmailResponse.fail(e.getMessage()));
        }
    }

    @PostMapping("/summarize")
    public ResponseEntity<EmailResponse> summarizeEmail(@RequestBody EmailRequest req) {
        try {
            if (blank(req.getEmailContent()))
                return ResponseEntity.badRequest().body(EmailResponse.fail("emailContent is required"));
            rateLimitService.checkRateLimit(req.getDeviceId());
            return ResponseEntity.ok(EmailResponse.ok(emailService.summarizeEmail(req)));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(EmailResponse.fail(e.getMessage()));
        }
    }

    @PostMapping("/followup")
    public ResponseEntity<EmailResponse> followupEmail(@RequestBody EmailRequest req) {
        try {
            if (blank(req.getEmailContent()))
                return ResponseEntity.badRequest().body(EmailResponse.fail("emailContent is required"));
            rateLimitService.checkRateLimit(req.getDeviceId());
            return ResponseEntity.ok(EmailResponse.ok(emailService.generateFollowUpEmail(req)));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(EmailResponse.fail(e.getMessage()));
        }
    }

    @GetMapping("/research/benchmarks")
    public ResponseEntity<java.util.Map<String, Object>> getResearchBenchmarks() {
        var records = emailService.getAllComparisons();
        var stats = new java.util.LinkedHashMap<String, Object>();
        stats.put("totalSamples", records.size());

        if (records.isEmpty()) {
            stats.put("message", "No comparison samples logged yet. Use /dual-reply to collect benchmark data.");
            return ResponseEntity.ok(stats);
        }

        double avgBaselineWords = records.stream()
                .filter(r -> r.getBaselineWordCount() != null)
                .mapToInt(com.email_writer.model.ComparisonRecord::getBaselineWordCount)
                .average().orElse(0.0);
        double avgProposedWords = records.stream()
                .filter(r -> r.getProposedWordCount() != null)
                .mapToInt(com.email_writer.model.ComparisonRecord::getProposedWordCount)
                .average().orElse(0.0);
        double avgReduction = records.stream()
                .filter(r -> r.getWordReductionRatio() != null)
                .mapToDouble(com.email_writer.model.ComparisonRecord::getWordReductionRatio)
                .average().orElse(0.0);
        double avgBaselineEase = records.stream()
                .filter(r -> r.getBaselineReadability() != null)
                .mapToDouble(com.email_writer.model.ComparisonRecord::getBaselineReadability)
                .average().orElse(0.0);
        double avgProposedEase = records.stream()
                .filter(r -> r.getProposedReadability() != null)
                .mapToDouble(com.email_writer.model.ComparisonRecord::getProposedReadability)
                .average().orElse(0.0);
        double avgIntentScore = records.stream()
                .filter(r -> r.getIntentAlignmentScore() != null)
                .mapToDouble(com.email_writer.model.ComparisonRecord::getIntentAlignmentScore)
                .average().orElse(0.0);

        stats.put("averageBaselineWordCount", Math.round(avgBaselineWords * 10.0) / 10.0);
        stats.put("averageProposedWordCount", Math.round(avgProposedWords * 10.0) / 10.0);
        stats.put("averageBrevityImprovementPercent", Math.round(avgReduction * 10.0) / 10.0);
        stats.put("averageBaselineFleschEase", Math.round(avgBaselineEase * 10.0) / 10.0);
        stats.put("averageProposedFleschEase", Math.round(avgProposedEase * 10.0) / 10.0);
        stats.put("averageIntentAlignmentScore", Math.round(avgIntentScore * 100.0) / 100.0);

        var byIntent = records.stream()
                .filter(r -> r.getDetectedIntent() != null)
                .collect(java.util.stream.Collectors.groupingBy(
                        com.email_writer.model.ComparisonRecord::getDetectedIntent,
                        java.util.stream.Collectors.counting()
                ));
        stats.put("intentDistribution", byIntent);

        return ResponseEntity.ok(stats);
    }

    private boolean blank(String s) { return s == null || s.isBlank(); }
}
