import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";
import { validateRecoveryEvidence } from "../backup/recovery-evidence.mjs";

const fixture = JSON.parse(await readFile(new URL("../backup/recovery-evidence.example.json", import.meta.url), "utf8"));
const copy = () => JSON.parse(JSON.stringify(fixture));

test("accepts the complete synthetic recovery evidence shape repeatedly", () => {
  assert.deepEqual(validateRecoveryEvidence(copy()), []);
  assert.deepEqual(validateRecoveryEvidence(copy()), []);
});

test("requires ai_crm and flowable evidence independently", () => {
  const manifest = copy();
  delete manifest.databases.flowable;
  assert.ok(validateRecoveryEvidence(manifest).some((error) => error.startsWith("databases must contain exactly:")));
});

test("rejects reused evidence across the independently restored databases", () => {
  const manifest = copy();
  manifest.databases.flowable = copy().databases.ai_crm;
  const errors = validateRecoveryEvidence(manifest);
  for (const evidenceName of ["backupArtifact", "backupEvidence", "restoreEvidence", "verificationEvidence"]) {
    assert.ok(errors.includes(`databases must use distinct ${evidenceName}.evidenceRef values for ai_crm and flowable.`));
  }
});

test("requires WAL continuity and restore evidence instead of a boolean claim", () => {
  const manifest = copy();
  manifest.walArchive.continuityEvidence = true;
  const errors = validateRecoveryEvidence(manifest);
  assert.ok(errors.includes("walArchive.continuityEvidence must be an object."));
});

test("rejects reversed WAL segment boundaries", () => {
  const manifest = copy();
  manifest.walArchive.startSegment = "000000010000000000000003";
  manifest.walArchive.endSegment = "000000010000000000000002";
  assert.ok(validateRecoveryEvidence(manifest).includes("walArchive.endSegment must not precede walArchive.startSegment."));
});

test("requires distinct isolated recovery environment and failure domain", () => {
  const manifest = copy();
  manifest.target.environmentRef = manifest.source.environmentRef.toUpperCase();
  manifest.target.failureDomainRef = manifest.source.failureDomainRef.toUpperCase();
  const errors = validateRecoveryEvidence(manifest);
  assert.ok(errors.includes("source.environmentRef and target.environmentRef must be distinct after case normalization."));
  assert.ok(errors.includes("source.failureDomainRef and target.failureDomainRef must be distinct after case normalization."));
});

test("requires a distinct operator and approver after normalization", () => {
  const manifest = copy();
  manifest.approverRef = manifest.operatorRef.toUpperCase();
  assert.ok(validateRecoveryEvidence(manifest).includes("operatorRef and approverRef must be distinct after case normalization."));
});

test("requires RabbitMQ topology plus Outbox Inbox and business-state reconciliation", () => {
  const manifest = copy();
  delete manifest.rabbitmqRecovery.inboxReconciliation;
  assert.ok(validateRecoveryEvidence(manifest).some((error) => error.startsWith("rabbitmqRecovery must contain exactly:")));
});

test("requires actual restore point elapsed time and data difference evidence", () => {
  const manifest = copy();
  delete manifest.emptyHostRecovery.actualRestorePoint;
  delete manifest.emptyHostRecovery.elapsedTime;
  delete manifest.emptyHostRecovery.dataDifference;
  assert.ok(validateRecoveryEvidence(manifest).some((error) => error.startsWith("emptyHostRecovery must contain exactly:")));
});

test("rejects unknown Secret-like and unapproved recovery claim fields without echoing values", () => {
  const manifest = copy();
  manifest.operatorToken = "do-not-echo-this-value";
  manifest.rpo = "invented-claim";
  const errors = validateRecoveryEvidence(manifest);
  assert.ok(errors.some((error) => error.includes("operatorToken is a forbidden Secret-like field")));
  assert.ok(errors.some((error) => error.includes("rpo is an unapproved recovery claim field")));
  assert.ok(errors.every((error) => !error.includes("do-not-echo-this-value")));
  assert.ok(errors.every((error) => !error.includes("invented-claim")));
});

test("rejects sensitive-looking values even under otherwise permitted fields", () => {
  for (const sensitiveValue of [
    "ghp_1234567890abcdefghijklmnop",
    "AKID1234567890ABCDEF",
    "sk-1234567890abcdefghijklmnop",
    "-----BEGIN PRIVATE KEY-----",
  ]) {
    const manifest = copy();
    manifest.exerciseRef = sensitiveValue;
    const errors = validateRecoveryEvidence(manifest);
    assert.ok(errors.some((error) => error === "manifest.exerciseRef contains forbidden sensitive-looking content."));
    assert.ok(errors.every((error) => !error.includes(sensitiveValue)));
  }
});

test("rejects HTTP evidence links and malformed digests", () => {
  const manifest = copy();
  manifest.databases.ai_crm.backupEvidence.evidenceRef = "https://example.invalid/evidence";
  manifest.databases.ai_crm.backupEvidence.evidenceDigest = "not-a-digest";
  const errors = validateRecoveryEvidence(manifest);
  assert.ok(errors.includes("databases.ai_crm.backupEvidence.evidenceRef must be a bounded evidence:// reference."));
  assert.ok(errors.includes("databases.ai_crm.backupEvidence.evidenceDigest must be a sha256 reference."));
});

test("rejects self-asserted boolean evidence gates", () => {
  const manifest = copy();
  manifest.securityExercises.hostCompromise = true;
  assert.ok(validateRecoveryEvidence(manifest).includes("securityExercises.hostCompromise must be an object."));
});
