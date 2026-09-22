package com.email_writer.fields;

import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class DualReplyResponse {
    private boolean success;
    private String intent;
    private String intentReason;    // explainability
    private String keywordsFound;   // explainability
    private String promptUsed;      // explainability
    private String baselineReply;
    private String proposedReply;
    private String error;

    public static DualReplyResponse ok(String intent, String intentReason,
                                       String keywordsFound, String promptUsed,
                                       String baselineReply, String proposedReply) {
        DualReplyResponse r = new DualReplyResponse();
        r.success = true;
        r.intent = intent;
        r.intentReason = intentReason;
        r.keywordsFound = keywordsFound;
        r.promptUsed = promptUsed;
        r.baselineReply = baselineReply;
        r.proposedReply = proposedReply;
        return r;
    }
    public static DualReplyResponse fail(String error) {
        DualReplyResponse r = new DualReplyResponse();
        r.success = false; r.error = error; return r;
    }
}