package com.dormtrading.order;

import com.dormtrading.iam.auth.AuthFailure;
import java.util.regex.Pattern;

/**
 * Shared strict storage-key validator for private handover proof photos (NFR-01).
 * Enforces {@code <transactionUuid>/<proofUuid>.(jpg|png|webp)} across both local and S3 backends.
 */
public final class HandoverProofKeys {

    private static final Pattern SAFE_KEY = Pattern.compile(
            "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/"
                    + "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\\.(jpg|png|webp)$"
    );

    private HandoverProofKeys() {
    }

    public static String validate(String storageKey) {
        if (storageKey == null || !SAFE_KEY.matcher(storageKey).matches()) {
            throw new AuthFailure(400, "INVALID_MEDIA", "Đường dẫn ảnh bàn giao không hợp lệ.");
        }
        return storageKey;
    }
}
