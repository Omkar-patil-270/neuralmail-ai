package com.email_writer.service;

import com.email_writer.model.ComparisonRecord;
import com.email_writer.model.EmailRequest;
import com.email_writer.repository.ComparisonRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientRequestException;
import reactor.util.retry.Retry;

import java.net.SocketException;
import java.time.Duration;
import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
public class EmailGeneratorService {

    private final WebClient.Builder webClientBuilder;
    private final ComparisonRepository comparisonRepository;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${groq.api.url}") private String baseUrl;
    @Value("${groq.api.key}") private String apiKey;
    @Value("${groq.model}")   private String model;

    public String callGroq(String userPrompt) {
        return callGroq("You are an expert email assistant. Output ONLY the email body.", userPrompt);
    }

    public String callGroq(String systemPrompt, String userPrompt) {
        return callGroq(systemPrompt, userPrompt, 1024, 0.75);
    }

    public String callGroq(String systemPrompt, String userPrompt, int maxTokens, double temperature) {
        try {
            ObjectNode body = objectMapper.createObjectNode();
            body.put("model", model);
            body.put("temperature", temperature);
            body.put("max_tokens", maxTokens);
            ArrayNode messages = objectMapper.createArrayNode();
            ObjectNode sys = objectMapper.createObjectNode();
            sys.put("role", "system"); sys.put("content", systemPrompt);
            messages.add(sys);
            ObjectNode usr = objectMapper.createObjectNode();
            usr.put("role", "user"); usr.put("content", userPrompt);
            messages.add(usr);
            body.set("messages", messages);

            String response = webClientBuilder.build()
                    .post()
                    .uri(baseUrl + "/chat/completions")
                    .header("Authorization", "Bearer " + apiKey)
                    .header("Content-Type", "application/json")
                    .bodyValue(body.toString())
                    .retrieve()
                    .bodyToMono(String.class)
                    .retryWhen(Retry.backoff(3, Duration.ofSeconds(1))
                            .filter(ex -> ex instanceof WebClientRequestException
                                    || ex.getCause() instanceof SocketException)
                            .doBeforeRetry(sig ->
                                    System.out.println("[NeuralMail] Retrying Groq attempt " + (sig.totalRetries() + 1))))
                    .block();

            if (response == null) throw new RuntimeException("Empty response from Groq");
            var tree = objectMapper.readTree(response);
            if (tree.has("error"))
                throw new RuntimeException("Groq error: " + tree.path("error").path("message").asText());
            return tree.path("choices").get(0).path("message").path("content").asText().trim();
        } catch (RuntimeException e) { throw e; }
        catch (Exception e) { throw new RuntimeException("Groq API error: " + e.getMessage(), e); }
    }

    public void saveComparison(String emailContent, String threadContext,
                               String intent, String intentReason,
                               String keywordsFound, String baselineReply, String proposedReply) {
        saveComparison(emailContent, threadContext, intent, intentReason, keywordsFound, baselineReply, proposedReply, null);
    }

    public void saveComparison(String emailContent, String threadContext,
                               String intent, String intentReason,
                               String keywordsFound, String baselineReply, String proposedReply,
                               String mediaContent) {
        saveComparison(emailContent, threadContext, intent, intentReason, keywordsFound, baselineReply, proposedReply, mediaContent, null);
    }

    public void saveComparison(String emailContent, String threadContext,
                               String intent, String intentReason,
                               String keywordsFound, String baselineReply, String proposedReply,
                               String mediaContent, ResearchEvaluationService.EvaluationResult eval) {
        try {
            ComparisonRecord r = new ComparisonRecord();
            r.setEmailContent(emailContent != null ? emailContent.substring(0, Math.min(emailContent.length(), 2000)) : "");
            r.setThreadContext(threadContext);
            r.setDetectedIntent(intent);
            r.setIntentReason(intentReason);
            r.setKeywordsFound(keywordsFound);
            r.setBaselineReply(baselineReply);
            r.setProposedReply(proposedReply);
            r.setMediaContent(mediaContent != null ? mediaContent.substring(0, Math.min(mediaContent.length(), 4000)) : null);
            if (eval != null) {
                r.setBaselineWordCount(eval.getBaselineWords());
                r.setProposedWordCount(eval.getProposedWords());
                r.setWordReductionRatio(eval.getWordReductionRatio());
                r.setBaselineReadability(eval.getBaselineReadability());
                r.setProposedReadability(eval.getProposedReadability());
                r.setIntentAlignmentScore(eval.getIntentAlignmentScore());
                r.setEvaluationMetrics(eval.getDetailedJson());
            }
            r.setCreatedAt(LocalDateTime.now());
            comparisonRepository.save(r);
        } catch (Exception e) {
            System.err.println("[NeuralMail] Failed to save comparison: " + e.getMessage());
        }
    }

    public java.util.List<ComparisonRecord> getAllComparisons() {
        return comparisonRepository.findAll();
    }

    public String rewriteEmail(EmailRequest req) {
        String tone = req.getTone() != null ? req.getTone() : "professional";
        return callGroq("You are an expert email editor. Output ONLY the rewritten email body.",
                "Rewrite this email to be more " + tone + " and polished:\n\n" + req.getEmailContent());
    }

    public String improveEmail(EmailRequest req) {
        return callGroq("Fix grammar, spelling and punctuation. Output ONLY the improved email body.",
                "Fix this email:\n\n" + req.getEmailContent());
    }

    public String summarizeEmail(EmailRequest req) {
        return callGroq("Summarize emails into bullet points. Output ONLY bullet points.",
                "Summarize in 3-5 bullets (max 15 words each):\n\n" + req.getEmailContent());
    }

    public String generateFollowUpEmail(EmailRequest req) {
        String tone = req.getTone() != null ? req.getTone() : "professional";
        String custom = (req.getCustomPrompt() != null && !req.getCustomPrompt().isBlank())
                ? "\nMUST FOLLOW: " + req.getCustomPrompt() : "";
        return callGroq("Write polite follow-up emails. Output ONLY the email body.",
                "Write a follow-up. Tone: " + tone + ". Max 3-4 sentences." + custom
                        + "\n\nOriginal:\n" + req.getEmailContent());
    }

    // ── 🕵️ SUBTEXT & CORPORATE BS DECODER ────────────────────
    public String decodeSubtext(EmailRequest req) {
        String prompt = """
                Analyze the following email and decode the hidden subtext, passive-aggressive corporate jargon, and unstated expectations.
                Format your output clearly with high-impact headings:

                🔥 RAW UNVARNISHED TRUTH:
                [1-2 sentences explaining what the sender actually means without corporate sugarcoating]

                🔍 DECODED SUBTEXT & JARGON:
                - "[Specific phrase from email]" ➔ Decoded: [What it actually means]
                - "[Specific phrase from email]" ➔ Decoded: [What it actually means]

                ⚡ POWER DYNAMIC & SENDER STATE:
                [Analysis of their leverage, stress level, and hidden expectations]

                🎯 RECOMMENDED STRATEGY:
                [Actionable advice on how you should respond to win this exchange and protect your position]

                Email content to decode:
                """ + req.getEmailContent();

        return callGroq("You are an elite corporate psychologist and communications analyst. You uncover the unvarnished truth, hidden intentions, and real subtext behind emails.", prompt);
    }

    // ── 🧠 PSYCHOLOGICAL RECIPIENT RADAR ──────────────────────
    public String analyzePsychRadar(EmailRequest req) {
        String prompt = """
                Analyze this email for sender psychology, emotional state, leverage, and optimal response timing.
                Format your output strictly as:

                🎭 SENDER MOOD: [e.g. Stressed & Impatient | Analytical & Cautious | Warm & Collaborative | Defensive | Testing Boundaries]
                ⚡ POWER POSITION: [e.g. High Leverage | Neutral | Testing Boundaries | Seeking Reassurance | Transactional]
                ⏱️ OPTIMAL REPLY TIMING: [e.g. Wait 30-45 minutes (maintain leverage) | Immediate (< 10 mins) | Standard next business morning]
                🛡️ TACTICAL STANCE: [1-2 sentences explaining the exact psychological stance you should take in your reply]
                💡 CORE MOTIVATION: [What the sender secretly cares about most right now]

                Email content to analyze:
                """ + req.getEmailContent();

        return callGroq("You are an expert behavioural intelligence analyst specialized in email psychometrics and negotiation timing.", prompt);
    }

    // ── 💼 TACTICAL NEGOTIATION & DEAL CLOSER ─────────────────
    public String negotiateDeal(EmailRequest req, String strategy) {
        String strat = strategy != null ? strategy : (req.getCustomPrompt() != null ? req.getCustomPrompt() : "SALARY_COUNTER");
        String prompt = """
                You are negotiating this email exchange.
                Strategy: """ + strat + """

                Rules for this negotiation reply:
                - Apply FBI negotiation and tactical empathy (Chris Voss principles): label their emotions or perspective first.
                - State your position/counter-offer clearly, confidently, and politely without groveling or over-apologizing.
                - Justify based on objective value, market standards, and win-win mutual outcomes.
                - Output ONLY the ready-to-send email body. No subject line. No preamble.

                Email content:
                """ + req.getEmailContent();

        return callGroq("You are a master business negotiator trained in FBI crisis negotiation and tactical empathy. You craft bulletproof, win-win counter-offers.", prompt);
    }

    // ── 🌍 GLOBAL CULTURAL DIPLOMAT ───────────────────────────
    public String culturalDiplomat(EmailRequest req, String culture) {
        String cult = culture != null ? culture : (req.getTone() != null ? req.getTone() : "JAPAN");
        String prompt = """
                Rewrite or draft a reply to the following email adhering strictly to the native business etiquette of target culture: """ + cult + """

                Cultural Etiquette Guidelines:
                - JAPAN: Use respectful Keigo framing, humility, harmony (Wa), relationship-first acknowledgment, polite indirectness, respectful closing.
                - GERMANY: Sachlichkeit (factual, objective), zero fluff or superficial pleasantries, clear logical structure, precise timelines, direct and honest.
                - USA: Silicon Valley / American business style: energetic, optimistic, action-oriented, crisp brevity, friendly yet direct.
                - UK: Classic British understated diplomacy, tactful courtesy, subtle polite phrasing, avoids overt brashness.
                - MIDDLE_EAST: Warm personal greetings, deep respect, relational hospitality, honorable and warm closing.
                - INDIA: Cordial, respectful deference, collaborative tone, clear cooperative commitment.

                Output ONLY the culturally adapted email body ready to send. No subject line. No preamble.

                Email content:
                """ + req.getEmailContent();

        return callGroq("You are a world-class international diplomat and cross-cultural business communications expert.", prompt);
    }

    // ── 👻 GHOSTWRITER INLINE AUTOCOMPLETE (Fast Sub-200ms) ───
    public String autocompleteEmail(EmailRequest req) {
        String currentLine = req.getCustomPrompt() != null ? req.getCustomPrompt() : "";
        String context = (req.getEmailContent() != null && !req.getEmailContent().isBlank())
                ? "\nEmail context / received email:\n" + req.getEmailContent().substring(0, Math.min(req.getEmailContent().length(), 600))
                : "";

        String prompt = "Predict the next 4 to 12 words of the sentence the user is actively typing in their email draft."
                + context
                + "\n\nUser is typing: \"" + currentLine + "\""
                + "\n\nRules: Output ONLY the continuation text that completes the thought naturally. Do NOT repeat what the user typed. No quotes. No preamble.";

        String continuation = callGroq(
                "You are an ultra-fast email autocomplete engine. Output ONLY the natural sentence continuation text. No quotes. No preamble.",
                prompt,
                35,
                0.2
        );

        // Sanitize any extra quotes or accidental repeats
        continuation = continuation.replaceAll("^[\"']+|[\"']+$", "").trim();
        return continuation;
    }

    // ── 📅 SMART CALENDAR RSVP & SCHEDULER ───────────────────
    public String generateCalendarRsvp(EmailRequest req, String rsvpType) {
        String type = rsvpType != null ? rsvpType : "CONFIRM_PROPOSED";
        String customRules = (req.getCustomPrompt() != null && !req.getCustomPrompt().isBlank())
                ? "\nUser Profile / Signature Rules: " + req.getCustomPrompt() : "";

        String prompt = """
                Incoming Email proposing a meeting or call:
                """ + req.getEmailContent() + """

                Requested Action: """ + type + customRules + """

                Rules for the reply:
                - If CONFIRM_PROPOSED: Confirm the proposed date and time with enthusiasm. Note that you have added it to your calendar and will send/await the invite.
                - If PROPOSE_ALTERNATIVES: Acknowledge the request, politely state a minor conflict with the proposed slot, and suggest 2 realistic alternative windows (e.g. tomorrow afternoon or Friday morning).
                - If DECLINE_CONFLICT: Express sincere appreciation, decline politely due to current schedule commitments, and suggest touching base later.
                - Output ONLY the ready-to-send email body. No subject line. No preamble.
                """;

        return callGroq("You are an executive scheduling assistant. You craft crisp, professional meeting RSVPs.", prompt);
    }

    // ── 📌 EXECUTIVE THREAD BRIEF & ACTION CHECKLIST ──────────
    public String extractThreadBrief(EmailRequest req) {
        String prompt = """
                Analyze this email thread and provide an executive-level briefing with clear action items:

                """ + req.getEmailContent() + """

                Format your response strictly as:
                📌 EXECUTIVE TL;DR:
                [1 punchy sentence summarizing the consensus or current status]

                ✅ ACTION ITEMS FOR YOU:
                - [Specific action required from you or your team]
                - [Next step or deliverable]

                ⚠️ DATES & DEADLINES:
                [Any critical dates, meetings, or deadlines mentioned, or 'None specified']
                """;

        return callGroq("You are an executive chief-of-staff. You condense email threads into high-priority actionable executive briefings.", prompt);
    }
}
