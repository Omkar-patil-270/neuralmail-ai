package com.email_writer.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;

@Entity
@Table(name = "comparison_records")
@Data @NoArgsConstructor
public class ComparisonRecord {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "email_content", columnDefinition = "TEXT")
    private String emailContent;

    @Column(name = "thread_context", columnDefinition = "TEXT")
    private String threadContext;

    @Column(name = "detected_intent", length = 50)
    private String detectedIntent;

    @Column(name = "intent_reason", length = 255)
    private String intentReason;

    @Column(name = "keywords_found", length = 255)
    private String keywordsFound;

    @Column(name = "baseline_reply", columnDefinition = "TEXT")
    private String baselineReply;

    @Column(name = "proposed_reply", columnDefinition = "TEXT")
    private String proposedReply;

    @Column(name = "media_content", columnDefinition = "TEXT")
    private String mediaContent;

    @Column(name = "baseline_word_count")
    private Integer baselineWordCount;

    @Column(name = "proposed_word_count")
    private Integer proposedWordCount;

    @Column(name = "word_reduction_ratio")
    private Double wordReductionRatio;

    @Column(name = "baseline_readability")
    private Double baselineReadability;

    @Column(name = "proposed_readability")
    private Double proposedReadability;

    @Column(name = "intent_alignment_score")
    private Double intentAlignmentScore;

    @Column(name = "evaluation_metrics", columnDefinition = "TEXT")
    private String evaluationMetrics;

    @Column(name = "created_at")
    private LocalDateTime createdAt;
}