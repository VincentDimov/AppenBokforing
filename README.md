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
- SIE har fristående paket, default-preview, confirm-transaktion och text-export. Import tappar IB/dimensioner/raddatum och kan sänka nummercounter. Export är inte verifierad SIE4B-konform och saknar riktig PC8-bytehantering. HTTP-exporten är nu en UTF-8-textdownload med fast filnamn och nosniff.
- Organisation kan väljas i UI men skapande/inställningar kräver API. Nya år får inte automatiskt serie eller kontoplan.
- Print/CSV finns i vissa rapporter. PDF är webbläsarens printdialog, inte en server-PDF-tjänst; komplett printstylesheet saknas.
- Kontoplansimport har en licensmedveten adaptergräns, inte en fungerande importprodukt eller full BAS-datamängd.
- Dashboard och toppbarens årsval använder isolerad exempeldata, inte organisationens ekonomi.

FAS 17 rättar sparning före postning och organisationsbunden frontendstate,
utan att ändra backendguards eller redovisningsregler. Historisk kontometadata
kan fortfarande omklassificeras; IB/moms/SIE-domänbrister kvarstår.
Se GAP_ANALYSIS innan användning.

## SIE HTTP-kontrakt efter FAS 17

GET /exports/sie returnerar UTF-8-byte exakt från serializersträngen som
`text/plain; charset=utf-8`, `attachment; filename="ledgerapp.sie"`,
`X-Content-Type-Options: nosniff` och no-store. HTML blir text, inte HTML;
recordtext påverkar aldrig downloadfilnamn/headers. Serializer deklarerar ännu
PC8 utan CP437-bytehantering; ingen SIE4B-konformitet/certifiering påstås.

POST /imports/sie: JSON `content` får vara högst **128 KiB (131072 UTF-8-byte)**,
räknat efter JSON-avkodning. Preview och confirm avvisas före SIE-parsning och
import-DB-arbete om gränsen överskrids. Global JSON-parser har ett **1 MiB** tak
som även rymmer maximal 6x escape-expansion och normal UUID/confirm-envelope.
Båda gränser ger JSON 413; multipart-bilagors separata 10 MiB-tak är oförändrat.
Auth-/medlemskontroller kan fortfarande läsa DB före importtjänsten.
Se [SIE](docs/sie.md) och GAP_ANALYSIS för kvarstående format/domänrisker.

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
Compose startbarhet är inte verifierad. En separat PostgreSQL 16-testcontainer
har körts; Docker krävde åtkomst utanför sandboxen. Infrastrukturvolymer är inte backup.

Valfri `corepack pnpm@9.15.4 db:seed` är **endast för disponibla utvecklingsdata**.
Den skapar demoorg, aktuellt år, månadsperioder, serie A, två VAT-koder och tio
sample-konton. Demoanvändaren har ingen lösenordshash och inget demolösenord;
registrering ger inte automatiskt medlemskap i demoorganisationen. Seed kan
återställa demoanvändarens hash och periodstatus och spärras i production.

Använd migrationskedjan, inte `db:push`, för riktig verifiering. SQL-regler för
balans, immutability, lås och audit finns inte enbart i Prisma-schemat.

## Kontroller och aktuellt resultat

Kör med processenv från repo-roten; .env i roten läses inte automatiskt av Next.
Den reserverade adressen nedan används endast för build-verifiering, **inte**
för körande applikation/deployment.

```powershell
corepack pnpm@9.15.4 lint
corepack pnpm@9.15.4 typecheck
corepack pnpm@9.15.4 test
$env:API_INTERNAL_URL = 'https://ledgerapp-api.example.invalid'
corepack pnpm@9.15.4 build
```

FAS 17, 2026-10-06: lint/typecheck/test/build PASS; 99 tester (API 43, web 43,
DB 11, SIE 2). Turbo behåller strict-läge och hashar API_INTERNAL_URL endast
för web-build. Inga DATABASE_URL/JWT-hemligheter skickas till webbbygget.
CI kör pushes till master och PR, med migrationsbaserad isolerad Postgres.
API lint/typecheck omfattar både src och integrationstestfiler.

Uppföljning 2026-10-06: **49 PostgreSQL-integrationstester i sju sviter passerar**
mot isolerade disponibla databaser. Alla elva migrationer har körts från tom DB;
den nya audit-rättningen har även applicerats efter de tidigare tio migrationerna.
De tidigare Docker-felen berodde på sandboxåtkomst, inte på en avstängd motor.
Verifieringen avslöjade och rättade en tabellöverskridande audit-triggerreferens
och ett ogiltigt Prisma-inputfält vid skapande av perioder. Ursprungliga
migrationsfiler är oförändrade; ny migration ersätter endast audit-funktionen.
Se GAP_ANALYSIS för exakta resultat och kvarstående begränsningar.

Starta en separat disponibel Postgres, inte den ordinarie utvecklingsdatabasen:

```powershell
docker run -d --name ledgerapp-p0-test -e POSTGRES_DB=ledgerapp_test -e POSTGRES_USER=ledgerapp_test -e POSTGRES_PASSWORD=local_disposable_test_only -p 15432:5432 postgres:16-alpine
docker exec ledgerapp-p0-test pg_isready -U ledgerapp_test -d ledgerapp_test
# Vänta tills pg_isready lyckas, innan migrationen.
$env:TEST_DATABASE_URL = 'postgresql://ledgerapp_test:local_disposable_test_only@localhost:15432/ledgerapp_test?schema=public'
$env:DATABASE_URL = $env:TEST_DATABASE_URL
corepack pnpm@9.15.4 --filter @ledgerapp/db exec prisma migrate deploy --schema prisma/schema.prisma
corepack pnpm@9.15.4 test:integration
docker stop ledgerapp-p0-test
Remove-Item Env:TEST_DATABASE_URL
Remove-Item Env:DATABASE_URL
```

Säkerhetsspärren kräver postgres/postgresql, loopbackhost (localhost/127.0.0.1/::1)
och exakt ledgerapp_test, och avvisar remote-/dev-/produktions-URL:er före anslutning.
Containern ovan behålls stoppad; använd en ny disponibel container vid ny test-DB.
Kör i ett separat terminalfönster så testens processenv inte påverkar utvecklingen.
Använd aldrig verkliga bokföringsdata som testdatabas och använd inte db:push.
Riktig GitHub-run/browser-E2E och S3 har inte verifierats i denna fas.
På Windows: kör Prisma-generate/build och integrationstester i följd, inte
parallellt, eftersom en aktiv Prisma-process låser query-engine-DLL:en.

Produktionsberoenden rapporterade tidigare 12 advisories (7 high); inga
dependencies har ändrats och ingen ny audit hävdas. Testpass betyder inte
redovisningsmässig eller rättslig efterlevnad.

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
+