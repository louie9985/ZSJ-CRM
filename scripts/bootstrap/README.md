# Bootstrap Scripts

Environment initialization and local developer setup.

## ZSJ CRM local administrator bootstrap

`zsj-crm-local.mjs` coordinates the development-only creation of the stable `ZSJ` root, `AI应用部`, `系统管理岗`, one ZSJ administrator, and one CRM administrator. It never accepts account values as command-line arguments and never prints them.

Each username, real name, phone, and password must be supplied through its dedicated absolute `*_FILE` environment reference. Secret files must be regular, canonical, non-linked, single-value files; POSIX files with any group/other permission are rejected. Passwords are passed only to the injected identity/Keycloak port.

Required Secret references are `AI_CRM_LOCAL_ZSJ_ADMIN_USERNAME_FILE`, `AI_CRM_LOCAL_ZSJ_ADMIN_REAL_NAME_FILE`, `AI_CRM_LOCAL_ZSJ_ADMIN_PHONE_FILE`, `AI_CRM_LOCAL_ZSJ_ADMIN_PASSWORD_FILE`, and the corresponding four `AI_CRM_LOCAL_CRM_ADMIN_*_FILE` references.

The executable also requires `AI_CRM_ZSJ_BOOTSTRAP_ADAPTER_MODULE`, an absolute path to an adapter exporting `createZsjCrmLocalBootstrapPorts`. The repository adapter is `scripts/bootstrap/zsj-crm-local-adapter.mjs`. It composes only public Database, Organization, Workforce Access, Authorization, App Registry, Audit, and Outbox APIs plus the Keycloak Admin HTTP API; it does not query module tables directly.

The adapter additionally requires absolute `AI_CRM_LOCAL_BOOTSTRAP_DATABASE_URL_FILE`, `AI_CRM_LOCAL_KEYCLOAK_ADMIN_USERNAME_FILE`, and `AI_CRM_LOCAL_KEYCLOAK_ADMIN_PASSWORD_FILE` Secret references, plus the non-secret loopback `AI_CRM_LOCAL_KEYCLOAK_BASE_URL`. The target realm defaults to `ai-crm-dev` and the administrator realm defaults to `master`; override them only with `AI_CRM_LOCAL_KEYCLOAK_REALM` and `AI_CRM_LOCAL_KEYCLOAK_ADMIN_REALM`.

Apply all reviewed migrations and build the referenced platform packages before running `node scripts/bootstrap/zsj-crm-local.mjs`. Every step carries a stable resource ID and Operation ID. Existing state is accepted only after exact stable identifiers match; conflicts fail closed, and a partial failure is resumed by running the same command again. The identity step creates each Keycloak user disabled with `UPDATE_PASSWORD`, links it to the Workforce Person and local account, and leaves the local account `credential_pending`. Only after that account's organization facts and administrator Grant exist does a separate activation step move the local account to `active` and finally enable Keycloak. If Keycloak enablement fails, the disabled identity keeps access closed and replay retries only the unfinished activation. Passwords remain inside the coordinator-to-Keycloak call and are never written to PostgreSQL, Audit, Outbox, output, or command arguments.
