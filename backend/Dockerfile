# ==============================================================================
# Multi-stage Dockerfile for Dorm Trading Platform Backend (Spring Boot 3.5 / JDK 21)
# ==============================================================================
FROM eclipse-temurin:21-jdk-alpine AS build

WORKDIR /workspace

# Copy Maven wrapper and POM first to maximize Docker build layer caching
COPY .mvn .mvn
COPY mvnw pom.xml ./

# Normalize Windows CRLF on mvnw and pre-fetch Maven dependencies
RUN sed -i 's/\r$//' mvnw && chmod +x mvnw \
    && ./mvnw --batch-mode --no-transfer-progress dependency:go-offline

# Copy application source and package executable Spring Boot JAR
COPY src src
RUN ./mvnw --batch-mode --no-transfer-progress package -DskipTests \
    && jar_file="$(find target -maxdepth 1 -type f -name '*.jar' ! -name '*.original' | head -n 1)" \
    && test -n "$jar_file" \
    && cp "$jar_file" /workspace/app.jar

# ==============================================================================
# Runtime Stage (Minimal JRE 21 Alpine, non-root user)
# ==============================================================================
FROM eclipse-temurin:21-jre-alpine AS runtime

WORKDIR /app

RUN addgroup -S app \
    && adduser -S -G app -u 10001 app \
    && mkdir -p /app/data/uploads /app/data/uploads/review-evidence \
    && chown -R app:app /app

COPY --from=build --chown=app:app /workspace/app.jar /app/app.jar

USER app

ENV SERVER_PORT=8082 \
    MEDIA_STORAGE_DIR=/app/data/uploads \
    REVIEW_EVIDENCE_STORAGE_DIR=/app/data/uploads/review-evidence

EXPOSE 8082

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
    CMD wget -qO- "http://127.0.0.1:${SERVER_PORT:-8082}/api/v1/health" | grep -q '"database":"CONNECTED"' || exit 1

ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75.0", "-Duser.timezone=Asia/Ho_Chi_Minh", "-jar", "/app/app.jar"]
