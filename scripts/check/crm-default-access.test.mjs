import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import YAML from "yaml";

const root = resolve(import.meta.dirname, "../..");
const read = (path) => readFile(resolve(root, path), "utf8");

test("CRM base access remains a reviewed Assignment-bound policy capability", async () => {
  const [schema, catalog, bootstrap, facade] = await Promise.all([
    read("contracts/permissions/platform-permission-catalog.v1.schema.json").then(JSON.parse),
    read("contracts/permissions/crm-permission-catalog.v1.json").then(JSON.parse),
    read("scripts/bootstrap/zsj-crm-local-adapter.mjs"),
    read("apps/api/src/workforce-administration/facade.ts"),
  ]);
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
  assert.equal(validate(catalog), true, JSON.stringify(validate.errors));
  assert.deepEqual(catalog.permissions, [{ action: "access", code: "crm.application:access", owner: "crm.application", resource: "crm.application", scopeDimensions: [] }]);
  assert.match(bootstrap, /roleKey: "crm\.application-user"/u);
  assert.match(bootstrap, /\["crm\.application:access", "platform\.workbench\.shell:read"\]/u);
  assert.match(bootstrap, /subject: \{ assignmentId: ZSJ_CRM_LOCAL_IDS\.crmAdministratorAssignmentId, kind: "assignment" \}/u);
  assert.ok(facade.indexOf("setApplicationGrant") < facade.indexOf("setPasswordAndEnable"), "base Grant must precede Keycloak enablement");
});

test("workbench bootstrap additions stay optional and the client has one shell", async () => {
  const [contract, app, shell, registry] = await Promise.all([
    read("contracts/http/modules/workbench.openapi.yaml").then(YAML.parse),
    read("apps/workbench-web/src/App.tsx"),
    read("apps/workbench-web/src/workbench-shell.tsx"),
    read("apps/workbench-web/src/workspace-profiles.tsx"),
  ]);
  const schema = contract.components.schemas.WorkbenchBootstrap;
  assert.ok(schema.properties.applicationIds);
  assert.ok(schema.properties.workspaceProfileId);
  assert.equal(schema.required.includes("applicationIds"), false);
  assert.equal(schema.required.includes("workspaceProfileId"), false);
  assert.equal((app.match(/<WorkbenchShell/u) ?? []).length, 1);
  assert.match(registry, /crm\.workspace\.unconfigured/u);
  assert.doesNotMatch(registry, /Sider|Header|account-trigger/u);
  assert.match(shell, /一级导航/u);
});
