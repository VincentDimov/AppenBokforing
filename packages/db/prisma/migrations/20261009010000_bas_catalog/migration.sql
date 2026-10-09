-- Forward-only reference-data architecture. No copyrighted catalog is seeded.
CREATE TYPE "AccountingFramework" AS ENUM ('NOT_CONFIGURED','K2','K3');
CREATE TYPE "BasAccountCategory" AS ENUM ('GROUP_ACCOUNT','MAIN_ACCOUNT','SUBACCOUNT');
CREATE TABLE bas_catalog_versions (
 id uuid PRIMARY KEY, version varchar(64) NOT NULL UNIQUE,
 source_version varchar(64) NOT NULL, source_reference text NOT NULL,
 source_sha256 char(64) NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
 content_sha256 char(64) NOT NULL CHECK(content_sha256 ~ '^[a-f0-9]{64}$'),
 license_reference text NOT NULL CHECK(length(license_reference)>0),
 classification_review_reference text NOT NULL CHECK(length(classification_review_reference)>0),
 verification_report jsonb NOT NULL, row_count integer NOT NULL CHECK(row_count>0),
 is_default boolean NOT NULL DEFAULT false,
 created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX bas_single_default ON bas_catalog_versions(is_default) WHERE is_default;
CREATE TABLE bas_account_catalog (
 id uuid PRIMARY KEY, catalog_version_id uuid NOT NULL REFERENCES bas_catalog_versions(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 account_number char(4) NOT NULL CHECK(account_number ~ '^[1-8][0-9]{3}$'),
 official_name text NOT NULL CHECK(length(btrim(official_name))>0),
 account_class char(1) NOT NULL, account_group char(2) NOT NULL,
 class_name text NOT NULL, group_name text NOT NULL,
 category "BasAccountCategory" NOT NULL, parent_account_number char(4),
 is_k2_restricted boolean NOT NULL, is_default_active boolean NOT NULL, is_bookable boolean NOT NULL,
 type "AccountType" NOT NULL, normal_balance "BalanceSide" NOT NULL,
 classification_reference text NOT NULL CHECK(length(classification_reference)>0),
 source_position text NOT NULL CHECK(length(source_position)>0),
 created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(catalog_version_id,account_number),
 CHECK(account_class=left(account_number,1) AND account_group=left(account_number,2)),
 CHECK(category=CASE WHEN right(account_number,2)='00' THEN 'GROUP_ACCOUNT'::"BasAccountCategory"
                    WHEN right(account_number,1)='0' THEN 'MAIN_ACCOUNT'::"BasAccountCategory"
                    ELSE 'SUBACCOUNT'::"BasAccountCategory" END),
 CHECK(is_default_active=(is_bookable AND NOT is_k2_restricted AND right(account_number,1)='0')),
 CHECK((category='SUBACCOUNT' AND parent_account_number IS NOT NULL AND parent_account_number<>account_number
        AND right(parent_account_number,1)='0' AND left(parent_account_number,2)=account_group)
       OR (category<>'SUBACCOUNT' AND parent_account_number IS NULL))
);
ALTER TABLE bas_account_catalog ADD CONSTRAINT bas_parent_reference
 FOREIGN KEY(catalog_version_id,parent_account_number) REFERENCES bas_account_catalog(catalog_version_id,account_number)
 ON DELETE RESTRICT ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX bas_catalog_filters ON bas_account_catalog(catalog_version_id,account_class,account_group,category);
CREATE INDEX bas_catalog_defaults ON bas_account_catalog(catalog_version_id,is_default_active);
CREATE INDEX bas_catalog_name_search ON bas_account_catalog USING gin (official_name gin_trgm_ops);
ALTER TABLE organizations ADD COLUMN accounting_framework "AccountingFramework" NOT NULL DEFAULT 'NOT_CONFIGURED',
 ADD COLUMN bas_catalog_version_id uuid REFERENCES bas_catalog_versions(id) ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE INDEX organizations_bas_version ON organizations(bas_catalog_version_id);
ALTER TABLE accounts ALTER COLUMN name TYPE text;
ALTER TABLE accounts ADD COLUMN bas_catalog_account_id uuid REFERENCES bas_account_catalog(id) ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE INDEX accounts_bas_origin ON accounts(bas_catalog_account_id);

CREATE FUNCTION bas_reference_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='bas_catalog_versions' AND TG_OP='UPDATE'
    AND (to_jsonb(OLD)-'is_default'-'updated_at')=(to_jsonb(NEW)-'is_default'-'updated_at') THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'BAS reference identity is immutable' USING ERRCODE='23514';
END $$;
CREATE TRIGGER bas_entry_immutable BEFORE UPDATE OR DELETE ON bas_account_catalog FOR EACH ROW EXECUTE FUNCTION bas_reference_immutable();
CREATE TRIGGER bas_entry_no_truncate BEFORE TRUNCATE ON bas_account_catalog FOR EACH STATEMENT EXECUTE FUNCTION bas_reference_immutable();
CREATE TRIGGER bas_version_immutable BEFORE UPDATE OR DELETE ON bas_catalog_versions FOR EACH ROW EXECUTE FUNCTION bas_reference_immutable();
CREATE TRIGGER bas_version_no_truncate BEFORE TRUNCATE ON bas_catalog_versions FOR EACH STATEMENT EXECUTE FUNCTION bas_reference_immutable();
CREATE FUNCTION bas_catalog_complete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v uuid; expected integer;
BEGIN
 IF TG_TABLE_NAME='bas_catalog_versions' THEN v:=NEW.id; ELSE v:=NEW.catalog_version_id; END IF;
 SELECT row_count INTO expected FROM bas_catalog_versions WHERE id=v;
 IF (SELECT count(*) FROM bas_account_catalog WHERE catalog_version_id=v)<>expected THEN
  RAISE EXCEPTION 'BAS catalog incomplete or extended after verification' USING ERRCODE='23514';
 END IF; RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER bas_version_complete AFTER INSERT ON bas_catalog_versions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION bas_catalog_complete();
CREATE CONSTRAINT TRIGGER bas_entry_complete AFTER INSERT ON bas_account_catalog DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION bas_catalog_complete();

CREATE FUNCTION bas_account_eligible(org uuid, number text, origin uuid DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql STABLE AS $$
DECLARE framework "AccountingFramework"; version_id uuid;
BEGIN
 SELECT accounting_framework,bas_catalog_version_id INTO framework,version_id FROM organizations WHERE id=org;
 IF framework IS NULL THEN RETURN false; END IF;
 IF version_id IS NULL THEN SELECT id INTO version_id FROM bas_catalog_versions WHERE is_default; END IF;
 RETURN NOT EXISTS (SELECT 1 FROM bas_account_catalog b
  WHERE (b.id=origin OR (b.catalog_version_id=version_id AND b.account_number=number))
    AND (NOT b.is_bookable OR (b.is_k2_restricted AND framework<>'K3')));
END $$;

CREATE FUNCTION bas_account_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b bas_account_catalog;
BEGIN
 PERFORM id FROM organizations WHERE id=NEW.organization_id FOR SHARE;
 IF TG_OP='UPDATE' AND OLD.bas_catalog_account_id IS NOT NULL
    AND NEW.bas_catalog_account_id IS DISTINCT FROM OLD.bas_catalog_account_id THEN
  RAISE EXCEPTION 'BAS account provenance cannot be replaced' USING ERRCODE='23514'; END IF;
 IF NEW.bas_catalog_account_id IS NOT NULL THEN
  SELECT * INTO STRICT b FROM bas_account_catalog WHERE id=NEW.bas_catalog_account_id;
  IF NEW.account_number<>b.account_number OR NEW.type<>b.type OR NEW.normal_balance<>b.normal_balance THEN
   RAISE EXCEPTION 'BAS account identity/classification must match reviewed source' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW.is_active AND (TG_OP='INSERT' OR NOT OLD.is_active OR NEW.account_number<>OLD.account_number)
    AND NOT bas_account_eligible(NEW.organization_id,NEW.account_number,NEW.bas_catalog_account_id) THEN
  RAISE EXCEPTION 'BAS account incompatible with accounting framework' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bas_account_identity BEFORE INSERT OR UPDATE ON accounts FOR EACH ROW EXECUTE FUNCTION bas_account_guard();

CREATE FUNCTION bas_financial_reference_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a accounts; require_active boolean:=true;
BEGIN
 PERFORM id FROM organizations WHERE id=NEW.organization_id FOR SHARE;
 -- Only the existing exact-inversion reversal workflow may retain inactive
 -- historical accounts. Existing reversal invariants still validate every line.
 IF TG_TABLE_NAME='journal_lines' THEN
  SELECT source<>'REVERSAL' INTO require_active FROM journal_entries
   WHERE id=NEW.journal_entry_id AND organization_id=NEW.organization_id;
 ELSIF TG_TABLE_NAME='posting_template_lines' THEN
  SELECT is_active INTO require_active FROM posting_templates
   WHERE id=NEW.posting_template_id AND organization_id=NEW.organization_id;
 END IF;
 SELECT * INTO a FROM accounts WHERE id=NEW.account_id AND organization_id=NEW.organization_id FOR SHARE;
 IF NOT FOUND OR (require_active AND NOT a.is_active) OR NOT bas_account_eligible(NEW.organization_id,a.account_number,a.bas_catalog_account_id) THEN
  RAISE EXCEPTION 'Account inactive, outside tenant, or BAS framework-incompatible' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bas_line_eligibility BEFORE INSERT OR UPDATE OF account_id,debit_amount,credit_amount ON journal_lines FOR EACH ROW EXECUTE FUNCTION bas_financial_reference_guard();
CREATE TRIGGER bas_ib_eligibility BEFORE INSERT OR UPDATE ON opening_balances FOR EACH ROW EXECUTE FUNCTION bas_financial_reference_guard();
CREATE TRIGGER bas_template_eligibility BEFORE INSERT OR UPDATE OF account_id ON posting_template_lines FOR EACH ROW EXECUTE FUNCTION bas_financial_reference_guard();
CREATE FUNCTION bas_post_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status='POSTED' AND (TG_OP='INSERT' OR OLD.status<>'POSTED') THEN
  PERFORM id FROM organizations WHERE id=NEW.organization_id FOR SHARE;
  IF EXISTS(SELECT 1 FROM journal_lines l JOIN accounts a ON a.id=l.account_id AND a.organization_id=l.organization_id
    WHERE l.journal_entry_id=NEW.id AND ((NEW.source<>'REVERSAL' AND NOT a.is_active) OR NOT bas_account_eligible(NEW.organization_id,a.account_number,a.bas_catalog_account_id))) THEN
   RAISE EXCEPTION 'Posting references an ineligible BAS account' USING ERRCODE='23514'; END IF;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER bas_post_eligibility BEFORE INSERT OR UPDATE OF status ON journal_entries FOR EACH ROW EXECUTE FUNCTION bas_post_guard();
CREATE FUNCTION bas_framework_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.accounting_framework IS DISTINCT FROM OLD.accounting_framework OR NEW.bas_catalog_version_id IS DISTINCT FROM OLD.bas_catalog_version_id)
 AND NEW.accounting_framework<>'K3' AND EXISTS (
  SELECT 1 FROM accounts a JOIN bas_account_catalog b ON b.account_number=a.account_number
   AND (b.id=a.bas_catalog_account_id OR b.catalog_version_id=COALESCE(NEW.bas_catalog_version_id,(SELECT id FROM bas_catalog_versions WHERE is_default)))
  WHERE a.organization_id=NEW.id AND b.is_k2_restricted
   AND (a.is_active OR EXISTS(SELECT 1 FROM opening_balances ib WHERE ib.account_id=a.id)
        OR EXISTS(SELECT 1 FROM journal_lines l JOIN journal_entries j ON j.id=l.journal_entry_id WHERE l.account_id=a.id AND j.status='POSTED'))
 ) THEN RAISE EXCEPTION 'Framework change requires reviewed reconciliation; historical records are not rewritten' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bas_framework_review BEFORE UPDATE OF accounting_framework,bas_catalog_version_id ON organizations FOR EACH ROW EXECUTE FUNCTION bas_framework_guard();
