import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const root = resolve(import.meta.dirname, "../..");
const temporaryDirectory = await mkdtemp(join(tmpdir(), "ai-crm-edge-"));
const certificate = join(temporaryDirectory, "certificate.pem");
const privateKey = join(temporaryDirectory, "private-key.pem");
const containerName = `ai-crm-edge-check-${process.pid}`;
const apiContainerNames = [`ai-crm-api-a-edge-check-${process.pid}`, `ai-crm-api-b-edge-check-${process.pid}`];
const networkName = `ai-crm-edge-check-${process.pid}`;
const secretVolume = `ai-crm-edge-secrets-${process.pid}`;
const secretGid = "20001";

const run = (command, arguments_, options = {}) => {
  const result = spawnSync(command, arguments_, { encoding: "utf8", ...options });
  if (result.status !== 0) {
    const safeOutput = `${result.stdout ?? ""}${result.stderr ?? ""}`.slice(0, 4000);
    throw new Error(`${command} failed with exit code ${result.status}: ${safeOutput}`);
  }
  return result.stdout ?? "";
};

try {
  await writeFile(join(temporaryDirectory, "api.conf"), `server {
  listen 8080;
  location / {
    default_type text/plain;
    return 200 "$uri";
  }
}\n`, { encoding: "utf8", mode: 0o600 });
  run("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=example.invalid",
    "-keyout", privateKey, "-out", certificate,
  ]);
  run("docker", ["network", "create", networkName]);
  for (const apiContainerName of apiContainerNames) run("docker", [
    "run", "--detach", "--rm", "--name", apiContainerName, "--network", networkName,
    "-v", `${join(temporaryDirectory, "api.conf")}:/etc/nginx/conf.d/default.conf:ro`, "nginx:1.28.0-alpine",
  ]);
  run("docker", ["volume", "create", secretVolume]);
  run("docker", [
    "run", "--rm", "--user", "0:0", "-v", `${secretVolume}:/secrets`, "-v", `${temporaryDirectory}:/input:ro`,
    "nginx:1.28.0-alpine", "sh", "-eu", "-c",
    `cp /input/certificate.pem /secrets/tls_certificate; cp /input/private-key.pem /secrets/tls_private_key; chown 0:${secretGid} /secrets/tls_certificate /secrets/tls_private_key; chmod 0440 /secrets/tls_certificate /secrets/tls_private_key`,
  ]);
  const permissions = run("docker", [
    "run", "--rm", "--user", "0:0", "-v", `${secretVolume}:/secrets:ro`, "nginx:1.28.0-alpine",
    "stat", "-c", "%u:%g %a", "/secrets/tls_certificate", "/secrets/tls_private_key",
  ]);
  if (permissions.trim() !== `0:${secretGid} 440\n0:${secretGid} 440`) throw new Error("Synthetic production TLS Secret permissions are invalid.");
  run("docker", [
    "run", "--detach", "--rm", "--name", containerName, "--read-only", "--user", "101:101",
    "--network", networkName,
    "--group-add", secretGid,
    "--tmpfs", "/etc/nginx/conf.d:uid=101,gid=101,mode=0750",
    "--tmpfs", "/var/cache/nginx:uid=101,gid=101,mode=0750",
    "--tmpfs", "/var/run:uid=101,gid=101,mode=0750",
    "--tmpfs", "/tmp:uid=101,gid=101,mode=0750",
    "-e", "AI_CRM_PUBLIC_HOST=example.invalid",
    "-e", `AI_CRM_API_HOST_A=${apiContainerNames[0]}`, "-e", "AI_CRM_API_PORT_A=8080",
    "-e", `AI_CRM_API_HOST_B=${apiContainerNames[1]}`, "-e", "AI_CRM_API_PORT_B=8080",
    "-v", `${resolve(root, "deploy/nginx/nginx.production.conf.template")}:/etc/nginx/templates/default.conf.template:ro`,
    "--mount", `type=volume,src=${secretVolume},dst=/run/secrets/tls_certificate,volume-subpath=tls_certificate,readonly`,
    "--mount", `type=volume,src=${secretVolume},dst=/run/secrets/tls_private_key,volume-subpath=tls_private_key,readonly`,
    "nginx:1.28.0-alpine",
  ]);

  let healthy = false;
  let lastFailure;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const probe = spawnSync("docker", ["exec", containerName, "wget", "-q", "-O", "-", "http://127.0.0.1:8080/health/live"], { encoding: "utf8" });
    if (probe.status === 0 && probe.stdout.includes('"status":"ok"')) {
      healthy = true;
      break;
    }
    lastFailure = `${probe.stdout ?? ""}${probe.stderr ?? ""}`.slice(0, 1000);
    await delay(250);
  }
  if (!healthy) throw new Error(`Production Edge did not become healthy: ${lastFailure ?? "no probe output"}`);
  for (const path of ["/auth/pc/session", "/auth/internal-h5/session"]) {
    const body = run("docker", [
      "exec", containerName, "wget", "--no-check-certificate", "-q", "-O", "-", `https://127.0.0.1:8443${path}`,
    ]).trim();
    if (body !== path) throw new Error(`Production Edge rewrote or failed to proxy the reviewed authentication path: ${path}`);
  }
  for (const path of ["/realms/removed", "/resources/removed", "/external/removed"]) {
    const removed = spawnSync("docker", ["exec", containerName, "wget", "--no-check-certificate", "-q", "-O", "-", `https://127.0.0.1:8443${path}`], { encoding: "utf8" });
    if (removed.status === 0) throw new Error(`Production Edge exposed removed path ${path}.`);
  }
  console.log("Production Edge starts read-only/non-root, passes liveness, proxies both local authentication surfaces, and keeps removed routes closed.");
} finally {
  spawnSync("docker", ["rm", "--force", containerName], { encoding: "utf8" });
  for (const apiContainerName of apiContainerNames) spawnSync("docker", ["rm", "--force", apiContainerName], { encoding: "utf8" });
  spawnSync("docker", ["volume", "rm", "--force", secretVolume], { encoding: "utf8" });
  spawnSync("docker", ["network", "rm", networkName], { encoding: "utf8" });
  await rm(temporaryDirectory, { force: true, recursive: true });
}
