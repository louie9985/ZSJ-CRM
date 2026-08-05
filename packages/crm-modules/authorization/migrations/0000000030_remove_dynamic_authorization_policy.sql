drop table if exists authorization_core.current_policy;
drop table if exists authorization_core.policy_publications;
drop table if exists authorization_core.policy_versions;

comment on schema authorization_core is
  'Fixed role grants and immutable authorization decision facts.';
