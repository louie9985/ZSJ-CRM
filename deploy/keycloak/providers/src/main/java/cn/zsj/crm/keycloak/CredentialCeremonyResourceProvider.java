package cn.zsj.crm.keycloak;

import org.keycloak.models.KeycloakSession;
import org.keycloak.services.resource.RealmResourceProvider;

final class CredentialCeremonyResourceProvider implements RealmResourceProvider {
    private final KeycloakSession session;

    CredentialCeremonyResourceProvider(KeycloakSession session) { this.session = session; }
    @Override public Object getResource() { return new CredentialCeremonyResource(session); }
    @Override public void close() {}
}
