# CURRENT-WORKBENCH-KEYCLOAK-ENTRY

> **历史记录，禁止继续执行。** 本任务中的 Keycloak、OIDC、外部身份与跳转式登录结论已于 2026-08-04 被 ADR-0034 取代。当前实现只允许自建账号密码与 `pc` / `internal-h5` HttpOnly 不透明 Session 契约。

## Scope

Align `apps/workbench-web` with the real first-stage Keycloak + PC BFF authentication flow. The workbench no longer owns an account-password login form or submits credentials to an application endpoint.

## Known Facts

- Keycloak is the only account-password authentication authority.
- PC Web uses the reviewed BFF session boundary in `apps/api`.
- Browser JavaScript must not receive Keycloak tokens or submit account passwords to `apps/api`.
- The reviewed login entry is `GET /auth/pc/login` and callback handling is owned by `apps/api`.
- `127.0.0.1:3000` is the workbench development origin; it proxies BFF routes to `AI_CRM_WORKBENCH_BFF_ORIGIN` or `http://127.0.0.1:8088`.
- The application selector is currently a static one-entry client catalog for the existing CRM shell; it is rendered as a list and can add entries, but it is not yet backed by the App Registry application list because the current workbench bootstrap response exposes only navigation IDs.

## Allowed Assumptions

- Unit tests may inject `developmentFixturePort` through `WorkbenchPort` to exercise routing and layout without making production or default development behavior synthetic.
- The application-selection page may expose the existing CRM shell entry at `/crm/workspace` without defining CRM domain entities, fields, states, permissions, SLAs, or approval routes.
- Future application-selector entries should come from a reviewed BFF/App Registry application view before they become production access facts.
- Keycloak visual customization belongs to a Keycloak Theme or deployment artifact, not to `apps/workbench-web`.

## Forbidden Assumptions

- Do not restore `/auth/pc/password-login` or any application-owned password proxy route.
- Do not make the default development runtime synthesize a signed-in user.
- Do not store Keycloak tokens, passwords, authorization code payloads, or permission sets in browser state.
- Do not treat authentication success as business authorization.

## Non-goals

- No CRM domain module, business schema, dashboard, lead, order, settlement, product, partner, or student feature is introduced.
- No Keycloak Theme files are implemented in this handoff.
- No production identity provider configuration or Secret value is added.

## Current Login Incident

### Confirmed

- The CRM administrator can complete the Keycloak callback, open `/applications`, see the CRM entry, and enter `/crm/workspace` with its single active Assignment selected.
- Workbench bootstrap resolves the linked Workforce account through a bounded Keycloak-subject lookup rather than a paginated administrative account scan.
- App Registry authorization receives the selected Assignment for a single-Assignment workforce user and receives only the exact `{ allowed, decisionId }` decision contract.
- HTTP `401`, `403`, and `503` now remain distinct signed-out, forbidden, and maintenance states in the browser.

### Unresolved Verification

- The ZSJ super-administrator branch is covered by facade and authorization-adapter tests, but a second real browser login has not been completed because the existing logout flow reports `退出未完成` and the available browser session must not be cleared destructively.
- Treat the ZSJ browser result as pending until logout/session isolation is repaired or a separate browser profile is available. Do not infer production access solely from the passing unit tests.

## Verification

- `pnpm --filter @ai-crm/workbench-web typecheck`
- `pnpm --filter @ai-crm/workbench-web test`
