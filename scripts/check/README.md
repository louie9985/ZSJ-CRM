# Check Scripts

These scripts enforce repository structure, dependency boundaries, generated-contract drift, migration safety, Compose safety and integration evidence.

`run-e2e-browser-authentication.mjs` starts the local API against the development PostgreSQL and Redis endpoints and exercises both local authentication surfaces over HTTP. It logs in as the bootstrap administrator, verifies the PC and internal-H5 cookies are independent, reads each Session and CSRF token, logs both out, and confirms the revoked credentials are rejected. It never logs the bootstrap password or Cookie values.

`run-production-edge-integration.mjs` starts two isolated mock API containers and a read-only, non-root Nginx edge. It verifies `/auth/pc/*` and `/auth/internal-h5/*` are proxied without rewriting and removed routes remain closed.

`verify-worker-drain.mjs` validates the rendered Host B drain timeout against Compose `stop_grace_period`. RabbitMQ, Flowable, PostgreSQL, File Center and durable main-chain runners own unique test projects and clean only their scoped resources.
