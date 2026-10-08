ALTER TYPE "AuditEntityType" ADD VALUE 'INVITATION';
ALTER TABLE organization_members ADD COLUMN removed_at TIMESTAMPTZ(3);
CREATE TABLE organization_invitations (
  id UUID PRIMARY KEY, organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  email VARCHAR(320) NOT NULL, role "OrganizationMemberRole" NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE, expires_at TIMESTAMPTZ(3) NOT NULL,
  accepted_at TIMESTAMPTZ(3), revoked_at TIMESTAMPTZ(3),
  invited_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ(3) NOT NULL,
  CHECK (email = lower(email)), CHECK (NOT (accepted_at IS NOT NULL AND revoked_at IS NOT NULL)),
  CHECK (role <> 'OWNER')
);
CREATE INDEX organization_invitations_organization_id_email_created_at_idx ON organization_invitations(organization_id,email,created_at);
-- Pending means unconsumed; creation revokes any expired predecessors under the org lock.
CREATE UNIQUE INDEX one_pending_invitation ON organization_invitations(organization_id,email) WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE FUNCTION public.serialize_membership_changes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.organization_id <> OLD.organization_id OR NEW.user_id <> OLD.user_id) THEN
    RAISE EXCEPTION 'Membership identity is immutable' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN
    PERFORM id FROM organizations WHERE id = OLD.organization_id FOR UPDATE;
    RETURN OLD;
  END IF;
  PERFORM id FROM organizations WHERE id = NEW.organization_id FOR UPDATE;
  RETURN NEW;
END; $$;
CREATE TRIGGER membership_serialization BEFORE INSERT OR UPDATE OR DELETE ON organization_members FOR EACH ROW EXECUTE FUNCTION public.serialize_membership_changes();
CREATE FUNCTION public.require_remaining_owner() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE org UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN org := OLD.organization_id; ELSE org := NEW.organization_id; END IF;
  IF NOT EXISTS (SELECT 1 FROM organization_members WHERE organization_id = org AND role = 'OWNER' AND removed_at IS NULL) THEN
    RAISE EXCEPTION 'LAST_OWNER_REQUIRED' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER remaining_owner AFTER INSERT OR UPDATE OR DELETE ON organization_members DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.require_remaining_owner();
