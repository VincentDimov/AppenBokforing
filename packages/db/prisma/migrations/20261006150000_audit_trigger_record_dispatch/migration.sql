-- Dispatch on the table before referencing table-specific NEW/OLD fields.
-- A SQL boolean AND is not a safe guard for fields absent from a trigger
-- record: the expression must still be planned for that table's row type.
-- Replace only the function; retain the existing audit triggers and all
-- append-only/context protections. Do not rewrite already applied migrations.
CREATE OR REPLACE FUNCTION public.audit_calendar_and_membership()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  event_action "AuditAction";
  event_entity "AuditEntityType";
  event_metadata jsonb;
BEGIN
  IF TG_TABLE_NAME = 'fiscal_years' THEN
    IF TG_OP <> 'INSERT' THEN RETURN NEW; END IF;
    event_action := 'CREATE';
    event_entity := 'FISCAL_YEAR';
    event_metadata := jsonb_build_object('name', NEW.name, 'startDate', NEW.start_date, 'endDate', NEW.end_date);
  ELSIF TG_TABLE_NAME = 'accounting_periods' THEN
    IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
    event_action := CASE WHEN NEW.status = 'LOCKED' THEN 'LOCK'::"AuditAction" ELSE 'UNLOCK'::"AuditAction" END;
    event_entity := 'ACCOUNTING_PERIOD';
    event_metadata := jsonb_build_object('fiscalYearId', NEW.fiscal_year_id, 'periodNumber', NEW.period_number, 'previousStatus', OLD.status, 'status', NEW.status);
  ELSIF TG_TABLE_NAME = 'organization_members' THEN
    event_entity := 'ORGANIZATION_MEMBER';
    IF TG_OP = 'INSERT' THEN
      event_action := 'CREATE';
      event_metadata := jsonb_build_object('userId', NEW.user_id, 'role', NEW.role, 'event', 'USER_ADDED');
    ELSIF TG_OP = 'UPDATE' THEN
      IF NEW.role IS NOT DISTINCT FROM OLD.role THEN RETURN NEW; END IF;
      event_action := 'UPDATE';
      event_metadata := jsonb_build_object('userId', NEW.user_id, 'previousRole', OLD.role, 'role', NEW.role, 'event', 'PERMISSIONS_CHANGED');
    ELSE
      RETURN NEW;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO audit_events (id, organization_id, actor_user_id, action, entity_type, entity_id, metadata)
  VALUES (gen_random_uuid(), NEW.organization_id, NULLIF(current_setting('ledgerapp.actor_user_id', true), '')::uuid, event_action, event_entity, NEW.id, event_metadata);
  RETURN NEW;
END;
$$;
