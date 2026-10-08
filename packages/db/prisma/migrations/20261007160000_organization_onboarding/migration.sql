-- Company identifiers need not be globally unique: independent demo/test tenants
-- may represent the same company. Tenant identity remains the UUID, not this number.
DROP INDEX "organizations_organization_number_key";
ALTER TABLE organizations
  ADD COLUMN country_code CHAR(2) NOT NULL DEFAULT 'SE',
  ADD COLUMN address VARCHAR(500),
  ADD COLUMN setup_key UUID,
  ADD COLUMN default_voucher_series_code VARCHAR(16) NOT NULL DEFAULT 'A';
CREATE UNIQUE INDEX organizations_setup_key_key ON organizations(setup_key);
