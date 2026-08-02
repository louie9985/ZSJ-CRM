package cn.zsj.crm.keycloak;

import java.time.Clock;
import java.time.Instant;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;

final class CredentialCeremonyMetadata {
    static final String OPERATION_ID_ATTRIBUTE = "ai_crm_credential_operation_id";
    static final String EXPIRES_AT_ATTRIBUTE = "ai_crm_credential_expires_at";

    private CredentialCeremonyMetadata() {}

    static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    static boolean isValid(String operationId, String expiresAt, Clock clock) {
        try {
            UUID.fromString(Optional.ofNullable(operationId).orElseThrow());
            Instant expiry = Instant.parse(Optional.ofNullable(expiresAt).orElseThrow());
            return expiry.isAfter(clock.instant());
        } catch (RuntimeException exception) {
            return false;
        }
    }

    static boolean isStableOperation(String operationId) {
        try {
            UUID.fromString(Optional.ofNullable(operationId).orElseThrow());
            return true;
        } catch (RuntimeException exception) {
            return false;
        }
    }
}
