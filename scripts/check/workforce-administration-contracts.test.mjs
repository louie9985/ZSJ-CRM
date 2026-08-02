import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import YAML from "yaml";

const contract = YAML.parse(await readFile(new URL("../../contracts/http/modules/workforce-administration.openapi.yaml", import.meta.url), "utf8"));

test("Workforce Administration commands are a closed discriminated union", () => {
  const command = contract.components.schemas.WorkforceAdministrationCommand;
  assert.equal(command.discriminator.propertyName, "kind");
  assert.equal(command.oneOf.length, 18);
  const variants = command.oneOf.map(({ $ref }) => {
    assert.match($ref, /^#\/components\/schemas\/[A-Za-z]+Command$/u);
    return contract.components.schemas[$ref.split("/").at(-1)];
  });
  assert.equal(variants.every((variant) => variant.type === "object" && variant.additionalProperties === false), true);
  assert.equal(variants.every((variant) => variant.required.includes("kind")), true);
  const kinds = variants.map((variant) => variant.properties.kind.const);
  assert.equal(new Set(kinds).size, 18);
  assert.deepEqual(kinds.sort(), [
    "complete_credential_ceremony", "create_account", "create_department", "create_position",
    "deactivate_account", "deactivate_department", "deactivate_position", "reactivate_account",
    "reactivate_department", "reactivate_position", "release_phone", "reset_password", "retry_identity_sync",
    "set_crm_administrator", "update_account", "update_department", "update_position", "update_system_account",
  ]);
  assert.equal(variants.every((variant) => variant.properties.password === undefined && variant.properties.token === undefined), true);
  const systemUpdate = variants.find((variant) => variant.properties.kind.const === "update_system_account");
  assert.deepEqual(Object.keys(systemUpdate.properties).sort(), ["accountId", "expectedRevision", "kind", "phone", "username"]);
  assert.deepEqual(systemUpdate.required.sort(), ["accountId", "expectedRevision", "kind", "username"]);
  const retry = variants.find((variant) => variant.properties.kind.const === "retry_identity_sync");
  assert.deepEqual(Object.keys(retry.properties).sort(), ["accountId", "expectedRevision", "failedOperationId", "kind"]);
  assert.deepEqual(retry.required.sort(), ["accountId", "expectedRevision", "failedOperationId", "kind"]);
});

test("Workforce account listing has bounded pagination and reviewed filters", () => {
  const operation = contract.paths["/workforce-administration/accounts"].get;
  assert.equal(operation.operationId, "listWorkforceAccounts");
  assert.equal(operation["x-ai-crm-permission"].code, "platform.workforce-access.console:read");
  const parameters = Object.fromEntries(operation.parameters.map((parameter) => [parameter.name, parameter]));
  assert.deepEqual(Object.keys(parameters).sort(), ["departmentId", "legalName", "page", "pageSize", "phone", "positionId", "status", "username"]);
  assert.equal(parameters.page.schema.minimum, 1);
  assert.equal(parameters.pageSize.schema.minimum, 1);
  assert.equal(parameters.pageSize.schema.maximum, 100);
  assert.equal(parameters.phone.schema.pattern, "^\\+?[0-9 -]{6,24}$");
  assert.equal(operation.responses["200"].content["application/json"].schema.$ref, "#/components/schemas/WorkforceAccountPage");
});

test("Workforce account synchronization projection exposes no identity payload", () => {
  const account = contract.components.schemas.WorkforceAccount;
  assert.equal(account.properties.latestIdentitySync.$ref, "#/components/schemas/IdentitySyncOperation");
  assert.equal(contract.components.schemas.AllowedAction.enum.includes("retry_identity_sync"), true);
  const projection = contract.components.schemas.IdentitySyncOperation;
  assert.equal(projection.additionalProperties, false);
  assert.deepEqual(Object.keys(projection.properties).sort(), ["action", "completedAt", "errorCode", "operationId", "requestedAt", "retryOfOperationId", "status"]);
  assert.equal(projection.properties.phone, undefined);
  assert.equal(projection.properties.username, undefined);
  assert.equal(projection.properties.traceId, undefined);
});
