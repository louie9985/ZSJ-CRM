import { constants } from "node:fs";
import { spawnSync } from "node:child_process";
import { lstat, open, realpath } from "node:fs/promises";
import { isAbsolute, normalize, resolve } from "node:path";
import pg from "pg";
import { hashPassword } from "../../packages/crm-modules/workforce-access/dist/index.js";

const ids = Object.freeze({
  organizationUnit: "5a100000-0000-4000-8000-000000000001",
  placement: "5a100000-0000-4000-8000-000000000002",
  position: "5a100000-0000-4000-8000-000000000003",
  person: "5a100000-0000-4000-8000-000000000004",
  employment: "5a100000-0000-4000-8000-000000000005",
  account: "5a100000-0000-4000-8000-000000000006",
  grant: "5a100000-0000-4000-8000-000000000007",
  assignment: "5a100000-0000-4000-8000-000000000008",
  usernameIdentifier: "5a100000-0000-4000-8000-000000000009",
  roleOperation: "5a100000-0000-4000-8000-00000000000a",
  audit: "5a100000-0000-4000-8000-00000000000b",
  auditOperation: "5a100000-0000-4000-8000-00000000000c",
});

function validateWindowsAcl(path, name) {
  const literalPath = path.replaceAll("'", "''");
  const result = spawnSync("powershell.exe", [
    "-NoLogo", "-NoProfile", "-NonInteractive", "-Command",
    `$acl=Get-Acl -LiteralPath '${literalPath}';$allowed=@([System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value,'S-1-5-18','S-1-5-32-544');if(-not $acl.AreAccessRulesProtected){exit 2};foreach($rule in $acl.Access){if($rule.AccessControlType -eq 'Allow'){$sid=$rule.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value;if($allowed -notcontains $sid){exit 3}}};'restricted'`,
  ], { encoding: "utf8", shell: false, windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(`${name}_file_invalid`);
  if (result.stdout.trim() !== "restricted") throw new Error(`${name}_file_invalid`);
}

async function restricted(path, name, preservePrintableSpaces = false) {
  if (!path || !isAbsolute(path)) throw new Error(`${name}_file_invalid`);
  const linkInfo = await lstat(path).catch(() => undefined);
  if (!linkInfo?.isFile() || linkInfo.isSymbolicLink()) throw new Error(`${name}_file_invalid`);
  const canonical = await realpath(path).catch(() => undefined);
  const comparable = (value) => process.platform === "win32" ? normalize(value).toLowerCase() : normalize(value);
  if (!canonical || comparable(canonical) !== comparable(resolve(path))) throw new Error(`${name}_file_invalid`);
  if (process.platform === "win32") validateWindowsAcl(path, name);
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size < 1 || info.size > 2048 || process.platform !== "win32" && (info.mode & 0o077) !== 0) throw new Error(`${name}_file_invalid`);
    const contents = await handle.readFile("utf8");
    const value = preservePrintableSpaces ? contents.replace(/\r?\n$/u, "") : contents.trim();
    if (value.length === 0) throw new Error(`${name}_file_invalid`);
    return value;
  } finally { await handle.close(); }
}

const databaseUrl = await restricted(process.env.AI_CRM_LOCAL_BOOTSTRAP_DATABASE_URL_FILE, "bootstrap_database_url");
if (process.env.AI_CRM_LOCAL_BOOTSTRAP !== "1") throw new Error("local_bootstrap_environment_required");
const databaseTarget = new URL(databaseUrl);
if (databaseTarget.protocol !== "postgresql:" && databaseTarget.protocol !== "postgres:") throw new Error("local_bootstrap_database_target_invalid");
if (!["127.0.0.1", "[::1]", "localhost"].includes(databaseTarget.hostname) || databaseTarget.pathname !== "/ai_crm") throw new Error("local_bootstrap_database_target_invalid");
const pool = new pg.Pool({ connectionString: databaseUrl, max: 2, connectionTimeoutMillis: 5000, idleTimeoutMillis: 5000, statement_timeout: 15000, application_name: "ai_crm_local_account_bootstrap" });
const client = await pool.connect();
try {
  await client.query("select pg_advisory_lock(1095327565,1112753236)");
  const now = new Date().toISOString();
  const existing = await client.query(`select a.account_id
    from workforce_access.accounts a
    join workforce_access.password_credentials c on c.account_id=a.account_id
    join workforce_access.login_identifier_history i on i.account_id=a.account_id and i.kind='username' and i.normalized_value='system.admin' and i.released_at is null
    join organization.workforce_people w on w.workforce_person_id=a.workforce_person_id
    join organization.workforce_person_profiles f on f.workforce_person_id=w.workforce_person_id
    join organization.employments e on e.workforce_person_id=a.workforce_person_id and e.employment_id=$3 and e.effective_from<=$9 and (e.effective_to is null or e.effective_to>$9)
    join organization.assignments x on x.workforce_person_id=a.workforce_person_id and x.assignment_id=$4 and x.effective_from<=$9 and (x.effective_to is null or x.effective_to>$9)
    join organization.organization_unit_placements l on l.placement_id=$10 and l.organization_unit_id=x.organization_unit_id and l.effective_from<=$9 and (l.effective_to is null or l.effective_to>$9)
    join organization.organization_units u on u.organization_unit_id=x.organization_unit_id and u.organization_unit_id=$5 and u.effective_from<=$9 and (u.effective_to is null or u.effective_to>$9)
    join organization.positions p on p.position_id=x.position_id and p.position_id=$6 and p.organization_unit_id=u.organization_unit_id and p.effective_from<=$9 and (p.effective_to is null or p.effective_to>$9)
    join organization.department_directory d on d.organization_unit_id=u.organization_unit_id and d.active=true
    join organization.department_directory_history dh on dh.organization_unit_id=u.organization_unit_id and dh.revision=0 and dh.name='System Administration' and dh.active=true
    join organization.position_directory q on q.position_id=p.position_id and q.organization_unit_id=u.organization_unit_id and q.active=true
    join organization.position_directory_history qh on qh.position_id=p.position_id and qh.revision=0 and qh.name='System Administrator' and qh.active=true
    join organization.workforce_person_profile_history fh on fh.workforce_person_id=w.workforce_person_id and fh.revision=0 and fh.real_name='System Administrator'
    join authorization_core.fixed_role_grants g on g.workforce_person_id=a.workforce_person_id and g.role_key='system_administrator' and g.assignment_id is null and g.revoked_at is null
    join audit.records r on r.audit_id=$11 and r.operation_id=$12 and r.resource_id=a.account_id::text and r.result='succeeded'
    where a.account_id=$1 and a.workforce_person_id=$2 and a.username='system.admin' and a.status='active'
      and c.revision=0 and f.revision=0 and f.real_name='System Administrator' and i.identifier_id=$7 and g.grant_id=$8 and g.operation_id=$13`, [ids.account, ids.person, ids.employment, ids.assignment, ids.organizationUnit, ids.position, ids.usernameIdentifier, ids.grant, now, ids.placement, ids.audit, ids.auditOperation, ids.roleOperation]);
  if (existing.rowCount === 1) {
    console.log("Local system administrator bootstrap already exists.");
  } else {
    const partial = await client.query(`select count(*)::integer as count from (
      select account_id::text as id from workforce_access.accounts where account_id=$1
      union all select workforce_person_id::text from organization.workforce_people where workforce_person_id=$2
      union all select employment_id::text from organization.employments where employment_id=$3
      union all select assignment_id::text from organization.assignments where assignment_id=$4
      union all select organization_unit_id::text from organization.organization_units where organization_unit_id=$5
      union all select position_id::text from organization.positions where position_id=$6
      union all select grant_id::text from authorization_core.fixed_role_grants where grant_id=$7
      union all select placement_id::text from organization.organization_unit_placements where placement_id=$8
      union all select organization_unit_id::text from organization.department_directory where organization_unit_id=$5
      union all select organization_unit_id::text from organization.department_directory_history where organization_unit_id=$5 and revision=0
      union all select position_id::text from organization.position_directory where position_id=$6
      union all select position_id::text from organization.position_directory_history where position_id=$6 and revision=0
      union all select workforce_person_id::text from organization.workforce_person_profiles where workforce_person_id=$2
      union all select workforce_person_id::text from organization.workforce_person_profile_history where workforce_person_id=$2 and revision=0
      union all select account_id::text from workforce_access.password_credentials where account_id=$1
      union all select identifier_id::text from workforce_access.login_identifier_history where identifier_id=$9
      union all select audit_id::text from audit.records where audit_id=$10 or operation_id=$11
    ) bootstrap_rows`, [ids.account, ids.person, ids.employment, ids.assignment, ids.organizationUnit, ids.position, ids.grant, ids.placement, ids.usernameIdentifier, ids.audit, ids.auditOperation]);
    if (partial.rows[0]?.count !== 0) throw new Error("local_bootstrap_state_incomplete");
    const password = await restricted(process.env.AI_CRM_LOCAL_SYSTEM_ADMIN_PASSWORD_FILE, "bootstrap_password", true);
    const passwordHash = await hashPassword(password);
    try {
      await client.query("begin");
      await client.query("insert into organization.organization_units(organization_unit_id,effective_from) values($1,$2)", [ids.organizationUnit, now]);
      await client.query("insert into organization.organization_unit_placements(placement_id,organization_unit_id,effective_from) values($1,$2,$3)", [ids.placement, ids.organizationUnit, now]);
      await client.query("insert into organization.department_directory(organization_unit_id,name,normalized_name,active,root_locked,revision,updated_at) values($1,'System Administration','system administration',true,true,0,$2)", [ids.organizationUnit, now]);
      await client.query("insert into organization.department_directory_history(organization_unit_id,revision,name,active,recorded_at) values($1,0,'System Administration',true,$2)", [ids.organizationUnit, now]);
      await client.query("insert into organization.positions(position_id,organization_unit_id,effective_from) values($1,$2,$3)", [ids.position, ids.organizationUnit, now]);
      await client.query("insert into organization.position_directory(position_id,organization_unit_id,name,normalized_name,active,revision,updated_at) values($1,$2,'System Administrator','system administrator',true,0,$3)", [ids.position, ids.organizationUnit, now]);
      await client.query("insert into organization.position_directory_history(position_id,revision,name,active,recorded_at) values($1,0,'System Administrator',true,$2)", [ids.position, now]);
      await client.query("insert into organization.workforce_people(workforce_person_id,recorded_at) values($1,$2)", [ids.person, now]);
      await client.query("insert into organization.workforce_person_profiles(workforce_person_id,real_name,revision,updated_at) values($1,'System Administrator',0,$2)", [ids.person, now]);
      await client.query("insert into organization.workforce_person_profile_history(workforce_person_id,revision,real_name,recorded_at) values($1,0,'System Administrator',$2)", [ids.person, now]);
      await client.query("insert into organization.employments(employment_id,workforce_person_id,effective_from) values($1,$2,$3)", [ids.employment, ids.person, now]);
      await client.query("insert into organization.assignments(assignment_id,workforce_person_id,employment_id,organization_unit_id,position_id,effective_from) values($1,$2,$3,$4,$5,$6)", [ids.assignment, ids.person, ids.employment, ids.organizationUnit, ids.position, now]);
      await client.query("insert into workforce_access.accounts(account_id,workforce_person_id,username,username_normalized,status,revision,security_revision,created_at,updated_at) values($1,$2,'system.admin','system.admin','active',0,0,$3,$3)", [ids.account, ids.person, now]);
      await client.query("insert into workforce_access.password_credentials(account_id,password_hash,revision,updated_at) values($1,$2,0,$3)", [ids.account, passwordHash, now]);
      await client.query("insert into workforce_access.login_identifier_history(identifier_id,account_id,kind,value,normalized_value) values($1,$2,'username','system.admin','system.admin')", [ids.usernameIdentifier, ids.account]);
      await client.query("insert into authorization_core.fixed_role_grants(grant_id,workforce_person_id,role_key,granted_at,operation_id) values($1,$2,'system_administrator',$3,$4)", [ids.grant, ids.person, now, ids.roleOperation]);
      await client.query("insert into audit.records(audit_id,occurred_at,action,actor_id,actor_type,resource_type,resource_id,result,reason_code,trace_id,operation_id,changes) values($1,$2,'authentication.bootstrap.system_administrator','local-bootstrap','system','crm.workforce-access.account',$3,'succeeded','local_bootstrap','11111111111111111111111111111111',$4,'[]'::jsonb)", [ids.audit, now, ids.account, ids.auditOperation]);
      await client.query("commit");
      console.log("Local system administrator bootstrap created; username=system.admin.");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    }
  }
} finally {
  await client.query("select pg_advisory_unlock(1095327565,1112753236)").catch(() => undefined);
  client.release();
  await pool.end();
}
