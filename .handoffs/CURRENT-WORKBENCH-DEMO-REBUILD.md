# Current Workbench Demo Rebuild

## Objective

Rebuild the current PC workbench shell and platform-neutral home with the confirmed Demo layout and visual density, without importing Demo business facts or runtime architecture.

## Known Facts

- The confirmed Demo uses two full-height collapsible Siders, a 48px header over the workspace, a compact metric strip, and a 16/8 work area.
- The current product direction fixes the primary navigation for every position as Workbench, Calendar, Approvals, Notifications, Mail, and Settings.
- Calendar, Approvals, Notifications, Mail, and Settings use one shared secondary-navigation definition for every position; only Workbench may vary by authorization view.
- The formal workbench already receives task, notification, form, file, Assignment Context, navigation, and authorization views through its existing ports.
- Authentication, polling, routing, error recovery, and server-side authorization boundaries already exist and remain in scope.

## Allowed Assumptions

- The Demo shell dimensions and page composition are visual acceptance facts.
- Existing platform-neutral Fixture collections may populate the Demo-shaped work areas during development and tests.
- The Demo's shared secondary labels and two-column navigation hierarchy may be reused as front-end placeholders under the current explicit request.
- A read-only search control may preserve the header layout until a reviewed search contract exists.

## Forbidden Assumptions

- Demo roles, students, people, departments, SLAs, approval routes, business metrics, Umi models, stores, Action Engine state, and localStorage persistence are not formal facts.
- Placeholder routes and labels do not establish a domain entity, permission, workflow, provider, or server contract.
- Notification delivery or read state does not prove task completion.
- Frontend visibility does not replace server-side authorization.

## Non-goals

- No CRM domain module, schema, HTTP contract, migration, provider integration, real mail capability, AI assistant, simulated clock, or theme marketplace is added.
- No production Secret, token handling, logging, telemetry, or deployment topology is changed.

## Implementation

- `workbench-shell.tsx` owns the full-height 144/56px and 180/48px Siders, breadcrumb, Assignment Context presentation, read-only search placeholder, notification entry, and account menu.
- `navigation.tsx` always returns the six confirmed primary destinations. Calendar, Approvals, Notifications, Mail, and Settings share one immutable secondary structure; authorized position-specific entries remain inside Workbench.
- `feature-placeholder-page.tsx` provides the common front-end-only empty state used by all shared secondary routes. It has no port, request, persistence, or command behavior.
- `workspace-home.tsx` owns the 24px page rhythm and 70px compact metric strip.
- `overview-page.tsx` maps existing platform collections into the 2:1 task/activity layout without inventing time, SLA, role, or domain state.
- Authentication, logout, polling, route restoration, authorization-filtered navigation, and runtime failure states remain connected through `App.tsx`.

## Review Checklist

- Authorization: unchanged; navigation remains presentation-only and APIs remain authoritative.
- Idempotency: no new write command; logout retains the existing pending guard.
- Transactions and migrations: not applicable; no persistence or schema change.
- Observability: no new logs, metrics, traces, provider SDK, or sensitive data exposure.
- Backward compatibility: canonical `/crm/*` routes and legacy redirects remain unchanged.
- Backward compatibility: existing platform notification item deep links remain routable while the visible Notifications navigation opens the new placeholder routes.
- Visual compatibility: shell dimensions, collapsible navigation, metric strip, task panel, and activity panel have executable assertions and browser evidence.

## Unresolved Assumptions

- Global search remains visually present but read-only until a reviewed cross-module search contract exists.
- Activity items use the existing notification projection because no separate platform activity contract currently exists.
- The shared placeholder labels are navigation copy only. Their data, authorization, state, actions, and backend contracts remain unresolved and must not be inferred from this handoff.

## Browser Evidence

- At the shared 1280x720 viewport, the formal shell and Demo both render the primary Sider at `x=0, width=144`, secondary Sider at `x=144, width=180`, workspace header at `x=324, y=0, height=48`, page title at `x=348, y=72, height=28`, and metric cards at `y=116, height=70`.
- The formal task/activity row starts at `x=348, y=202`, with task width `600`, activity width `292`, and a `16px` gap, matching the Demo row geometry.
- Collapsing the formal shell produces exact `56px` and `48px` Sider widths.
- Desktop checks at 1366x768, 1440x900, and 1920x1080 and a mobile check at 390x844 had no horizontal document overflow. Mobile resolves to a 56px primary Sider, hides the secondary Sider, and stacks the home panels.
- The home workspace has no outer scroll overflow at 1280x720; task and activity panels own their scrolling.
