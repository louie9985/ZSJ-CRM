package cn.zsj.crm.keycloak;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class PhoneLoginKeyTest {
    @Test void normalizesAllowedSeparators() {
        assertEquals("+8613812345678", PhoneLoginKey.normalize(" +86 138-1234-5678 ").orElseThrow());
    }

    @Test void rejectsNonPhoneLoginIdentifiers() {
        assertTrue(PhoneLoginKey.normalize("crm.admin").isEmpty());
        assertTrue(PhoneLoginKey.normalize("12345").isEmpty());
        assertTrue(PhoneLoginKey.normalize("+12(34)567").isEmpty());
    }
}
