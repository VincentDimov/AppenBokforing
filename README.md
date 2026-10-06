# LedgerApp

Svensk flerorganisationsbaserad bokföringsapplikation under utveckling.
Next.js-webb, NestJS-API, PostgreSQL/Prisma och S3-kompatibla bilagor i ett
pnpm/Turborepo-monorepo. Projektet innehåller redan substantiell funktionalitet,
men är **inte redo för verklig produktionsbokföring**.

Den kodbaserade granskningen 2026-10-06 beskriver nuläget:

- [CURRENT_STATE](docs/CURRENT_STATE.md): arkitektur, funktionsmatris och faktiska rutter.
- [GAP_ANALYSIS](docs/GAP_ANALYSIS.md): bokförings-/säkerhetsrisker, testluckor och exakta körresultat.
- [ROADMAP](docs/ROADMAP.md): prioriterad utveckling från dagens kod, P0–P4.

## Implemented

- Registrering/inloggning, Argon2id, httpOnly-cookies, kortlivad accessJWT och persistenta roterande refreshsessioner.
- Organisations-API och medlemsguards med OWNER, ADMIN, ACCOUNTANT, MEMBER och READ_ONLY.
- Konton med sökning, skapa/redigera/deaktivering och tenant-safe VAT-referenser; ingen account-DELETE.
- Utkast, Decimal-validerad dubbel bokföring och transaktionell postning med atomisk serienumrering.
- SQL-skydd för journalbalans, POSTED-immutability och tenantrelationer; spårbar rättelse genom ny motpost.
- Bilagor per sparad verifikation: PDF/JPEG/PNG/WEBP, max 10 MiB, extension/MIME/magic bytes, SHA-256 och signerade downloads.
- Räkenskapsårslista/skapa/stäng, periodlås/upplåsning med bekräftelse och kalendertriggers.
- Läsbar behandlingshistorik med filter/paging och audit UPDATE/DELETE-spärr.
- Publik startsida, login/register, arbetsytans skal och flera riktiga API-anslutna vyer.

Implementerad betyder inte att hela produktflödet är komplett eller utan risker.
Alla skyddade API-rutter kräver session, organisationsdata också medlemskap.
Owner/admin/accountant skriver bokföring; member/read-only läser.

## Partially implemented

- Huvudbok, resultat- och balansräkning samt momsrapport har verkliga POSTED-queries och UI. Huvudboken utelämnar dock IB; momsens tax/base-kontrakt behöver rättas.
- Balansräkning läser IB och stödjer jämförelsedatum inom samma år. Inget komplett IB-/årsöverföringsflöde finns.
- SIE har fristående paket, default-preview, confirm-transaktion och text-export. Import tappar IB/dimensioner/raddatum och kan sänka nummercounter. Export är inte verifierad SIE4B-konform och returnerar för närvarande HTML-content-type.
- Organisation kan väljas i UI men skapande/inställningar kräver API. Nya år får inte automatiskt serie eller kontoplan.
- Print/CSV finns i vissa rapporter. PDF är webbläsarens printdialog, inte en server-PDF-tjänst; komplett printstylesheet saknas.
- Kontoplansimport har en licensmedveten adaptergräns, inte en fungerande importprodukt eller full BAS-datamängd.
- Dashboard och toppbarens årsval använder isolerad exempeldata, inte organisationens ekonomi.

Viktiga kända risker: postning av ett ändrat befintligt utkast sparar inte först
skärmens ändringar, frontendstate kan behållas efter organisationsbyte och
historisk kontometadata kan omklassificeras. Se GAP_ANALYSIS innan användning.

## Planned / not implemented

Onboarding/organisation-settings, användarinbjudningar och rolladministration,
serieadministration, projekt/kostnadsställeregister, konteringsmallar,
öppningsbalanseditor/överföring, saldobalans, särskild verifikationsrapport,
globalt bilagearkiv, import/export UI och verklig dashboard. Menyernas
förberedda arbetsytor är placeholders, inte implementerade funktioner.

## Struktur och rutter

`apps/web` och `apps/api` driftsätts separat. `packages/db` äger schema/SQL,
`packages/sie` formatlogiken. `shared`, `ui` och `config` innehåller ännu små
hjälpare; de är inte färdiga gemensamma domänpaket.

Webben proxar `/api/*` till API_INTERNAL_URL. Riktiga vyer finns på
`/registers/accounts`, `/bookkeeping/vouchers`, `/bookkeeping/vouchers/new`,
`/bookkeeping/vouchers/[id]`, de fyra `/reports/...`-rutterna och
`/settings/fiscal-years`, `/settings/processing-history`, med `/app/...`-alias.
`/app` är den mockmärkta dashboarden. API-grupper listas i CURRENT_STATE.

## Lokal utveckling

Kräver Node 22 (pin `22.20.0`), pnpm `9.15.4` via Corepack, Docker Desktop/Compose
och nätåtkomst vid installation. Kör från repo-roten i PowerShell:

```powershell
corepack pnpm@9.15.4 install --frozen-lockfile
Copy-Item .env.example .env # Endast första gången; skriv inte över egen konfiguration.
corepack pnpm@9.15.4 infra:up
corepack pnpm@9.15.4 db:generate
corepack pnpm@9.15.4 db:deploy
corepack pnpm@9.15.4 dev
```

Webb: `http://localhost:3000`, API liveness: `http://localhost:4000/health`,
Swagger: `http://localhost:4000/docs`, lokal storagekonsol: `http://localhost:9001`.
Compose startbarhet verifierades inte i senaste granskningen eftersom
Docker-motorn inte var igång. Infrastrukturvolymer är inte backup.

Valfri `corepack pnpm@9.15.4 db:seed` är **endast för disponibla utvecklingsdata**.
Den skapar demoorg, aktuellt år, månadsperioder, serie A, två VAT-koder och tio
sample-konton. Demoanvändaren har ingen lösenordshash och inget demolösenord;
registrering ger inte automatiskt medlemskap i demoorganisationen. Seed kan
återställa demoanvändarens hash och periodstatus och spärras i production.

Använd migrationskedjan, inte `db:push`, för riktig verifiering. SQL-regler för
balans, immutability, lås och audit finns inte enbart i Prisma-schemat.

## Kontroller och aktuellt resultat

```powershell
corepack pnpm@9.15.4 lint
corepack pnpm@9.15.4 typecheck
corepack pnpm@9.15.4 test
corepack pnpm@9.15.4 build
corepack pnpm@9.15.4 test:integration
```

2026-10-06: lint och typecheck godkända; 53 ordinarie tester godkända.
Integrationstester stoppades före assertions eftersom TEST_DATABASE_URL saknas.
De kräver en **separat disponibel och migrerad PostgreSQL-databas**. Setup väljer
angiven URL men kontrollerar inte att du verkligen valt en säker test-DB.
Använd aldrig utvecklings-/produktionsdata som testdatabas.

Root `build` misslyckas på API_INTERNAL_URL: Next kräver den under production
build och Turbo strict-env släpper inte igenom den med dagens konfiguration.
Diagnostisk build lyckades med följande tillfälliga processinställning:

```powershell
$env:API_INTERNAL_URL = 'http://localhost:4000'
corepack pnpm@9.15.4 exec turbo run build --env-mode=loose
```

Detta är inte en rättning av root-script, CI eller cachehashning. P0-roadmapen
innehåller rätt env-kontrakt. Ingen konfigurationsfil ändrades i analysfasen.
Produktionsberoenden rapporterade 12 advisories (7 high); dessa är dokumenterade,
inte åtgärdade. Testpass betyder inte redovisningsmässig eller rättslig efterlevnad.

## Deployment och dokumentation

Vercel använder Root Directory `apps/web` och dess committed buildkommando,
vilket bygger webb-workspacet direkt utan root-Turbo. Ange API_INTERNAL_URL
som publikt HTTPS-origin för separat hostat Nest-API och bygg om efter ändring.
Ingen DB/JWT-hemlighet ska finnas i webbmiljön. API behöver säker
DB/auth/storage/origin-konfiguration och hostens PORT mappad till API_PORT.

Se [deployment](docs/vercel-deployment.md), [auth](docs/authentication.md),
[databas/ER](docs/database.md), [rapportering](docs/reporting.md),
[VAT-arkitektur](docs/vat-reporting.md), [SIE](docs/sie.md),
[historik](docs/processing-history.md) och [kalender](docs/fiscal-years.md).
Äldre detaljdokumentens begränsningar/överdrifter korrigeras uttryckligen i
CURRENT_STATE/GAP_ANALYSIS; foundation-ADR är historisk.

Backup/restore av både DB och bilagor, privata storagepolicies, runtime-DB-roll,
observability, riktig CI/E2E och kvalificerad svensk redovisningsgranskning
måste säkras före produktionsbruk. Nästa etapp är P0-stabilisering, inte nya moduler.
