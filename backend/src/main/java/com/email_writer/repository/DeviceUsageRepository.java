package com.email_writer.repository;

import com.email_writer.model.DeviceUsage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface DeviceUsageRepository extends JpaRepository<DeviceUsage, String> {
}