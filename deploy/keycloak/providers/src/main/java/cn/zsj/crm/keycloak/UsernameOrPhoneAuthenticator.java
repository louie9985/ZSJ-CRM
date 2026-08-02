package cn.zsj.crm.keycloak;

import jakarta.ws.rs.core.MultivaluedMap;
import java.util.List;
import org.keycloak.authentication.AuthenticationFlowContext;
import org.keycloak.authentication.authenticators.browser.UsernamePasswordForm;
import org.keycloak.models.UserModel;
import org.keycloak.services.managers.AuthenticationManager;

/** Resolves a managed phone_login_key before delegating to Keycloak's standard password form. */
final class UsernameOrPhoneAuthenticator extends UsernamePasswordForm {
    @Override
    protected boolean validateForm(
            AuthenticationFlowContext context,
            MultivaluedMap<String, String> formData) {
        String submitted = formData.getFirst(AuthenticationManager.FORM_USERNAME);
        PhoneLoginKey.normalize(submitted).ifPresent(phone -> {
            // Never let an unmatched personal identifier reach Keycloak event details.
            formData.putSingle(AuthenticationManager.FORM_USERNAME, "");
            List<UserModel> matches = context.getSession().users()
                    .searchForUserByUserAttributeStream(
                            context.getRealm(), PhoneLoginKey.ATTRIBUTE, phone)
                    .limit(2)
                    .toList();
            if (matches.size() == 1) {
                formData.putSingle(AuthenticationManager.FORM_USERNAME, matches.getFirst().getUsername());
            }
        });
        return super.validateForm(context, formData);
    }
}
