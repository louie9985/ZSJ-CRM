import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { TextEncoder } from "node:util";

if (process.env.AI_CRM_E2E_FILE_CLAMAV_INTEGRATION !== "true") {
  throw new Error("Run this scenario through scripts/check/run-e2e-file-clamav-integration.mjs.");
}

const host = process.env.AI_CRM_TEST_CLAMAV_HOST ?? "127.0.0.1";
const port = Number(process.env.AI_CRM_TEST_CLAMAV_PORT);
if (!Number.isSafeInteger(port) || port < 1024 || port > 65_535) throw new Error("AI_CRM_TEST_CLAMAV_PORT is invalid.");
const unavailablePort = Number(process.env.AI_CRM_TEST_CLAMAV_UNAVAILABLE_PORT);
if (!Number.isSafeInteger(unavailablePort) || unavailablePort < 1024 || unavailablePort > 65_535 || unavailablePort === port) throw new Error("AI_CRM_TEST_CLAMAV_UNAVAILABLE_PORT is invalid.");

const e2eRequire = createRequire(resolve("tests/e2e/package.json"));
const workerUrl = pathToFileURL(e2eRequire.resolve("@ai-crm/worker")).href;
const workerRequire = createRequire(resolve("apps/worker/package.json"));
const fileCenterUrl = pathToFileURL(workerRequire.resolve("@ai-crm/platform-file-center")).href;
const [{ ClamAvMalwareScanner }, { MemoryFileCenterStore, createFileCenterService }] = await Promise.all([
  import(workerUrl),
  import(fileCenterUrl),
]);

const text = new TextEncoder();
const CLEAN_BYTES = text.encode("AI-CRM synthetic clean file fixture\n");
const EICAR_BYTES = text.encode("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*");
const actor = Object.freeze({ actorId: "system.file-scan-e2e", actorType: "system" });
const traceId = "f11ec1a5f11ec1a5f11ec1a5f11ec1a5";

class IsolatedStorage {
  objects = new Map();
  quarantined = new Set();
  handles = [];

  async createUploadGrant(input) {
    this.handles.push(input.objectHandle);
    return { headers: { "content-type": input.declaredMediaType }, url: `https://upload.invalid/${input.objectHandle}` };
  }
  async createDownloadGrant(input) { return { url: `https://download.invalid/${input.objectHandle}` }; }
  async deleteObject(input) { this.objects.delete(input.objectHandle); }
  async inspectObject(input) {
    const object = this.objects.get(input.objectHandle);
    return object === undefined
      ? { exists: false }
      : { checksumSha256: "a".repeat(64), detectedMediaType: object.mediaType, exists: true, sizeBytes: object.bytes.byteLength };
  }
  async quarantineObject(input) {
    assert.ok(this.objects.has(input.objectHandle), "only an existing object can be quarantined");
    this.quarantined.add(input.objectHandle);
  }
  async readObject(input) {
    const object = this.objects.get(input.objectHandle);
    if (object === undefined) throw new Error("test_object_missing");
    if (object.bytes.byteLength > input.maximumBytes) throw new Error("test_object_too_large");
    return object.bytes;
  }
}

let idSequence = 1;
const nextId = () => `f11ec1a5-0000-4000-8000-${String(idSequence++).padStart(12, "0")}`;
const metadata = (operationId = nextId()) => ({ actor, operationId, reason: "isolated ClamAV conformance", traceId });

function runtime(scannerPort = port) {
  const store = new MemoryFileCenterStore();
  const storage = new IsolatedStorage();
  const audits = [];
  const authorizationRequests = [];
  const scanner = new ClamAvMalwareScanner({ host, port: scannerPort, timeoutMs: 10_000 });
  const service = createFileCenterService(
    store,
    storage,
    scanner,
    { authorize: async (input) => { authorizationRequests.push(input); return { allowed: true, decisionId: nextId() }; } },
    { record: async (input) => { audits.push(input); } },
    { downloadGrantTtlMs: 60_000, id: nextId, maximumScanBytes: 1024, maximumUploadBytes: 1024, uploadSessionTtlMs: 60_000 },
  );
  return { audits, authorizationRequests, service, storage, store };
}

async function pendingUpload(target, bytes, operationId = nextId()) {
  const created = await target.service.createUploadSession({
    ...metadata(operationId),
    declaredMediaType: "text/plain",
    declaredSizeBytes: bytes.byteLength,
    displayName: "synthetic-clamav-fixture.txt",
    ownerModule: "platform.synthetic-e2e",
  });
  const handle = target.storage.handles.at(-1);
  assert.ok(handle);
  target.storage.objects.set(handle, { bytes, mediaType: "text/plain" });
  const completed = await target.service.completeUpload({ ...metadata(), sessionId: created.session.sessionId });
  assert.equal(completed.contentVersion.status, "pending_scan");
  return { completed, created, handle };
}

const clean = runtime();
const cleanUpload = await pendingUpload(clean, CLEAN_BYTES);
const cleanOperationId = nextId();
const cleanCommand = { ...metadata(cleanOperationId), contentVersionId: cleanUpload.completed.contentVersion.contentVersionId };
const cleanResult = await clean.service.scanContentVersion(cleanCommand);
assert.equal(cleanResult.contentVersion.status, "available");
assert.equal(cleanResult.replayed, false);
const cleanReplay = await clean.service.scanContentVersion(cleanCommand);
assert.equal(cleanReplay.contentVersion.status, "available");
assert.equal(cleanReplay.replayed, true);
assert.equal(clean.storage.quarantined.size, 0);
assert.ok(clean.authorizationRequests.some((request) => request.action === "file:scan"));
assert.ok(clean.audits.some((entry) => entry.action === "file:scan" && entry.result === "succeeded"));

const malicious = runtime();
const maliciousUpload = await pendingUpload(malicious, EICAR_BYTES);
const maliciousOperationId = nextId();
const maliciousCommand = { ...metadata(maliciousOperationId), contentVersionId: maliciousUpload.completed.contentVersion.contentVersionId };
const maliciousResult = await malicious.service.scanContentVersion(maliciousCommand);
assert.equal(maliciousResult.contentVersion.status, "quarantined");
assert.equal(maliciousResult.replayed, false);
assert.ok(malicious.storage.quarantined.has(maliciousUpload.handle));
const maliciousReplay = await malicious.service.scanContentVersion(maliciousCommand);
assert.equal(maliciousReplay.contentVersion.status, "quarantined");
assert.equal(maliciousReplay.replayed, true);
assert.equal(malicious.storage.quarantined.size, 1);

const unavailable = runtime(unavailablePort);
const unavailableUpload = await pendingUpload(unavailable, CLEAN_BYTES);
const unavailableCommand = { ...metadata(), contentVersionId: unavailableUpload.completed.contentVersion.contentVersionId };
await assert.rejects(
  unavailable.service.scanContentVersion(unavailableCommand),
  (error) => error?.code === "file_center_scan_unavailable" && error?.retryable === true,
);
const unavailableState = await unavailable.store.findContentVersion(unavailableUpload.completed.contentVersion.contentVersionId);
assert.equal(unavailableState?.contentVersion.status, "pending_scan");
assert.equal(unavailable.storage.quarantined.size, 0);
assert.ok(unavailable.audits.some((entry) => entry.action === "file:scan" && entry.result === "failed"));

process.stdout.write(`${JSON.stringify({
  cleanStatus: cleanResult.contentVersion.status,
  maliciousStatus: maliciousResult.contentVersion.status,
  replayedClean: cleanReplay.replayed,
  replayedMalicious: maliciousReplay.replayed,
  scannerUnavailableStatus: unavailableState?.contentVersion.status,
})}\n`);
