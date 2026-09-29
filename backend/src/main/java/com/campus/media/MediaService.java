package com.campus.media;

import com.campus.media.api.MediaDtos.MediaPurpose;
import com.campus.media.api.MediaDtos.MediaView;
import com.campus.shared.web.ApiException;
import com.campus.shared.web.CommandReceiptRepository;
import com.campus.shared.web.RequestHash;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Slice 1 conservative media adapter. A12 remains OPEN: supported file formats,
 * byte limits, retention and viewer roles are not fully decided by the client.
 * We only accept a conservative core set (A12 recommendation: images now, video later).
 */
@Service
public class MediaService {
    public static final String OPERATION = "uploadMedia";
    /** Matches the plan value; A12 exact ceiling is still OPEN, not client-approved. */
    public static final long MAX_BYTES = 10L * 1024 * 1024;

    private final MediaRepository repository;
    private final CommandReceiptRepository commandReceipts;

    public MediaService(MediaRepository repository, CommandReceiptRepository commandReceipts) {
        this.repository = repository;
        this.commandReceipts = commandReceipts;
    }

    public record Detected(String contentType, String extension) { }

    /** Detects the real format from magic bytes; never trusts the client supplied MIME. */
    public Detected detect(byte[] bytes) {
        if (bytes == null || bytes.length == 0) return null;
        if (bytes.length >= 3
            && (bytes[0] & 0xFF) == 0xFF && (bytes[1] & 0xFF) == 0xD8 && (bytes[2] & 0xFF) == 0xFF) {
            return new Detected("image/jpeg", "jpg");
        }
        if (bytes.length >= 8
            && (bytes[0] & 0xFF) == 0x89 && bytes[1] == 'P' && bytes[2] == 'N' && bytes[3] == 'G'
            && (bytes[4] & 0xFF) == 0x0D && (bytes[5] & 0xFF) == 0x0A && (bytes[6] & 0xFF) == 0x1A && (bytes[7] & 0xFF) == 0x0A) {
            return new Detected("image/png", "png");
        }
        if (bytes.length >= 12
            && bytes[0] == 'R' && bytes[1] == 'I' && bytes[2] == 'F' && bytes[3] == 'F'
            && bytes[8] == 'W' && bytes[9] == 'E' && bytes[10] == 'B' && bytes[11] == 'P') {
            return new Detected("image/webp", "webp");
        }
        return null;
    }

    /**
     * Slice 1 gate: only REPORT evidence is wired. LISTING/STUDENT_CARD/HANDOVER stay planned
     * (A06/A12); the contract keeps the enum, the adapter refuses the unimplemented purposes.
     */
    @Transactional
    public MediaView store(UUID ownerId, MediaPurpose purpose, UUID idempotencyKey, byte[] bytes) {
        if (purpose != MediaPurpose.REPORT) {
            throw ApiException.badRequest("UNSUPPORTED_PURPOSE",
                "Mục đích tải lên này chưa được hỗ trợ", List.of());
        }
        if (bytes == null || bytes.length == 0) {
            throw ApiException.badRequest("VALIDATION_ERROR", "Vui lòng gửi ít nhất một bằng chứng", List.of());
        }
        if (bytes.length > MAX_BYTES) {
            throw ApiException.payloadTooLarge("Tệp vượt quá dung lượng cho phép (tối đa 10MB)");
        }
        Detected detected = detect(bytes);
        if (detected == null) {
            throw ApiException.unsupported("Định dạng không hỗ trợ: chỉ nhận ảnh JPEG, PNG hoặc WebP");
        }

        UUID id = UUID.randomUUID();
        String hash = RequestHash.sha256Hex(bytes, purpose.name() + "|");
        Optional<UUID> replay = commandReceipts.replayTarget(ownerId, OPERATION, idempotencyKey, hash, id, 201);
        if (replay.isPresent()) {
            UUID existingId = replay.get();
            MediaRepository.Asset asset = repository.findAsset(existingId)
                .orElseThrow(() -> ApiException.notFound("NOT_FOUND", "Không tìm thấy tệp"));
            return new MediaView(asset.id(), MediaPurpose.valueOf(asset.purpose()), asset.contentType(), asset.byteSize());
        }

        repository.insertAsset(id, ownerId, purpose.name(), UUID.randomUUID(), detected.contentType(), bytes.length);
        repository.insertBlob(id, bytes);
        return new MediaView(id, purpose, detected.contentType(), (long) bytes.length);
    }

    public MediaRepository.Asset find(UUID id) {
        return repository.findAsset(id).orElse(null);
    }

    public byte[] bytes(UUID id) {
        return repository.findBytes(id).orElse(null);
    }
}
