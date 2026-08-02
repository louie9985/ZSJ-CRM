# ZSJ CRM Keycloak

This directory owns the development Keycloak 26.3.1 image, its realm template,
the Keycloakify login theme, and AI-CRM-specific providers. It does not contain
users, credentials, client Secret values, or production exports.

## Runtime behavior

- `zsj-crm` is a Keycloakify 11.15.13 React 19/Ant Design 6 login theme.
- The login form accepts a username or a normalized `phone_login_key`. The
  provider resolves the phone attribute, then delegates password validation,
  enabled-user checks, event handling, and brute-force accounting to
  Keycloak's standard username/password authenticator.
- The Realm disables registration, email login/verification, self-service
  password reset, and unmanaged user attributes. Keycloak requires an email
  profile declaration, but it is optional and admin-only; first name and last
  name are absent.
- Five failed attempts trigger a fifteen-minute temporary lock. Authentication
  errors use a single user-facing message.
- Passwords must be 8-64 visible ASCII characters and are handled only by
  Keycloak.

## Credential ceremony

`ai-crm-credential-ceremony` is a short-lived Realm Resource owned by the
custom provider. The API adapter writes these admin-only user attributes
through the Keycloak Admin API:

- `ai_crm_credential_operation_id`: stable UUID for the durable operation.
- `ai_crm_credential_expires_at`: future UTC instant in ISO-8601 form.

The resource also binds the ceremony to the authenticated operator, target
account, single-use secret, and allowlisted return URI. It fails closed when
any binding is missing, malformed, mismatched, used, or expired. Passwords are
posted directly to Keycloak and are never received by the API or Workbench.

Both the password form and invalid/expired state are rendered by the `zsj-crm`
Keycloakify theme through `LoginFormsProvider`; the provider contains no HTML
or CSS. The failure page exposes no account, operator, operation, or ceremony
metadata. On success Keycloak stores a temporary credential, enables the
target, revokes its sessions, consumes the ceremony metadata, and redirects to
the configured local Workbench callback.

## Build and verification

The local Compose project builds `deploy/keycloak/Dockerfile`. The multi-stage
build runs the provider tests, creates the Keycloakify JAR, installs both JARs,
and executes `kc.sh build` before producing the runtime image.

```powershell
node --test deploy/keycloak/tests/*.test.mjs
npm --prefix deploy/keycloak/theme ci --ignore-scripts
npm --prefix deploy/keycloak/theme run typecheck
mvn -f deploy/keycloak/providers/pom.xml verify
docker compose -f deploy/compose/compose.base.yml -f deploy/compose/compose.dev.yml build keycloak
```

Realm import only bootstraps an absent local/test Realm. Existing realms are
not mutated on restart. Keycloak 26 does not accept user-profile configuration
inside a Realm import, so the local Bootstrap applies `user-profile-dev.json`
idempotently through `PUT /admin/realms/ai-crm-dev/users/profile` after import.
Use the same reviewed Admin API operation for later changes.
