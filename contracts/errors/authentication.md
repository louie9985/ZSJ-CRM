# Authentication Errors

Authentication errors expose only a stable category and bounded safe message. They never distinguish a missing, disabled, or wrong-password account and never include passwords, hashes, cookies, Session handles, request bodies, or internal exceptions.

| Code | HTTP | Meaning |
|---|---:|---|
| `authentication_invalid_credentials` | 401 | The identifier/password pair or required active workforce context is invalid. |
| `authentication_required` | 401 | The Session is absent, expired, revoked, or no longer matches account/workforce facts. |
| `authentication_csrf_rejected` | 403 | A cookie mutation failed trusted-origin or CSRF validation. |
| `authentication_rate_limited` | 429 | The identifier or source failure threshold was reached. |
| `authentication_dependency_unavailable` | 503 | A required account, organization, authorization, audit, PostgreSQL, or Redis dependency failed closed. |

Business authorization denial remains owned by the authorization module.
