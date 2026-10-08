-- Operator-reviewed template. Execute on the intended database as its owner.
-- No passwords are embedded. Provision separate LOGIN principals securely,
-- grant membership in these NOLOGIN groups, and never grant migrator to runtime.
-- If groups already exist, create them separately before running the grants.
CREATE ROLE ledgerapp_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE ledgerapp_migrator NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO ledgerapp_runtime;
GRANT USAGE, CREATE ON SCHEMA public TO ledgerapp_migrator;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ledgerapp_runtime;
GRANT INSERT, UPDATE ON users, sessions, organizations, organization_members,
  fiscal_years, accounting_periods, accounts, vat_codes, voucher_series,
  journal_entries, journal_lines, projects, cost_centers, attachments,
  posting_templates, posting_template_lines, opening_balances, sie_imports,
  sie_exports TO ledgerapp_runtime;
GRANT INSERT ON audit_events TO ledgerapp_runtime;
GRANT INSERT ON organization_invitations, year_carry_forwards TO ledgerapp_runtime;
GRANT UPDATE (accepted_at, revoked_at, updated_at) ON organization_invitations TO ledgerapp_runtime;
GRANT UPDATE (confirmed_at) ON year_carry_forwards TO ledgerapp_runtime;
GRANT DELETE ON sessions, journal_lines, posting_template_lines, opening_balances TO ledgerapp_runtime;
-- IB whole-set replacement requires DELETE; locked/used-year triggers still
-- reject it. Invitations and carry previews cannot be deleted or rewritten.
-- POSTED line delete/update is still blocked by immutable triggers.
-- No UPDATE/DELETE/TRUNCATE on audit_events; no TRUNCATE on any table.
-- No schema ownership, role elevation or ALTER/DROP/disable-trigger authority.
-- The separately provisioned migrator must own migration-created tables,
-- enums and functions. Run migrations through that owner, not runtime.
-- Re-run reviewed grants after each migration creates new objects.
