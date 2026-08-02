package cn.zsj.crm.keycloak;

import java.util.List;
import org.keycloak.Config;
import org.keycloak.authentication.Authenticator;
import org.keycloak.authentication.AuthenticatorFactory;
import org.keycloak.models.AuthenticationExecutionModel;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;
import org.keycloak.models.credential.PasswordCredentialModel;
import org.keycloak.provider.ProviderConfigProperty;

public final class UsernameOrPhoneAuthenticatorFactory implements AuthenticatorFactory {
    public static final String ID = "ai-crm-username-or-phone";
    private static final AuthenticationExecutionModel.Requirement[] REQUIREMENTS = {
        AuthenticationExecutionModel.Requirement.REQUIRED
    };

    @Override public Authenticator create(KeycloakSession session) { return new UsernameOrPhoneAuthenticator(); }
    @Override public String getId() { return ID; }
    @Override public String getReferenceCategory() { return PasswordCredentialModel.TYPE; }
    @Override public boolean isConfigurable() { return false; }
    @Override public AuthenticationExecutionModel.Requirement[] getRequirementChoices() { return REQUIREMENTS; }
    @Override public String getDisplayType() { return "ZSJ CRM username or phone"; }
    @Override public String getHelpText() { return "Authenticates by username or the managed phone_login_key attribute."; }
    @Override public List<ProviderConfigProperty> getConfigProperties() { return List.of(); }
    @Override public boolean isUserSetupAllowed() { return false; }
    @Override public void init(Config.Scope config) {}
    @Override public void postInit(KeycloakSessionFactory factory) {}
    @Override public void close() {}
}
