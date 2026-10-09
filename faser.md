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
FAS 36 Master Admin & Platform Administration
FAS 37 COMPLETE BAS 2026 CHART OF ACCOUNTS INTEGRATION

Aktuell FAS 37-status: katalog-/bokföringsarkitektur implementerad; full officiell
BAS-release BLOCKED av rättigheter och slutlig käll-/klassificeringsgranskning.
Se [full 37-punktsrapport](docs/fas37-release-gate.md). Migration 25; historik bevarad.
Ingen FAS 38, ingen automatisk full kontoplansimport eller cloud-release.

Följande stycke är historik från FAS 36:

Integrerad global metadataadministration med separata persistenta roller,
första lösenordsbyte/MFA, användare/företag/medlemskap, sessioner, säkerhetscenter
och oföränderlig audit. Se [full rapport och faktisk releasegate](docs/fas36-release-gate.md).
Migration 24; ingen implicit bokföringsåtkomst, ingen produktionsbootstrap eller
cloud-deployment. Operatörs-/mail-/nyckel-/tidigare P0-gränser dokumenteras uttryckligen.
FAS 37 startas inte automatiskt. Infrastrukturdiagrammet nedan bevaras.

Användare
│
▼
Vercel
Next.js frontend
│
│ HTTPS
▼
Northflank
NestJS API
│
├──────────────► Neon PostgreSQL
│
└──────────────► Cloudflare R2
bilagor / filer
