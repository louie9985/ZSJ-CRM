# Workbench Web

The single CRM Web client runs at `127.0.0.1:3000` in local development. Employee PC and mobile routes use the `/auth/pc/*` contract; `/mobile/*` is served by this same artifact. The restricted `/part-time/*` route uses the isolated `/auth/part-time/*` contract and Cookie.

The root employee login redirects directly to `/crm/workspace`; there is no application selector. The client restores the current Session through the relevant Session endpoint and sends CSRF-protected mutations with the HttpOnly cookie.

The Vite development server proxies API routes to `AI_CRM_WORKBENCH_BFF_ORIGIN` or `http://127.0.0.1:13001`. Browser code never receives passwords after login, Session handles, provider credentials, or JWTs.
