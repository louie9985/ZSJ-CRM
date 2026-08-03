# Workbench Web

PC workbench based on React 19, Vite, TypeScript, Ant Design 6, Ant Design Pro Components, React Router, and TanStack Query.

The local development server uses `127.0.0.1:3000`. The application shell restores the same-site PC session through the BFF, starts the reviewed `/auth/pc/login` flow when no valid session exists, lands on the application-selection layer after authentication, and lets the user enter the CRM application at `/crm/workspace`. The application selector and CRM shell both expose the current minimal account view and the same CSRF-protected logout behavior; a completed logout remains signed out until the user explicitly starts login again. The Vite development server proxies BFF routes to `AI_CRM_WORKBENCH_BFF_ORIGIN` or `http://127.0.0.1:8088`; Keycloak redirect URI and allowed origin must match the workbench origin used by the browser. Authentication, authorization, and platform capabilities are consumed through reviewed BFF/module contracts. Test-only fixtures may be injected through `WorkbenchPort`; the default development runtime does not synthesize a signed-in user.

PC Web uses a same-site BFF session. Browser JavaScript must never receive or persist Keycloak access, refresh, or ID tokens; it only consumes the minimal current-user view and sends CSRF-protected requests with the HTTP-only session cookie. See [ADR-0005](../../docs/08-架构决策/ADR-0005-PC-Web采用BFF登录会话.md).

The first foundation stage enables standard Keycloak login. Internal workforce association is defined by ADR-0018, but WeCom/WeChat provider login remains disabled until provider configuration is approved and the external account lifecycle is defined. See [第一阶段认证范围](../../docs/01-权威与基线/第一阶段认证范围.md), [ADR-0017](../../docs/08-架构决策/ADR-0017-多客户端认证与服务端会话.md), and [ADR-0018](../../docs/08-架构决策/ADR-0018-内部人员主体关联与失效.md).

The first notification stage uses TanStack Query polling for the in-app notification list and unread count. WebSocket/SSE and external channels remain out of scope. Notification deep links resolve through the application registry and recheck authorization at the target. See [第一阶段通知范围](../../docs/01-权威与基线/第一阶段通知范围.md).

Domain-specific pages are added only after their business contracts are confirmed.

See [ADR-0001](../../docs/08-架构决策/ADR-0001-PC-Web采用Vite与Ant-Design技术栈.md) for the accepted frontend baseline and boundaries.

The existing pure-frontend workbench Demo is the confirmed design and interaction reference, not an implementation or business source. The formal shell reproduces its full-height 144/56px primary Sider, 180/48px secondary Sider, right-side 48px header, and work-first home structure while retaining the accepted Vite architecture, formal contracts, authorization results, and server facts. New pages must preserve the Demo's information density, navigation hierarchy, master-detail patterns, URL-restorable work context, and explicit operation feedback. See [PC 工作台 Demo 参考基线](../../docs/04-工程手册/PC工作台Demo参考基线.md).
