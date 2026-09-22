package com.email_writer.service;

import com.email_writer.model.DeviceUsage;
import com.email_writer.repository.DeviceUsageRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
public class DeviceRateLimitService {

    private final DeviceUsageRepository repo;

    @Value("${app.rate.limit.requests-per-day:50}")
    private int dailyLimit;

    public void checkRateLimit(String deviceId) {
        if (deviceId == null || deviceId.isBlank())
            throw new RuntimeException("Device ID is required");

        DeviceUsage usage = repo.findById(deviceId)
                .orElse(new DeviceUsage(deviceId, 0, LocalDate.now(), LocalDateTime.now()));

        if (!usage.getLastReset().equals(LocalDate.now())) {
            usage.setRequestCount(0);
            usage.setLastReset(LocalDate.now());
        }

        if (usage.getRequestCount() >= dailyLimit)
            throw new RuntimeException("Daily limit reached (" + dailyLimit
                    + " requests/day). Resets at midnight.");

        usage.setRequestCount(usage.getRequestCount() + 1);
        usage.setLastSeen(LocalDateTime.now());
        repo.save(usage);
    }

    public int getRemaining(String deviceId) {
        if (deviceId == null || deviceId.isBlank()) return dailyLimit;
        return repo.findById(deviceId).map(u -> {
            if (!u.getLastReset().equals(LocalDate.now())) return dailyLimit;
            return Math.max(0, dailyLimit - u.getRequestCount());
        }).orElse(dailyLimit);
    }
}