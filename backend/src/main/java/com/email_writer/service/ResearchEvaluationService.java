package com.email_writer.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class ResearchEvaluationService {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class EvaluationResult {
        private int baselineWords;
        private int proposedWords;
        private double wordReductionRatio;     // % more concise
        private double baselineReadability;    // Flesch Reading Ease (0 - 100)
        private double proposedReadability;    // Flesch Reading Ease (0 - 100)
        private double baselineGradeLevel;     // Flesch-Kincaid Grade Level
        private double proposedGradeLevel;     // Flesch-Kincaid Grade Level
        private double intentAlignmentScore;   // 0.0 - 1.0
        private double attachmentGroundingScore; // 0.0 - 1.0
        private String detailedJson;
    }

    public EvaluationResult evaluate(String baselineReply, String proposedReply, String intent, String attachmentContent) {
        EvaluationResult res = new EvaluationResult();

        int bWords = countWords(baselineReply);
        int pWords = countWords(proposedReply);
        res.setBaselineWords(bWords);
        res.setProposedWords(pWords);

        double reduction = (bWords > 0) ? ((double) (bWords - pWords) / bWords) * 100.0 : 0.0;
        res.setWordReductionRatio(Math.round(reduction * 10.0) / 10.0);

        double bFre = calculateFleschReadingEase(baselineReply);
        double pFre = calculateFleschReadingEase(proposedReply);
        res.setBaselineReadability(Math.round(bFre * 10.0) / 10.0);
        res.setProposedReadability(Math.round(pFre * 10.0) / 10.0);

        res.setBaselineGradeLevel(Math.round(calculateGradeLevel(baselineReply) * 10.0) / 10.0);
        res.setProposedGradeLevel(Math.round(calculateGradeLevel(proposedReply) * 10.0) / 10.0);

        double intentScore = calculateIntentAlignment(proposedReply, intent);
        res.setIntentAlignmentScore(Math.round(intentScore * 100.0) / 100.0);

        double groundingScore = calculateGrounding(proposedReply, attachmentContent);
        res.setAttachmentGroundingScore(Math.round(groundingScore * 100.0) / 100.0);

        try {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("intent", intent);
            map.put("baselineWords", bWords);
            map.put("proposedWords", pWords);
            map.put("brevityImprovementPercent", res.getWordReductionRatio());
            map.put("baselineFleschEase", res.getBaselineReadability());
            map.put("proposedFleschEase", res.getProposedReadability());
            map.put("proposedGradeLevel", res.getProposedGradeLevel());
            map.put("intentAlignment", res.getIntentAlignmentScore());
            map.put("attachmentGrounding", res.getAttachmentGroundingScore());
            res.setDetailedJson(objectMapper.writeValueAsString(map));
        } catch (Exception e) {
            res.setDetailedJson("{}");
        }

        return res;
    }

    public int countWords(String text) {
        if (text == null || text.isBlank()) return 0;
        return text.trim().split("\\s+").length;
    }

    public double calculateFleschReadingEase(String text) {
        if (text == null || text.isBlank()) return 0.0;
        String[] words = text.trim().split("\\s+");
        String[] sentences = text.split("[.!?]+");
        int totalWords = words.length;
        int totalSentences = Math.max(1, sentences.length);
        int totalSyllables = 0;
        for (String w : words) {
            totalSyllables += countSyllables(w);
        }
        if (totalWords == 0) return 0.0;

        // Flesch Reading Ease Formula: 206.835 - 1.015*(words/sentences) - 84.6*(syllables/words)
        double score = 206.835 - (1.015 * ((double) totalWords / totalSentences)) - (84.6 * ((double) totalSyllables / totalWords));
        return Math.max(0.0, Math.min(100.0, score));
    }

    public double calculateGradeLevel(String text) {
        if (text == null || text.isBlank()) return 0.0;
        String[] words = text.trim().split("\\s+");
        String[] sentences = text.split("[.!?]+");
        int totalWords = words.length;
        int totalSentences = Math.max(1, sentences.length);
        int totalSyllables = 0;
        for (String w : words) totalSyllables += countSyllables(w);
        if (totalWords == 0) return 0.0;

        // Flesch-Kincaid Grade Level Formula: 0.39*(words/sentences) + 11.8*(syllables/words) - 15.59
        double gl = (0.39 * ((double) totalWords / totalSentences)) + (11.8 * ((double) totalSyllables / totalWords)) - 15.59;
        return Math.max(1.0, Math.min(18.0, gl));
    }

    private int countSyllables(String word) {
        word = word.toLowerCase().replaceAll("[^a-z]", "");
        if (word.length() <= 3) return 1;
        word = word.replaceAll("(?:[es|ed|e]$)", "");
        Matcher m = Pattern.compile("[aeiouy]{1,2}").matcher(word);
        int count = 0;
        while (m.find()) count++;
        return Math.max(1, count);
    }

    public double calculateIntentAlignment(String reply, String intent) {
        if (reply == null || reply.isBlank() || intent == null) return 0.5;
        String lower = reply.toLowerCase();
        List<String> checks = switch (intent) {
            case "MEETING" -> List.of("available", "schedule", "time", "calendar", "meet", "call", "zoom", "sync", "discuss", "confirm");
            case "JOB" -> List.of("interest", "opportunity", "experience", "role", "resume", "position", "look forward", "background");
            case "URGENT" -> List.of("immediately", "working on", "asap", "priority", "update", "eta", "status", "right away");
            case "FINANCE" -> List.of("invoice", "payment", "amount", "received", "process", "account", "billing", "receipt");
            case "COMPLAINT" -> List.of("apologize", "sorry", "resolve", "address", "rectify", "help", "inconvenience", "fix");
            case "FOLLOWUP" -> List.of("update", "status", "progress", "timeline", "checking", "following up", "expect");
            default -> List.of("thank", "best", "regards", "appreciate", "hello", "hi");
        };

        long matched = checks.stream().filter(lower::contains).count();
        double ratio = (double) matched / Math.min(4, checks.size());
        return Math.min(1.0, Math.max(0.4, 0.4 + (ratio * 0.6)));
    }

    public double calculateGrounding(String reply, String attachment) {
        if (attachment == null || attachment.isBlank() || reply == null || reply.isBlank()) return 1.0;
        Set<String> attWords = new HashSet<>(Arrays.asList(attachment.toLowerCase().split("\\W+")));
        attWords.removeIf(w -> w.length() < 4); // ignore small stop-words
        if (attWords.isEmpty()) return 1.0;

        String[] repWords = reply.toLowerCase().split("\\W+");
        long overlap = Arrays.stream(repWords).filter(w -> w.length() >= 4 && attWords.contains(w)).distinct().count();
        double score = (double) overlap / Math.min(10, attWords.size());
        return Math.min(1.0, Math.max(0.2, score));
    }
}
