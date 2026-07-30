import { readFile } from "node:fs/promises";

const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const EVIDENCE_REFERENCE = /^evidence:\/\/[A-Za-z0-9][A-Za-z0-9._/-]{0,255}$/u;
const SAFE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,127}$/u;
const POSTGRES_VERSION = /^[1-9][0-9]{0,2}\.[0-9]{1,3}(?:\.[0-9]{1,3})?$/u;
const WAL_SEGMENT = /^[A-F0-9]{24}$/u;
const SECRET_LIKE_KEY = /(?:password|secret|token|cookie|credential|private.?key|session.?key|authorization|dsn)/iu;
const UNAPPROVED_CLAIM_KEY = /(?:rpo|rto|sla|retention|frequency|schedule|owner)/iu;
const SENSITIVE_VALUE = /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:password|secret|token|cookie|credential|private.?key|session.?key|authorization|dsn)\s*[:=]|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKI[AD][A-Z0-9]{12,}|xox[baprs]-[A-Za-z0-9-]{10,}|sk-[A-Za-z0-9_-]{20,})/iu;

const exactKeys = (value, expected, path, errors) => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${path} must be an object.`);
    return false;
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    errors.push(`${path} must contain exactly: ${wanted.join(", ")}.`);
    return false;
  }
  return true;
};

const scanForForbiddenContent = (value, path, errors) => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanForForbiddenContent(item, `${path}[${index}]`, errors));
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (SECRET_LIKE_KEY.test(key)) errors.push(`${path}.${key} is a forbidden Secret-like field.`);
      if (UNAPPROVED_CLAIM_KEY.test(key)) errors.push(`${path}.${key} is an unapproved recovery claim field.`);
      scanForForbiddenContent(child, `${path}.${key}`, errors);
    }
    return;
  }
  if (typeof value === "string" && SENSITIVE_VALUE.test(value)) {
    errors.push(`${path} contains forbidden sensitive-looking content.`);
  }
};

const validateSafeReference = (value, path, errors) => {
  if (typeof value !== "string" || !SAFE_REFERENCE.test(value)) {
    errors.push(`${path} must be a bounded safe reference.`);
  }
};

const sameNormalizedReference = (left, right) => typeof left === "string"
  && typeof right === "string"
  && left.toLocaleLowerCase("en-US") === right.toLocaleLowerCase("en-US");

const validateEvidenceBinding = (value, path, errors) => {
  if (!exactKeys(value, ["evidenceRef", "evidenceDigest"], path, errors)) return;
  if (typeof value.evidenceRef !== "string" || !EVIDENCE_REFERENCE.test(value.evidenceRef)) {
    errors.push(`${path}.evidenceRef must be a bounded evidence:// reference.`);
  }
  if (typeof value.evidenceDigest !== "string" || !SHA256.test(value.evidenceDigest)) {
    errors.push(`${path}.evidenceDigest must be a sha256 reference.`);
  }
};

const validateDatabase = (value, name, errors) => {
  const path = `databases.${name}`;
  if (!exactKeys(value, ["backupArtifact", "backupEvidence", "restoreEvidence", "verificationEvidence"], path, errors)) return;
  validateEvidenceBinding(value.backupArtifact, `${path}.backupArtifact`, errors);
  validateEvidenceBinding(value.backupEvidence, `${path}.backupEvidence`, errors);
  validateEvidenceBinding(value.restoreEvidence, `${path}.restoreEvidence`, errors);
  validateEvidenceBinding(value.verificationEvidence, `${path}.verificationEvidence`, errors);
};

const validateDistinctDatabaseEvidence = (databases, names, errors) => {
  for (const evidenceName of ["backupArtifact", "backupEvidence", "restoreEvidence", "verificationEvidence"]) {
    const references = names.map((name) => databases[name]?.[evidenceName]?.evidenceRef);
    if (references.every((reference) => typeof reference === "string")
      && new Set(references.map((reference) => reference.toLocaleLowerCase("en-US"))).size !== names.length) {
      errors.push(`databases must use distinct ${evidenceName}.evidenceRef values for ai_crm, keycloak, and flowable.`);
    }
  }
};

const validateEvidenceGroup = (value, keys, path, errors) => {
  if (!exactKeys(value, keys, path, errors)) return;
  for (const key of keys) validateEvidenceBinding(value[key], `${path}.${key}`, errors);
};

export const validateRecoveryEvidence = (manifest) => {
  const errors = [];
  const validManifest = exactKeys(manifest, [
    "schemaVersion",
    "exerciseRef",
    "operatorRef",
    "approverRef",
    "source",
    "target",
    "postgres",
    "databases",
    "walArchive",
    "offsiteBackup",
    "rabbitmqRecovery",
    "configurationArtifacts",
    "encryptedEmergencyBundle",
    "emptyHostRecovery",
    "securityExercises",
  ], "manifest", errors);
  scanForForbiddenContent(manifest, "manifest", errors);
  if (!validManifest) return [...new Set(errors)];

  if (manifest.schemaVersion !== 1) errors.push("schemaVersion must be 1.");
  validateSafeReference(manifest.exerciseRef, "exerciseRef", errors);
  validateSafeReference(manifest.operatorRef, "operatorRef", errors);
  validateSafeReference(manifest.approverRef, "approverRef", errors);
  if (sameNormalizedReference(manifest.operatorRef, manifest.approverRef)) {
    errors.push("operatorRef and approverRef must be distinct after case normalization.");
  }

  if (exactKeys(manifest.source, ["environmentRef", "failureDomainRef"], "source", errors)) {
    validateSafeReference(manifest.source.environmentRef, "source.environmentRef", errors);
    validateSafeReference(manifest.source.failureDomainRef, "source.failureDomainRef", errors);
  }
  if (exactKeys(manifest.target, ["environmentRef", "failureDomainRef", "isolationEvidence"], "target", errors)) {
    validateSafeReference(manifest.target.environmentRef, "target.environmentRef", errors);
    validateSafeReference(manifest.target.failureDomainRef, "target.failureDomainRef", errors);
    validateEvidenceBinding(manifest.target.isolationEvidence, "target.isolationEvidence", errors);
  }
  if (sameNormalizedReference(manifest.source?.environmentRef, manifest.target?.environmentRef)) {
    errors.push("source.environmentRef and target.environmentRef must be distinct after case normalization.");
  }
  if (sameNormalizedReference(manifest.source?.failureDomainRef, manifest.target?.failureDomainRef)) {
    errors.push("source.failureDomainRef and target.failureDomainRef must be distinct after case normalization.");
  }

  if (exactKeys(manifest.postgres, ["version", "versionEvidence"], "postgres", errors)) {
    if (typeof manifest.postgres.version !== "string" || !POSTGRES_VERSION.test(manifest.postgres.version)) {
      errors.push("postgres.version must be an explicit PostgreSQL version.");
    }
    validateEvidenceBinding(manifest.postgres.versionEvidence, "postgres.versionEvidence", errors);
  }

  const databaseNames = ["ai_crm", "keycloak", "flowable"];
  if (exactKeys(manifest.databases, databaseNames, "databases", errors)) {
    for (const name of databaseNames) validateDatabase(manifest.databases[name], name, errors);
    validateDistinctDatabaseEvidence(manifest.databases, databaseNames, errors);
  }

  if (exactKeys(manifest.walArchive, ["startSegment", "endSegment", "continuityEvidence", "restoreEvidence"], "walArchive", errors)) {
    if (typeof manifest.walArchive.startSegment !== "string" || !WAL_SEGMENT.test(manifest.walArchive.startSegment)) {
      errors.push("walArchive.startSegment must be a 24-character uppercase WAL segment name.");
    }
    if (typeof manifest.walArchive.endSegment !== "string" || !WAL_SEGMENT.test(manifest.walArchive.endSegment)) {
      errors.push("walArchive.endSegment must be a 24-character uppercase WAL segment name.");
    }
    if (WAL_SEGMENT.test(manifest.walArchive.startSegment) && WAL_SEGMENT.test(manifest.walArchive.endSegment)
      && manifest.walArchive.endSegment < manifest.walArchive.startSegment) {
      errors.push("walArchive.endSegment must not precede walArchive.startSegment.");
    }
    validateEvidenceBinding(manifest.walArchive.continuityEvidence, "walArchive.continuityEvidence", errors);
    validateEvidenceBinding(manifest.walArchive.restoreEvidence, "walArchive.restoreEvidence", errors);
  }

  validateEvidenceGroup(manifest.offsiteBackup, [
    "failureDomainSeparation",
    "privateAccess",
    "atRestEncryption",
    "transportEncryption",
  ], "offsiteBackup", errors);
  validateEvidenceGroup(manifest.rabbitmqRecovery, [
    "topologyArtifact",
    "outboxReconciliation",
    "inboxReconciliation",
    "businessStateReconciliation",
  ], "rabbitmqRecovery", errors);
  validateEvidenceGroup(manifest.configurationArtifacts, [
    "compose",
    "nginx",
    "keycloakRealm",
    "flowableConfiguration",
    "infrastructureInventory",
  ], "configurationArtifacts", errors);
  validateEvidenceGroup(manifest.encryptedEmergencyBundle, [
    "artifact",
    "offlinePublicKeyEncryption",
    "decryptionKeySeparation",
    "isolatedRestore",
  ], "encryptedEmergencyBundle", errors);
  validateEvidenceGroup(manifest.emptyHostRecovery, [
    "hostProvisioning",
    "databaseRestore",
    "serviceStartup",
    "actualRestorePoint",
    "elapsedTime",
    "dataDifference",
    "recoveryVerification",
  ], "emptyHostRecovery", errors);
  validateEvidenceGroup(manifest.securityExercises, [
    "hostCompromise",
    "accessMaterialLeak",
    "offboardingRevocation",
  ], "securityExercises", errors);

  return [...new Set(errors)];
};

export const readAndValidateRecoveryEvidence = async (path) => {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    return { errors: [`Recovery evidence could not be read as JSON: ${error instanceof Error ? error.message : "unknown error"}`] };
  }
  return { errors: validateRecoveryEvidence(manifest), manifest };
};
