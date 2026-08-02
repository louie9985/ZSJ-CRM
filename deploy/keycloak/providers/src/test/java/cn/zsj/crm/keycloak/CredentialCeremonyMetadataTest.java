package cn.zsj.crm.keycloak;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

class CredentialCeremonyMetadataTest {
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-08-02T10:00:00Z"), ZoneOffset.UTC);

    @Test void acceptsAnUnexpiredStableOperation() {
        assertTrue(CredentialCeremonyMetadata.isValid(
                "11111111-1111-4111-8111-111111111111", "2026-08-02T10:05:00Z", CLOCK));
    }

    @Test void rejectsExpiredOrMalformedMetadata() {
        assertFalse(CredentialCeremonyMetadata.isValid(
                "11111111-1111-4111-8111-111111111111", "2026-08-02T09:59:59Z", CLOCK));
        assertFalse(CredentialCeremonyMetadata.isValid("not-an-operation", "2026-08-02T10:05:00Z", CLOCK));
    }
}
