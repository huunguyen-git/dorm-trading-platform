package com.dormtrading.review.moderation;

final class ReviewModerationFailure extends RuntimeException {
    final int status;
    final String code;

    ReviewModerationFailure(int status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}
