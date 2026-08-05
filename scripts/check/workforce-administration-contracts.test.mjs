import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import YAML from "yaml";

const contract = YAML.parse(await readFile(new URL("../../contracts/http/modules/workforce-administration.openapi.yaml", import.meta.url), "utf8"));

test("Workforce Administration commands are a closed discriminated union", () => {
  const command = contract.components.schemas.WorkforceAdministrationCommand;
  assert.equal(command.discriminator.propertyName, "kind");
  assert.equal(command.oneOf.length, 16);
  const variants = command.oneOf.map(({ $ref }) => {
    assert.match($ref, /^#\/components\/schemas\/[A-Za-z]+Command$/u);
    return contract.components.schemas[$ref.split("/").at(-1)];
  });
  assert.equal(variants.every((variant) => variant.type === "object" && variant.additionalProperties === false), true);
  assert.equal(variants.every((variant) => variant.required.includes("kind")), true);
  const kinds = variants.map((variant) => variant.properties.kind.const);
  assert.equal(new Set(kinds).size, 16);
  assert.deepEqual(kinds.sort(), [
    "create_account", "create_department", "create_position",
    "deactivate_account", "deactivate_department", "deactivate_position", "reactivate_account",
    "reactivate_department", "reactivate_position", "release_phone", "reset_password",
    "set_crm_administrator", "update_account", "update_department", "update_position", "update_system_account",
  ]);
  assert.equal(variants.every((variant) => variant.properties.token === undefined), true);
  const create = variants.find((variant) => variant.properties.kind.const === "create_account");
  const reset = variants.find((variant) => variant.properties.kind.const === "reset_password");
  assert.equal(create.properties.initialPassword.writeOnly, true);
  assert.equal(reset.properties.password.writeOnly, true);
  for (const schema of [create.properties.initialPassword, reset.properties.password]) {
    assert.equal(schema.minLength, 8);
    assert.equal(schema.maxLength, 64);
    assert.equal(schema.pattern, "^[\\x20-\\x7E]{8,64}$");
  }
  assert.deepEqual(
    contract.paths["/workforce-administration/commands"].post.responses["400"].content["application/json"].schema.properties.code.enum,
    ["workforce_administration_request_invalid", "workforce_password_policy_violation"],
  );
  assert.equal(variants.filter((variant) => variant.properties.initialPassword !== undefined || variant.properties.password !== undefined).length, 2);
  const systemUpdate = variants.find((variant) => variant.properties.kind.const === "update_system_account");
  assert.deepEqual(Object.keys(systemUpdate.properties).sort(), ["accountId", "expectedRevision", "kind", "legalName", "phone", "username"]);
  assert.deepEqual(systemUpdate.required.sort(), ["accountId", "expectedRevision", "kind", "legalName", "username"]);
});

test("Workforce account listing has bounded pagination and reviewed filters", () => {
  const operation = contract.paths["/workforce-administration/accounts"].get;
  assert.equal(operation.operationId, "listWorkforceAccounts");
  assert.equal(operation["x-ai-crm-permission"].code, "crm.workforce-access.console:read");
  const parameters = Object.fromEntries(operation.parameters.map((parameter) => [parameter.name, parameter]));
  assert.deepEqual(Object.keys(parameters).sort(), ["departmentId", "legalName", "page", "pageSize", "phone", "positionId", "status", "username"]);
  assert.equal(parameters.page.schema.minimum, 1);
  assert.equal(parameters.pageSize.schema.minimum, 1);
  assert.equal(parameters.pageSize.schema.maximum, 100);
  assert.equal(parameters.phone.schema.pattern, "^\\+?[0-9 -]{6,24}$");
  assert.equal(operation.responses["200"].content["application/json"].schema.$ref, "#/components/schemas/WorkforceAccountPage");
});

test("Workforce account view exposes no provider synchronization state", () => {
  const account = contract.components.schemas.WorkforceAccount;
  assert.equal(account.properties.latestIdentitySync, undefined);
  assert.equal(contract.components.schemas.IdentitySyncOperation, undefined);
  assert.equal(contract.components.schemas.AllowedAction.enum.includes("retry_identity_sync"), false);
});
