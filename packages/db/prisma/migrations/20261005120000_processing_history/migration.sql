-- Retain the existing append-only audit_events_immutable trigger.
-- Always persist a correlation ID and metadata for newly recorded events.
CREATE FUNCTION public.complete_audit_context() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.request_id := COALESCE(NEW.request_id, NULLIF(current_setting('ledgerapp.request_id', true), ''), gen_random_uuid()::text);
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  RETURN NEW;
END;
$$;
CREATE TRIGGER audit_context_before_insert BEFORE INSERT ON audit_events
FOR EACH ROW EXECUTE FUNCTION public.complete_audit_context();

-- Capture currently database-managed operations, including administrative writes.
-- API workflows can supply transaction-local actor/request context. An absent
-- actor is displayed as system/unknown, never attributed to the affected user.
CREATE FUNCTION public.audit_calendar_and_membership() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  event_action "AuditAction";
  event_entity "AuditEntityType";
  event_metadata jsonb;
BEGIN
  IF TG_TABLE_NAME = 'fiscal_years' AND TG_OP = 'INSERT' THEN
    event_action := 'CREATE'; event_entity := 'FISCAL_YEAR';
    event_metadata := jsonb_build_object('name', NEW.name, 'startDate', NEW.start_date, 'endDate', NEW.end_date);
  ELSIF TG_TABLE_NAME = 'accounting_periods' AND TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    event_action := CASE WHEN NEW.status = 'LOCKED' THEN 'LOCK'::"AuditAction" ELSE 'UNLOCK'::"AuditAction" END;
    event_entity := 'ACCOUNTING_PERIOD';
    event_metadata := jsonb_build_object('fiscalYearId', NEW.fiscal_year_id, 'periodNumber', NEW.period_number, 'previousStatus', OLD.status, 'status', NEW.status);
  ELSIF TG_TABLE_NAME = 'organization_members' AND TG_OP = 'INSERT' THEN
    event_action := 'CREATE'; event_entity := 'ORGANIZATION_MEMBER';
    event_metadata := jsonb_build_object('userId', NEW.user_id, 'role', NEW.role, 'event', 'USER_ADDED');
  ELSIF TG_TABLE_NAME = 'organization_members' AND TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role THEN
    event_action := 'UPDATE'; event_entity := 'ORGANIZATION_MEMBER';
    event_metadata := jsonb_build_object('userId', NEW.user_id, 'previousRole', OLD.role, 'role', NEW.role, 'event', 'PERMISSIONS_CHANGED');
  ELSE RETURN NEW;
  END IF;
  INSERT INTO audit_events (id, organization_id, actor_user_id, action, entity_type, entity_id, metadata)
  VALUES (gen_random_uuid(), NEW.organization_id, NULLIF(current_setting('ledgerapp.actor_user_id', true), '')::uuid, event_action, event_entity, NEW.id, event_metadata);
  RETURN NEW;
END;
$$;
CREATE TRIGGER audit_fiscal_year_created AFTER INSERT ON fiscal_years FOR EACH ROW EXECUTE FUNCTION public.audit_calendar_and_membership();
CREATE TRIGGER audit_period_status AFTER UPDATE ON accounting_periods FOR EACH ROW EXECUTE FUNCTION public.audit_calendar_and_membership();
CREATE TRIGGER audit_membership_changes AFTER INSERT OR UPDATE ON organization_members FOR EACH ROW EXECUTE FUNCTION public.audit_calendar_and_membership();
