package com.dormtrading.catalog.media;

import java.time.Duration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Periodically cleans up orphaned files on disk that are no longer tracked in {@code media_files}.
 */
@Component
@ConditionalOnProperty(
        name = "app.media.orphan-cleanup-enabled",
        havingValue = "true",
        matchIfMissing = true
)
public class MediaOrphanCleanupScheduler {

    private static final Logger log = LoggerFactory.getLogger(MediaOrphanCleanupScheduler.class);

    private final MediaService mediaService;
    private final Duration minAge;

    public MediaOrphanCleanupScheduler(
            MediaService mediaService,
            @Value("${app.media.orphan-min-age-minutes:60}") long minAgeMinutes
    ) {
        this.mediaService = mediaService;
        this.minAge = Duration.ofMinutes(Math.max(1L, minAgeMinutes));
    }

    @Scheduled(fixedDelayString = "${app.media.orphan-cleanup-delay-ms:3600000}")
    public void cleanupOrphans() {
        int removed = mediaService.cleanupOrphanFiles(minAge, 200);
        if (removed > 0) {
            log.info("Removed {} orphaned media file(s) from local storage", removed);
        }
    }
}
