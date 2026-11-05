Developing FASer

FAS 1 – Monorepo & Project Bootstrap
FAS 2 – Core Database & Accounting Domain
FAS 3 – Authentication & Organization Authorization
FAS 4 – Application Shell & Dashboard UI
FAS 5 – Chart of Accounts / Kontoplan
FAS 6 – Journal Entries & Double-Entry Bookkeeping / Verifikationer
FAS 7 – Accounting Corrections & Reversals / Rättelser
FAS 8 – Attachments / Bilagor
FAS 9 – General Ledger / Huvudbok
FAS 10 – Income Statement / Resultaträkning
FAS 11 – Balance Sheet / Balansräkning
FAS 12 – VAT Reporting / Momsrapportering
FAS 13 – SIE Import & Export
FAS 14 – Audit & Processing History / Behandlingshistorik
FAS 15 – Fiscal Years & Period Locking / Räkenskapsår och periodlås
FAS 16 – Comprehensive Technical GAP Analysis & Current-State Documentation
FAS 17 – P0 Stabilization & Critical Correctness Fixes
FAS 18 – Production Verification & End-to-End Safety
FAS 19 – Opening Balances, General Ledger & Trial Balance Accounting Correctness
FAS 20 – VAT Accounting Model & Swedish VAT Mapping
FAS 21 – SIE4 Correctness, PC8 & Loss-Aware Import/Export
FAS 22 – Concurrency, Optimistic Versioning & Race Protection
FAS 23 – Security Hardening, Dependency Security & Backup/Restore
FAS 24 – Final P0 Release Gate
FAS 25 Företagsonboarding + organisationsinställningar
FAS 26 Användare, inbjudningar och roller
FAS 27 Verifikationsserier
FAS 28 IB-editor + årsöverföring
FAS 29 Projekt + kostnadsställen
FAS 30 Konteringsmallar
FAS 31 SIE import/export UI
FAS 32 Bilagearkiv
FAS 33 Verifikationsrapport + förbättrade rapportexporter
FAS 34 Riktig dashboard
FAS 35 Full PREMIUM UI/UX-polish
FAS 36 Master Admin & Platform Administration
FAS 37 COMPLETE BAS 2026 CHART OF ACCOUNTS INTEGRATION
FAS 37.1 – Fix CI, Complete BAS Catalog & Release Validation
FAS 37.2 - Deep Project Cleanup, Dead Code Removal & Production Optimization


Användare
│
▼
Vercel
Next.js frontend
│
│ HTTPS
▼
Render (Northflank)
NestJS API
│
├──────────────► Neon PostgreSQL
Set up this Neon project in the current working directory.

1. `npm i -g neon@latest && neon login`
2. `neon skills -y`
3. `neon mcp -y`
4. `neon link --project-id plain-boat-63257376 --branch production -y`
5. `neon config init`
6. Update `neon.ts`:

```ts
import { defineConfig } from "@neon/config/v1";

export default defineConfig({});
```

7. `neon deploy`
│
└──────────────► Cloudflare R2
bilagor / filer
