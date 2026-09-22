package com.email_writer.repository;

import com.email_writer.model.ComparisonRecord;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface ComparisonRepository extends JpaRepository<ComparisonRecord, Long> {
    List<ComparisonRecord> findByDetectedIntent(String intent);
}