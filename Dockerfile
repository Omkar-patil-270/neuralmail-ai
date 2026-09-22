# Multi-Stage Dockerfile for NeuralMail AI Backend
# Stage 1: Build JAR with Maven and OpenJDK 21
FROM maven:3.9.6-eclipse-temurin-21-alpine AS build
WORKDIR /app

# Copy pom.xml and download dependencies
COPY backend/pom.xml .
RUN mvn dependency:go-offline -B

# Copy source code and package application
COPY backend/src ./src
RUN mvn clean package -DskipTests -B

# Stage 2: Minimal Runtime with JRE 21
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

# Add unprivileged user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# Copy jar from build stage
COPY --from=build --chown=appuser:appgroup /app/target/*.jar app.jar

# Render provides the PORT env var dynamically
ENV PORT=8082
EXPOSE ${PORT}

# Run the Spring Boot application
ENTRYPOINT ["java", "-Djava.security.egd=file:/dev/./urandom", "-Dserver.port=${PORT}", "-jar", "app.jar"]
