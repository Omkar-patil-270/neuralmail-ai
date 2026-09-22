package com.email_writer.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "device_usage")
@Data @NoArgsConstructor @AllArgsConstructor
public class DeviceUsage {
    @Id
    @Column(name = "device_id", length = 100)
    private String deviceId;

    @Column(name = "request_count", nullable = false)
    private int requestCount = 0;

    @Column(name = "last_reset", nullable = false)
    private LocalDate lastReset;

    @Column(name = "last_seen")
    private LocalDateTime lastSeen;
}