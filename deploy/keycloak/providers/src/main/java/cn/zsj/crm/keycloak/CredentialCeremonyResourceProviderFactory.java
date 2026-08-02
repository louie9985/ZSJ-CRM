package cn.zsj.crm.keycloak;

import org.keycloak.Config;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;
import org.keycloak.provider.ProviderConfigProperty;
import org.keycloak.services.resource.RealmResourceProvider;
import org.keycloak.services.resource.RealmResourceProviderFactory;

import java.util.List;

public final class CredentialCeremonyResourceProviderFactory implements RealmResourceProviderFactory {
    static final String ID = "ai-crm-credential-ceremony";

    @Override public RealmResourceProvider create(KeycloakSession session) {
        return new CredentialCeremonyResourceProvider(session);
    }
    @Override public String getId() { return ID; }
    @Override public void init(Config.Scope config) {}
    @Override public void postInit(KeycloakSessionFactory factory) {}
    @Override public void close() {}
    @Override public List<ProviderConfigProperty> getConfigMetadata() { return List.of(); }
}
