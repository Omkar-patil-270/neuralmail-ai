package com.email_writer.fields;
import lombok.Data;
import lombok.NoArgsConstructor;
@Data
@NoArgsConstructor
public class EmailResponse {
    private boolean success;
    private String result;
    private String error;
    private String intent;
    private String intentMode;
    private String intentReason;
    private String keywordsFound;
    private String promptUsed;
    public static EmailResponse ok(String result) {
        EmailResponse r = new EmailResponse();
        r.success = true; r.result = result; return r;
    }
    public static EmailResponse fail(String error) {
        EmailResponse r = new EmailResponse();
        r.success = false; r.error = error; return r;
    }
}
