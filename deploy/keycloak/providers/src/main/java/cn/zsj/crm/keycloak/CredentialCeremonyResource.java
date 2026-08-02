package cn.zsj.crm.keycloak;

import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.FormParam;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import org.keycloak.forms.login.LoginFormsProvider;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.RealmModel;
import org.keycloak.models.UserCredentialModel;
import org.keycloak.models.UserModel;
import org.keycloak.services.managers.AuthenticationManager;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.util.regex.Pattern;

@Path("")
public final class CredentialCeremonyResource {
    static final String OPERATOR_ATTRIBUTE = "ai_crm_credential_operator_subject";
    static final String SECRET_HASH_ATTRIBUTE = "ai_crm_credential_secret_hash";
    static final String RETURN_URI_ATTRIBUTE = "ai_crm_credential_return_uri";
    static final String COMPLETED_OPERATION_ATTRIBUTE = "ai_crm_credential_completed_operation_id";
    static final String COMPLETED_OPERATOR_ATTRIBUTE = "ai_crm_credential_completed_operator_subject";
    static final String FORM_TEMPLATE = "credential-ceremony.ftl";
    static final String FAILURE_TEMPLATE = "credential-ceremony-error.ftl";
    private static final Pattern USER_ID = Pattern.compile("^[0-9a-zA-Z_-]{1,128}$");
    private static final Pattern SECRET = Pattern.compile("^[A-Za-z0-9_-]{43}$");
    private final KeycloakSession session;

    CredentialCeremonyResource(KeycloakSession session) { this.session = session; }

    @GET
    @Path("{targetUserId}")
    @Produces(MediaType.TEXT_HTML)
    public Response form(@PathParam("targetUserId") String targetUserId,
                         @QueryParam("operation") String operationId,
                         @QueryParam("ceremony") String secret,
                         @Context UriInfo uriInfo) {
        Ceremony ceremony = resolve(targetUserId, operationId, secret);
        if (ceremony == null) return failure(Response.Status.FORBIDDEN);
        return form(uriInfo.getRequestUri(), false, Response.Status.OK);
    }

    @POST
    @Path("{targetUserId}")
    @Consumes(MediaType.APPLICATION_FORM_URLENCODED)
    @Produces(MediaType.TEXT_HTML)
    public Response complete(@PathParam("targetUserId") String targetUserId,
                             @QueryParam("operation") String operationId,
                             @QueryParam("ceremony") String secret,
                             @FormParam("password") String password,
                             @FormParam("passwordConfirm") String passwordConfirm,
                             @Context UriInfo uriInfo) {
        Ceremony ceremony = resolve(targetUserId, operationId, secret);
        if (ceremony == null) return failure(Response.Status.FORBIDDEN);
        if (!validPassword(password) || !password.equals(passwordConfirm)) {
            return form(uriInfo.getRequestUri(), true, Response.Status.BAD_REQUEST);
        }
        try {
            if (!ceremony.target().credentialManager().updateCredential(UserCredentialModel.password(password, true))) {
                return form(uriInfo.getRequestUri(), true, Response.Status.BAD_REQUEST);
            }
            ceremony.target().setEnabled(true);
            session.sessions().removeUserSessions(ceremony.realm(), ceremony.target());
            ceremony.target().setSingleAttribute(COMPLETED_OPERATION_ATTRIBUTE, operationId);
            ceremony.target().setSingleAttribute(COMPLETED_OPERATOR_ATTRIBUTE, ceremony.operatorSubject());
            clearPending(ceremony.target());
            return Response.seeOther(ceremony.returnUri()).header("Cache-Control", "no-store").build();
        } catch (RuntimeException ignored) {
            return form(uriInfo.getRequestUri(), true, Response.Status.BAD_REQUEST);
        }
    }

    private Ceremony resolve(String targetUserId, String operationId, String secret) {
        if (targetUserId == null || !USER_ID.matcher(targetUserId).matches() ||
                secret == null || !SECRET.matcher(secret).matches() ||
                !CredentialCeremonyMetadata.isStableOperation(operationId)) return null;
        RealmModel realm = session.getContext().getRealm();
        AuthenticationManager.AuthResult operator = AuthenticationManager.authenticateIdentityCookie(session, realm, true);
        if (operator == null || operator.getUser() == null) return null;
        UserModel target = session.users().getUserById(realm, targetUserId);
        if (target == null) return null;
        String expiresAt = target.getFirstAttribute(CredentialCeremonyMetadata.EXPIRES_AT_ATTRIBUTE);
        String recordedOperation = target.getFirstAttribute(CredentialCeremonyMetadata.OPERATION_ID_ATTRIBUTE);
        String operatorSubject = target.getFirstAttribute(OPERATOR_ATTRIBUTE);
        String secretHash = target.getFirstAttribute(SECRET_HASH_ATTRIBUTE);
        String returnUri = target.getFirstAttribute(RETURN_URI_ATTRIBUTE);
        if (!operationId.equals(recordedOperation) || !operator.getUser().getId().equals(operatorSubject) ||
                !CredentialCeremonyMetadata.isValid(operationId, expiresAt, Clock.systemUTC()) ||
                !constantTimeEquals(secretHash, CredentialCeremonyMetadata.sha256(secret)) || !validReturnUri(returnUri)) return null;
        return new Ceremony(realm, target, URI.create(returnUri), operatorSubject);
    }

    private static boolean validPassword(String value) {
        if (value == null || value.length() < 8 || value.length() > 64) return false;
        return value.chars().allMatch(code -> code >= 0x20 && code <= 0x7e);
    }

    private static boolean validReturnUri(String value) {
        if (value == null) return false;
        try {
            URI uri = URI.create(value);
            boolean loopbackHttp = "http".equals(uri.getScheme()) && ("127.0.0.1".equals(uri.getHost()) || "localhost".equals(uri.getHost()));
            return ("https".equals(uri.getScheme()) || loopbackHttp) && uri.getUserInfo() == null && uri.getFragment() == null;
        } catch (IllegalArgumentException ignored) { return false; }
    }

    private static boolean constantTimeEquals(String expected, String actual) {
        if (expected == null || actual == null) return false;
        return MessageDigest.isEqual(expected.getBytes(StandardCharsets.US_ASCII), actual.getBytes(StandardCharsets.US_ASCII));
    }

    private static void clearPending(UserModel target) {
        target.removeAttribute(CredentialCeremonyMetadata.OPERATION_ID_ATTRIBUTE);
        target.removeAttribute(CredentialCeremonyMetadata.EXPIRES_AT_ATTRIBUTE);
        target.removeAttribute(OPERATOR_ATTRIBUTE);
        target.removeAttribute(SECRET_HASH_ATTRIBUTE);
        target.removeAttribute(RETURN_URI_ATTRIBUTE);
    }

    private Response form(URI actionUri, boolean hasError, Response.Status status) {
        LoginFormsProvider forms = session.getProvider(LoginFormsProvider.class)
                .setDetachedAuthSession()
                .setActionUri(actionUri)
                .setStatus(status)
                .setAttribute("credentialCeremonyHasError", hasError);
        return secure(forms.createForm(FORM_TEMPLATE));
    }

    private Response failure(Response.Status status) {
        if (session.getContext().getRealm() == null) {
            return Response.status(status)
                    .type(MediaType.TEXT_PLAIN_TYPE)
                    .entity("Credential ceremony is unavailable.")
                    .header("Cache-Control", "no-store")
                    .header("Pragma", "no-cache")
                    .header("X-Content-Type-Options", "nosniff")
                    .build();
        }
        LoginFormsProvider forms = session.getProvider(LoginFormsProvider.class)
                .setDetachedAuthSession()
                .setStatus(status);
        return secure(forms.createForm(FAILURE_TEMPLATE));
    }

    private static Response secure(Response response) {
        return Response.fromResponse(response)
                .header("Cache-Control", "no-store")
                .header("Referrer-Policy", "no-referrer")
                .build();
    }

    private record Ceremony(RealmModel realm, UserModel target, URI returnUri, String operatorSubject) {}
}
