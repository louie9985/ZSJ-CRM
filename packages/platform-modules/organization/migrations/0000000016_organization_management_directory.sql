CREATE TABLE organization.workforce_person_profiles (
  workforce_person_id uuid PRIMARY KEY REFERENCES organization.workforce_people(workforce_person_id),
  real_name varchar(100) NOT NULL CHECK (length(btrim(real_name)) > 0),
  revision integer NOT NULL CHECK (revision >= 0),
  updated_at timestamptz NOT NULL
);
CREATE TABLE organization.workforce_person_profile_history (
  workforce_person_id uuid NOT NULL REFERENCES organization.workforce_people(workforce_person_id),
  revision integer NOT NULL CHECK (revision >= 0),
  real_name varchar(100) NOT NULL,
  recorded_at timestamptz NOT NULL,
  PRIMARY KEY (workforce_person_id, revision)
);

CREATE TABLE organization.department_directory (
  organization_unit_id uuid PRIMARY KEY REFERENCES organization.organization_units(organization_unit_id),
  name varchar(100) NOT NULL CHECK (length(btrim(name)) > 0),
  normalized_name varchar(100) NOT NULL,
  parent_organization_unit_id uuid REFERENCES organization.department_directory(organization_unit_id),
  active boolean NOT NULL DEFAULT true,
  root_locked boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at timestamptz NOT NULL,
  CHECK (organization_unit_id <> parent_organization_unit_id),
  CHECK (NOT root_locked OR active)
);
CREATE UNIQUE INDEX department_active_sibling_name_unique
  ON organization.department_directory (coalesce(parent_organization_unit_id, '00000000-0000-0000-0000-000000000000'::uuid), normalized_name)
  WHERE active;
CREATE INDEX department_parent_idx ON organization.department_directory(parent_organization_unit_id);
CREATE TABLE organization.department_directory_history (
  organization_unit_id uuid NOT NULL REFERENCES organization.department_directory(organization_unit_id),
  revision integer NOT NULL,
  name varchar(100) NOT NULL,
  parent_organization_unit_id uuid,
  active boolean NOT NULL,
  recorded_at timestamptz NOT NULL,
  PRIMARY KEY (organization_unit_id, revision)
);

CREATE TABLE organization.position_directory (
  position_id uuid PRIMARY KEY REFERENCES organization.positions(position_id),
  organization_unit_id uuid NOT NULL REFERENCES organization.department_directory(organization_unit_id),
  name varchar(100) NOT NULL CHECK (length(btrim(name)) > 0),
  normalized_name varchar(100) NOT NULL,
  active boolean NOT NULL DEFAULT true,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX position_active_department_name_unique ON organization.position_directory(organization_unit_id, normalized_name) WHERE active;
CREATE TABLE organization.position_directory_history (
  position_id uuid NOT NULL REFERENCES organization.position_directory(position_id),
  revision integer NOT NULL,
  name varchar(100) NOT NULL,
  active boolean NOT NULL,
  recorded_at timestamptz NOT NULL,
  PRIMARY KEY (position_id, revision)
);

CREATE TABLE organization.directory_operation_receipts (
  operation_id uuid PRIMARY KEY,
  fingerprint varchar(64) NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);

CREATE FUNCTION organization.reject_department_directory_cycle() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_id uuid;
BEGIN
  IF NEW.parent_organization_unit_id IS NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('organization.department_directory', 0));
  current_id := NEW.parent_organization_unit_id;
  WHILE current_id IS NOT NULL LOOP
    IF current_id = NEW.organization_unit_id THEN RAISE EXCEPTION 'organization hierarchy cycle' USING ERRCODE = '23514'; END IF;
    SELECT parent_organization_unit_id INTO current_id FROM organization.department_directory WHERE organization_unit_id = current_id;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER department_directory_no_cycle BEFORE INSERT OR UPDATE OF parent_organization_unit_id ON organization.department_directory FOR EACH ROW EXECUTE FUNCTION organization.reject_department_directory_cycle();
