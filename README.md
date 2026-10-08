# LedgerApp

## FAS 36 – Master Admin & Platform Administration

Separat global administration med persistenta roller, obligatoriskt första
lösenordsbyte/MFA, användar-/företagsprofiler, medlemskap, sessionsrevokering och
oföränderlig global audit. Framåtmigration 24 tillkommer; bokföringens tidigare
migrationer och behörighetsgränser bevaras. FAS 35-designsystemet återanvänds.
Se [funktioner/API](docs/platform-admin.md), [säkerhet](docs/platform-admin-security.md),
[explicit operatörsbootstrap](docs/platform-admin-bootstrap.md) och
[42-punktsrapport med aktuella verifieringsresultat](docs/fas36-release-gate.md).

Inget faktiskt Master Admin-konto har skapats i avsedd lokal/cloud-databas.
Adminåtkomst är fail-closed utan API:ts skyddade MFA-krypteringsnyckel.
Bootstrap körs aldrig automatiskt; credentials får inte hamna i kod/loggar/Git.
E-poståterställning, e-postbyte och resend är uttryckligen otillgängliga utan
verifierad leverans-/identitetsinfrastruktur. Ingen commit/push/deployment ingår.

För lokal vanlig användning: `corepack pnpm@9.15.4 infra:up`, kontrollera den
lokala DATABASE_URL-adressen, `corepack pnpm@9.15.4 db:deploy`, därefter
`corepack pnpm@9.15.4 dev`. Kopiera bara `.env.example` om lokal `.env` saknas;
skriv aldrig över den med produktionskonfiguration. MFA-konfiguration krävs
för globala adminfunktioner, inte för vanliga lokala login/register-flöden.

## FAS 35 — gemensam UI/UX, 2026-10-08

Nordisk arbetsyta med gemensamma tokens, kompakt navigation, mobildialog,
namngivna rapportår, tydliga bekräftelser och konsekvent tabell-/formpresentation.
Se [designsystem](docs/ui-design-system.md) och [fasrapport/releasegate](docs/fas35-ui-ux.md).
FAS 35 är lokala ändringar ovanpå `acbba5434321f0d5bfaf68b1a152d46d8e765b7e`;
ingen ny commit, push eller deployment har utförts. Bokföringens backendkontrakt
och kända P0-gränser är oförändrade.

## Historik: FAS 30–34 — implementerat i bascommit

Konteringsmallar, granskad SIE-import/export med historik, organisationsgemensamt
bilagearkiv, verifikationsrapport/CSV/A4 och verklig dashboard använder befintliga
Nest/Next/PostgreSQL-kontrakt. Inga produktionssidor visar mockbokföring.
Fyra framåtriktade migrationer ger totalt 23; äldre migrationer är oförändrade.
Se [slutrapport och full lokal releasegate](docs/fas30-34-release-gate.md),
[mallar](docs/posting-templates.md), [SIE UI](docs/sie-ui.md),
[bilagearkiv](docs/attachment-archive.md), [rapportexport](docs/report-exports.md)
och [dashboard](docs/dashboard.md).

Den tidigare lokala statusen är ersatt: FAS 30–34 ingår i `acbba5434321f0d5bfaf68b1a152d46d8e765b7e`.
[GitHub-run 37785265772](https://github.com/VincentDimov/AppenBokforing/actions/runs/37785265772)
har verifierats via GitHub API: verify, browser-e2e och recovery-runtime-gate SUCCESS
för samma SHA. Vercel READY för bascommit är användaruppgift, inte en ny verifierad
deployment i FAS 35. Den daterade fasrapportens äldre gitstatus är historisk.
Godkända tester innebär inte produktions-, redovisnings- eller regelgodkännande.

## Historik: FAS 25–29

See the [complete local release report, exact counts and remaining blockers](docs/fas25-29-release-gate.md).

Real onboarding/settings, invitations/permissions, voucher-series management,
atomic IB/explicit year carry-forward and project/cost-centre registers extend
the existing Nest/Next architecture. See [onboarding](docs/onboarding.md),
[members](docs/members-and-permissions.md), [series](docs/voucher-series.md),
[IB/carry](docs/opening-balances-and-carry-forward.md) and [dimensions](docs/dimensions.md).
These phases are now included in baseline commit `441567e`; the linked report
records their historical local verification, not a new deployment approval.
Production email delivery is fail-closed until a real reviewed adapter is configured.

## FAS 24 — verified remote baseline

Decision: **GO FOR P1 WITH EXPLICIT P0 BLOCKERS**, not production/legal approval.
Raw production audit now zero; independent SIE/Golden report equivalence,
real private S3 restore and runtime LOGIN checks pass locally. Commit
`96f131e8def14831b2f4000666d35584087fe242` has all three remote jobs SUCCESS
([run 37679581119](https://github.com/VincentDimov/AppenBokforing/actions/runs/37679581119));
Vercel production is READY for the same commit. This is FAS 24 evidence, not CI
or deployment evidence for the new FAS 25–29 working tree.
See [complete evidence, counts and every P0 disposition](docs/fas24-release-gate.md)
and [current production checklist](docs/production-readiness.md).
Earlier phase descriptions below are historical snapshots.

FAS 23.1 CI-hotfix: Node-side E2E använder nu deklarerade workspace-
devDependencies `@ledgerapp/sie`/`@ledgerapp/db` i stället för relativa
genererade dist-/src-importer. Ren källkopia klarar frozen install, Prisma
generate och strict typecheck utan befintliga byggartefakter. Ingen ändrad
SIE/moms/redovisningslogik eller lättad säkerhetsgate; [aktuell CI-status](docs/CURRENT_STATE.md).

FAS 21–23 har genomförts sammanhängande: riktig PC8-SIE för dokumenterad subset,
signerad importreview, bevarad IB/dimension/raddatum, versionskontroller och
samtidighetstestad bokföring, säkerhetshärdning och återställningsverktyg.
Verifierat: 156 ordinarie tester, 86 PostgreSQL-integrationstester och 13
Chromium-E2E, lint/typecheck/build samt 14 migrationer från tom testdatabas.
Databasåterläsning med immutabilitetsskydd och runtime-rollen PASS.
Full bilageåterläsning och flera produktionsgates återstår; audit har fortfarande
1 dokumenterad HIGH. Det är **inte** ett produktions-/regelgodkännande.
Aktuell [status](docs/CURRENT_STATE.md), [SIE-kontrakt](docs/sie.md),
[samtidighet](docs/concurrency.md), [produktionschecklista](docs/production-readiness.md).
Tidigare fasnoteringar nedan är historik.

FAS 20: explicit momsunderlag/skattebelopp, fryst VAT-metadata vid postning,
versionerad begränsad svensk adapter, granskningsavvikelser och uppdaterad
momsrapport/editor. [Modell, manuellt Golden-facit och begränsningar](docs/vat-reporting.md).
Migration 12 är endast körd i disponibla tester; äldre bokföring klassificeras
inte automatiskt. Passing tests är inte regulatorisk efterlevnad.
FAS 20-kontroller PASS: lint/typecheck/build, 132 ordinarie tester,
73 PostgreSQL-integration, 11 lokala browserfall och 7 safety-kontrakt.

## FAS 19 — gemensamt rapportkontrakt

Huvudbok inkluderar nu validerad IB. Balansräkning, huvudbok, resultat och ny
saldobalans läses per anrop i RepeatableRead-snapshot med Decimal-belopp.
`GET /reports/trial-balance` och `/reports/trial-balance` (även `/app`-alias)
visar IB, period och UB med debet/kredit och balanserade totalsummor.
Gemensam Golden-fixtur: bank UB 11 000; resultat 2 000; tillgångar 11 000 =
EK inklusive resultat 11 000 + skulder 0. Felaktig IB ger 422, inte en lyckad rapport.
[Kontrakt, manuellt facit och begränsningar](docs/accounting-balances.md).
P0-06 är klart inom FAS 19; IB-editor/årsöverföring, SIE och moms är inte därmed klara.

Svensk flerorganisationsbaserad bokföringsapplikation under utveckling.
Next.js-webb, NestJS-API, PostgreSQL/Prisma och S3-kompatibla bilagor i ett
pnpm/Turborepo-monorepo. Projektet innehåller redan substantiell funktionalitet,
men är **inte redo för verklig produktionsbokföring**.

FAS 18 lägger till separat Playwright-verifiering genom Chromium → Next-proxy →
NestJS → disponibel PostgreSQL samt skrivskyddad produktions-smoke.
Körinstruktioner, täckningsgränser och headerfynd:
[E2E verification](docs/e2e-verification.md).
`test:e2e`/`test:e2e:headed` kräver lokal `E2E_DATABASE_URL` med databasnamnet
`ledgerapp_e2e`; `test:e2e:smoke` är separat och får användas mot publicerad webb.
Normal `test` startar inte browsers. Ett separat isolerat browserjobb finns i CI;
en faktisk GitHub-run och produktionscookies utan godkänt testkonto är inte styrkta.

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
- Gemensamt validerat IB-/rapportkontrakt och saldobalans, avstämda mot Golden-fixturer.

Implementerad betyder inte att hela produktflödet är komplett eller utan risker.
Alla skyddade API-rutter kräver session, organisationsdata också medlemskap.
Owner/admin/accountant skriver bokföring; member/read-only läser.

## Partially implemented

- Huvudbok, resultat- och balansräkning samt momsrapport har verkliga POSTED-queries och UI. GL inkluderar validerad IB; moms har explicit underlag/skatt och begränsad svensk mappning, inte en komplett deklarationsmotor.
- Balansräkning läser IB och stödjer jämförelsedatum inom samma år. Inget komplett IB-/årsöverföringsflöde finns.
- SIE har fristående paket, signerad explicit preview/confirm, IB/dimensioner/raddatum och säkert maximum för nummercounter. Export använder PC8/CP437-bytes och RepeatableRead. Begränsad subset, inte oberoende verifierad full SIE4B-konformitet.
- Organisation kan väljas i UI men skapande/inställningar kräver API. Nya år får inte automatiskt serie eller kontoplan.
- Print/CSV finns i vissa rapporter. PDF är webbläsarens printdialog, inte en server-PDF-tjänst; komplett printstylesheet saknas.
- Kontoplansimport har en licensmedveten adaptergräns, inte en fungerande importprodukt eller full BAS-datamängd.
- Dashboard och toppbarens årsval använder isolerad exempeldata, inte organisationens ekonomi.

FAS 17 rättar sparning före postning och organisationsbunden frontendstate,
utan att ändra backendguards eller redovisningsregler. Historisk kontometadata
kan fortfarande omklassificeras; IB-editor/överföring, ej stödda momsfall och SIE-domänbrister kvarstår.
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
öppningsbalanseditor/överföring, särskild verifikationsrapport,
globalt bilagearkiv, import/export UI och verklig dashboard. Menyernas
förberedda arbetsytor är placeholders, inte implementerade funktioner.

## Struktur och rutter

`apps/web` och `apps/api` driftsätts separat. `packages/db` äger schema/SQL,
`packages/sie` formatlogiken. `shared`, `ui` och `config` innehåller ännu små
hjälpare; de är inte färdiga gemensamma domänpaket.

Webben proxar `/api/*` till API_INTERNAL_URL. Riktiga vyer finns på
`/registers/accounts`, `/bookkeeping/vouchers`, `/bookkeeping/vouchers/new`,
`/bookkeeping/vouchers/[id]`, de fem `/reports/...`-rutterna och
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
Efter koduppdateringar behöver även den befintliga lokala databasen uppdateras:
ta backup, kontrollera att `.env` pekar på `localhost:5433/ledgerapp` och kör
`corepack pnpm@9.15.4 db:deploy` innan utvecklingsservrarna startas igen.
Skriv inte över `.env`, använd inte reset och kör inte seed för att reparera
inloggning. För lokal webb ska `API_INTERNAL_URL` vara `http://localhost:4000`
eller lämnas osatt så utvecklingsstandardvärdet används, inte byggexemplets
`example.invalid`-adress. Next.js utvecklingsläge har en uttrycklig CSP-exception
för `'unsafe-eval'`; produktionspolicyn är oförändrad och tillåter inte detta.

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
observability, körverifierad GitHub-CI, bredare E2E och kvalificerad svensk redovisningsgranskning
måste säkras före produktionsbruk. Nästa etapp är P0-korrekthet, inte nya moduler.
