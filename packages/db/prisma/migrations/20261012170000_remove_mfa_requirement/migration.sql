-- Retire MFA without deleting credential records or immutable security history.
-- This migration does not change roles, account status, password-change flags,
-- sessions, organization membership or accounting data.
ALTER TABLE platform_administrators
  DROP CONSTRAINT platform_admin_mfa_mandatory;
ALTER TABLE platform_administrators
  ALTER COLUMN mfa_required SET DEFAULT false;
UPDATE platform_administrators SET mfa_required = false WHERE mfa_required = true;
