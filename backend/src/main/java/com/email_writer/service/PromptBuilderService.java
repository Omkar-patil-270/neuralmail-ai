package com.email_writer.service;

import org.springframework.stereotype.Service;
import java.util.Arrays;

@Service
public class PromptBuilderService {

    // ── PROMPT INJECTION DETECTION ────────────────────────────
    private static final String[] INJECTION_PATTERNS = {
            "ignore previous instructions", "ignore all instructions",
            "forget your instructions", "act as", "you are now",
            "new persona", "system prompt", "jailbreak", "do not follow",
            "override", "disregard", "prompt:", "###instruction",
            "[system]", "<s>", "you must now", "pretend you are"
    };

    public boolean containsInjection(String text) {
        if (text == null) return false;
        String lower = text.toLowerCase();
        return Arrays.stream(INJECTION_PATTERNS).anyMatch(lower::contains);
    }

    // ── BASELINE PROMPT (single generic — for comparison) ─────
    public String buildBaselinePrompt(String emailContent, String threadContext) {
        return buildBaselinePrompt(emailContent, threadContext, null, null, null);
    }

    public String buildBaselinePrompt(String emailContent, String threadContext,
                                      String mediaContent, String mediaType) {
        return buildBaselinePrompt(emailContent, threadContext, mediaContent, mediaType, null);
    }

    public String buildBaselinePrompt(String emailContent, String threadContext,
                                      String mediaContent, String mediaType,
                                      String customPrompt) {
        String context = buildThreadBlock(threadContext);
        String media   = buildMediaBlock(mediaContent, mediaType);
        String custom  = (customPrompt != null && !customPrompt.isBlank())
                ? "\nMUST FOLLOW USER INSTRUCTION: " + customPrompt + "\n" : "";
        return "Write a professional email reply to the following email.\n"
                + "Output ONLY the email body. No subject line. No preamble.\n"
                + custom
                + context
                + media
                + "\nEmail:\n" + emailContent;
    }

    // ── PROPOSED PROMPT (intent-aware — core novelty) ─────────
    public String buildProposedPrompt(String emailContent, String intent,
                                      String tone, String replyLength,
                                      String threadContext) {
        return buildProposedPrompt(emailContent, intent, tone, replyLength, threadContext, null, null, null);
    }

    public String buildProposedPrompt(String emailContent, String intent,
                                      String tone, String replyLength,
                                      String threadContext,
                                      String mediaContent, String mediaType) {
        return buildProposedPrompt(emailContent, intent, tone, replyLength, threadContext, mediaContent, mediaType, null);
    }

    public String buildProposedPrompt(String emailContent, String intent,
                                      String tone, String replyLength,
                                      String threadContext,
                                      String mediaContent, String mediaType,
                                      String customPrompt) {
        String toneDesc   = resolveTone(tone);
        String lengthDesc = resolveLength(replyLength);
        String context    = buildThreadBlock(threadContext);
        String media      = buildMediaBlock(mediaContent, mediaType);
        String custom     = (customPrompt != null && !customPrompt.isBlank())
                ? "\n- Additional User Guideline: " + customPrompt + "\n" : "";
        String intentBlock = switch (intent) {
            case "MEETING" -> """
                This email is about scheduling or meetings.
                - Confirm or propose availability with a specific time/date
                - Suggest a platform if relevant (Zoom, Teams, in-person)
                - Close with a clear next step
                """;
            case "JOB" -> """
                This email is job or career related.
                - Show genuine interest and motivation
                - Briefly highlight 1-2 relevant strengths
                - Close with availability for next steps
                """;
            case "URGENT" -> """
                This email requires urgent attention.
                - Immediately acknowledge the urgency
                - State action being taken or ETA
                - Be brief (under 80 words), no filler phrases
                """;
            case "FINANCE" -> """
                This email is about finance or payment.
                - Address the financial matter directly
                - Avoid ambiguity on amounts or timelines
                - Maintain a formal, trustworthy tone
                """;
            case "COMPLAINT" -> """
                This email contains a complaint or issue.
                - Acknowledge the issue sincerely
                - Apologize appropriately
                - State concrete next steps to resolve
                """;
            case "FOLLOWUP" -> """
                This email is a follow-up or reminder.
                - Acknowledge the follow-up with appreciation
                - Provide an honest status update
                - Set clear expectations for timeline
                """;
            default -> """
                This is a casual or general email.
                - Match the conversational tone
                - Sound like a real person, not corporate
                - Address all points raised
                """;
        };

        String mediaInstruction = (mediaContent != null && !mediaContent.isBlank())
                ? "- Explicitly acknowledge and address the key details from the incoming attachment.\n"
                : "";

        return "You are an expert email ghostwriter.\n"
                + "Output ONLY the email body. No subject line. No placeholders.\n"
                + "Sound completely human.\n\n"
                + "Intent: " + intent + "\n"
                + "Tone: " + toneDesc + "\n"
                + "Length: " + lengthDesc + "\n\n"
                + "Instructions:\n" + intentBlock + mediaInstruction + custom
                + context
                + media
                + "\nOriginal email:\n" + emailContent;
    }

    // ── THREAD CONTEXT BLOCK ──────────────────────────────────
    private String buildThreadBlock(String threadContext) {
        if (threadContext == null || threadContext.isBlank()) return "";
        return "\nEmail thread context (for coherence):\n" + threadContext + "\n";
    }

    private String buildMediaBlock(String mediaContent, String mediaType) {
        if (mediaContent == null || mediaContent.isBlank()) return "";
        String label = (mediaType != null && !mediaType.isBlank()) ? mediaType.toUpperCase() : "ATTACHMENT";
        return "\n--- Incoming " + label + " Content / Analysis ---\n"
                + mediaContent.trim()
                + "\n-----------------------------------------\n"
                + "Note: The above attachment content was extracted from the incoming email. Address and reference it appropriately in your reply.\n";
    }

    private String resolveTone(String tone) {
        if (tone == null) return "professional and clear";
        return switch (tone) {
            case "formal"    -> "formal and highly professional";
            case "friendly"  -> "warm, friendly and personable";
            case "executive" -> "executive-level, direct and authoritative";
            case "casual"    -> "casual and conversational";
            case "assertive" -> "confident and assertive";
            default          -> "professional and clear";
        };
    }

    private String resolveLength(String length) {
        if (length == null) return "2-3 short paragraphs";
        return switch (length) {
            case "short" -> "2-3 sentences MAXIMUM";
            case "long"  -> "3-4 full paragraphs, detailed";
            default      -> "2-3 short paragraphs";
        };
    }
}