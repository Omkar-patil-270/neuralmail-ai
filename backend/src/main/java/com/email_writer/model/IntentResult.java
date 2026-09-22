package com.email_writer.model;

import lombok.Data;
import lombok.AllArgsConstructor;

// Carries full intent detection result including explainability fields
@Data
@AllArgsConstructor
public class IntentResult {
    private String intent;         // MEETING, JOB, URGENT, FINANCE, COMPLAINT, FOLLOWUP, CASUAL
    private String reason;         // human-readable reason e.g. "Detected scheduling keywords"
    private String keywordsFound;  // e.g. "meeting, schedule, availability"
    private String promptLabel;    // e.g. "Meeting template"
}