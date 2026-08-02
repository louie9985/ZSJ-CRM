package cn.zsj.crm.keycloak;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class CredentialCeremonyResourceTest {
    @Test void usesTheReviewedKeycloakifyTemplates() {
        assertEquals("credential-ceremony.ftl", CredentialCeremonyResource.FORM_TEMPLATE);
        assertEquals("credential-ceremony-error.ftl", CredentialCeremonyResource.FAILURE_TEMPLATE);
    }
}
