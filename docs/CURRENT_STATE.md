# LedgerApp — faktiskt nuläge

## FAS 21–23 — sammanhängande arbete, 2026-10-07

SIE har riktig PC8/CP437, exakta cent, injektionsskydd, explicit signerad preview,
IB/objekt/raddatum, monotont nummercounter och RepeatableRead-export. Subset,
förlustvarningar och återstående oberoende verifiering: [SIE](sie.md).
Migration 13 bevarar raddatum; migration 14 inför verifikationsversioner.
PATCH/POST kräver expectedVersion; 409 bevarar lokala UI-värden med explicit
omladdning. Nio riktiga PG-racetester: [samtidighetskontrakt](concurrency.md).

Säkerhet: 15 advisories före, 1 HIGH efter kompatibla uppdateringar. Exakt
tidsbegränsat undantag, ingen ren audit. Produktionsvalidering, originskydd,
request-ID/loggredaktion, säkerhetsheaders och /ready tillagda. Runtime-role
och report-only lagringsavstämning finns. Riktig databasåterläsning PASS:
13 modellantal, POSTED/audit-skydd, tenant-FK och nekad runtime-DDL.
Bilageåterläsning är INTE verifierad: AIStor-upload 503 utan licens;
Community-image/binary var inte tillgängliga. [Releasechecklista](production-readiness.md).

Verifierat: lint 6 tasks, typecheck 9, build av DB/SIE/API/web (28 sidor),
156 tester (API 85/web 51/DB 11/SIE 9), 86 PG i elva sviter, 13 Chromium-E2E.
Fjorton migrationer från tom isolerad DB. Separat avstämningskontrakt 1 PASS.
Efter restore nekas även direkt skapande i låst period och obalanserad postning.
P0-02/03/10/11/13 förblir PARTIAL där fullständiga gates inte är styrkta.
Ingen cloud-deployment, inga ändrade produktionshemligheter eller ordinarie
utvecklingsdata. Grön teknik är inte ett redovisnings-/produktionsgodkännande.
Äldre fasavsnitt nedan är historiska, inte dagens status.

## FAS 20 — explicit momsmodell, 2026-10-07

POSTED-rader har uttrycklig BASE/TAX-roll, momsgrupp och fryst momskonfiguration.
Underlag och moms blandas inte; rättelser bevarar metadata och vänder beloppen.
Ren Decimal-motor separerad från versionerad svensk adapter; begränsade fält
05/10/11/12/48/49, granskningskrav och explicita avvikelser. Rapporten har
RepeatableRead, verkliga datum-/tenantgränser och uppdaterad UI/CSV.
Migration 12 är framåtriktad; äldre historik lämnas oklassificerad utan gissning.
[Modell, Golden-facit, konfigurationsprocess och scope](vat-reporting.md).
P0-08 COMPLETE endast inom denna omfattning, inte ett moms-/produktionsgodkännande.
Momsadministration, undantagsmappning och alla icke-stödda skattefall återstår.
Slutkontroller: lint 6 tasks, typecheck 9, build 4 / 28 statiska sidor PASS;
132 ordinarie tester (API 69/web 50/DB 11/SIE 2), 73 PG i nio sviter och
11 lokala Chromium-E2E PASS. Separata local-only guard-kontrakt: 7 PASS.
Tolv migrationer applicerade från tom test-DB; inga gamla migrationer ändrade.
Ingen deployment eller ändring av ordinarie utvecklings-/produktionsdata.

## FAS 19 — rapportkonsistens, 2026-10-07

IB/GL/BS/saldobalans delar Decimal-/teckenkontrakt och validerar hela årets IB.
GL summerar IB + tidigare POSTED till intervallets start; BS räknar IB +
POSTED till rapportdatum och verkligt årsresultat. Inga balanspluggar.
Ny saldobalans har medlemsguard, datum/årfilter, sex beloppskolumner och totals;
frontend med navpost, båda routemönstren och print.
Alla fyra redovisningsrapporter använder en snapshot per anrop.
[Exakta regler och Golden-facit](accounting-balances.md).

Golden-fixturen är gemensam för PG/HTTP, UI-rendering och lokal browserkedja.
59 PG-integrationstester passerar i åtta sviter, inklusive nio nya Goldenfall.
Ingen migration/index krävs; SQL-skydd och bokföringshistorik är bevarade.
P0-06 är klart inom denna fas. IB-editor/överföring, metadatahistorik, moms,
SIE-snapshot/import/export och samtidiga journalversioner är fortfarande gap.
Slutkontroller: lint/typecheck/build PASS; 109 ordinarie tester, 59 PG-integration,
10 lokala Chromium-E2E (17,0 s) och 7 säkerhetsguard-kontrakt PASS.
Kommandon/miljö/initiala fel dokumenteras i accounting-balances.md.

## FAS 18 — driftgräns, uppföljning 2026-10-06

Playwright 1.63.0 är separat från Jest/unit/integration. Runnern bygger
DB/SIE/API/webb, kör alla elva migrationer och startar kompilerat NestJS samt
`next start` med en lokal `/api/*`-proxy. Mutationstester avvisar andra än
loopback-stackar/databasen `ledgerapp_e2e`. Separat Chromium-smoke tillåter
skrivskyddade publika GET; autentisering är explicit opt-in med isolerat konto.

Verkliga browserfall har verifierat auth/cookies/omladdning/utloggning,
orgbyte/reset, 1000→osparat 5000→POSTED i API och PostgreSQL, dubbelklick/hotkey,
immutability/rättelse, låsning, tre rapporter mot exakt fixture samt sena svar
och fel-UX. [Detaljer och avgränsningar](e2e-verification.md).

Två reproducerade runtimefel rättades: Prisma ersättningsrader skapades före
nested deleteMany och krockade på radnummer; deletion sker nu explicit inom
samma transaktion. Logout/home konkurrerade med anonymous/login-redirect;
layouten har nu explicit logoutavsikt. Inga rapport-/moms-/SIE-regler ändrades.

Produktion-smoke: **4 PASS, 1 SKIPPED**, inga accounting-writes. Publika sidor
fungerar och health-proxyn når Nest. HTML saknar de granskade säkerhetsheaders;
API-headers bevaras genom proxyn. Live Secure/HttpOnly/SameSite-cookies ej
verifierade utan uttryckligen godkänd driftcredential. Onboarding/orgskapande
i frontend och serieadministration återstår; fixturer använder befintligt API
samt test-only DB-metadata. Nytt browser-CI-jobb är inte GitHub-körverifierat.

Ordinarie root `lint`, `typecheck`, `test`, `test:integration`, `build`:
PASS. **99 unit-/kontraktstester, 50 verkliga PostgreSQL-integrationstester**.
Separata säkerhetsguard-kontrakt: **7 PASS**.
`corepack pnpm@9.15.4 test:e2e`: **9 PASS (14,9 s)** i en sammanhängande
Chromium-run efter ny productionbuild; verklig browser → API → PostgreSQL
styrkt, utan retries, mocks av accounting-svar eller produktionsmutationer.
`corepack pnpm@9.15.4 test:e2e:smoke`: **4 PASS, 1 SKIPPED** separat.
Ingen deployment utförd.

Granskat 2026-10-06, utgångspunkt commit `0b2f11a` på `master`.
Detta är en kodbaserad inventering, inte ett produktionsgodkännande. Inga
funktionsändringar, migrationer eller deploymenter gjordes i denna granskning.
Risker och verifieringsbegränsningar finns i [GAP_ANALYSIS](GAP_ANALYSIS.md).
Nästa leveranser finns i [ROADMAP](ROADMAP.md).

## Uppföljning: FAS 17 del 1

Implementerad efter inventeringen: kanonisk CREATE/PATCH→POST med submitlås,
organisationsnycklad frontend med abort/sena-svar-skydd, explicit SIE-textdownload
och storleksgränser, strict Turbo-env/hash och CI på master. Historiska fynd och
exakta begränsningar/resultat finns i [GAP_ANALYSIS](GAP_ANALYSIS.md#fas-17--p0-stabilisering-del-1-2026-10-06).
99 ordinarie tester passerar. Fortsättningen av P0-12 körde isolerad PostgreSQL:
49 integrationstester i sju sviter passerar efter två bekräftade runtime-rättningar
(audit-triggerns tabell-dispatch och Prisma nested-period-input). Elva migrationer
har körts från tom DB; en ny framåtriktad audit-funktionsmigration tillkommer.
Gamla migrationsfiler och redovisningsberäkningar är oförändrade. Ingen deployment
eller ny produktmodul har införts. GitHub-run och browser-E2E återstår.

## Arkitektur och gränser

```text
Webbläsare → Next.js /api/* rewrite → NestJS REST API
                                      ├─ Prisma → PostgreSQL
                                      ├─ S3-adapter → objektlagring
                                      └─ @ledgerapp/sie → parser/serializer
```

| Del                 | Faktisk implementation                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`          | Next.js App Router, React, Tailwind och lokala shadcn/Radix-komponenter. Publik startsida, auth och klientrenderad arbetsyta.                           |
| `apps/api`          | NestJS-moduler för auth, organisationer, konton, verifikationer, bilagor, rapporter, SIE, historik och kalender.                                        |
| `packages/db`       | Prisma-schema, delad PrismaClient, tolv SQL-migrationer och utvecklingsseed. SQL-triggers kompletterar Prisma.                                          |
| `packages/sie`      | Fristående TypeScript-parser och textgenerator för ett begränsat SIE4-flöde. Ingen databas eller HTTP-kod.                                              |
| `packages/shared`   | Endast hjälpfunktionen `isDefined`; inte ett gemensamt domän-/API-kontrakt.                                                                             |
| `packages/ui`       | Endast `cn`; webbens verkliga UI-komponenter ligger i `apps/web/components/ui`.                                                                         |
| `packages/config`   | Zod-hjälpare för `NODE_ENV`; ingen heltäckande delad miljövalidering.                                                                                   |
| Verktyg             | pnpm-workspace, Turborepo, TypeScript, ESLint, Jest/Testing Library, Node test runner.                                                                  |
| Lokal infrastruktur | Compose med PostgreSQL `16.8-alpine` och AIStor/MinIO-kompatibel lagring, namngivna volymer. Inga applikations-Dockerfiles.                             |
| Deployment          | Dokumenterat separat Vercel-webb och långlivad Node-API. `apps/web/vercel.json` bygger bara webben. Ingen komplett deklarativ API-releasekonfiguration. |

Källor: [AppModule](../apps/api/src/app.module.ts),
[Next-konfiguration](../apps/web/next.config.ts), [Turbo](../turbo.json),
[Compose](../compose.yaml), [Prisma-klient](../packages/db/src/index.ts).
Webben läser inte PostgreSQL direkt. Organisation väljs i AuthProvider;
API:t använder den autentiserade användarens medlemskap som auktoritativ gräns.

### Versioner

Manifest: Node `22.x`, `.node-version` `22.20.0`, pnpm `9.15.4`, Next `15.5.24`,
React/React DOM `19.2.1`, Prisma/client `6.17.1`, NestJS `^11`,
Argon2 `^0.41.1`, Tailwind `^4.1.13`, TypeScript `^5.8.3` i roten,
Jest `^29.7.0`, AWS SDK `^3.1132.0`. Körningen använde Node `22.20.0`,
Turbo `2.10.12` och TypeScript-låsningen `5.9.3`.
Låsfilen anger Nest core/platform-express `11.2.3` och Swagger
`11.4.7`, Multer `2.2.0`, Nexts PostCSS `8.4.31`, Effect `3.16.12`,
deepmerge-ts `7.1.5` och js-yaml `5.3.0` i beroendegrafen.
Ett `^` i ett manifest är inte en garanti om vilken version som installeras;
`pnpm-lock.yaml` bestämmer reproducerbara installationer.

## Funktionsmatris

`COMPLETE` betyder att det avgränsade flödet finns, inte att det är produktionsklart.
`PARTIAL` = verklig men ofullständig funktion, `MOCK` = exempeldata,
`PLACEHOLDER` = navigerbar förberedd sida, `MISSING` = ingen användbar funktion,
`BROKEN` = bekräftad felväg. DB = modell, inte automatiskt fungerande produkt.
Tester i tabellen avser befintliga filer. Uppföljningens sju integrationssviter
kördes nu till assertions mot isolerad PostgreSQL; de täcker inte alla kända luckor.

| Feature                    | Backend                                                | Frontend                                        | Database                         | Authorization                            | Tests                                           | Production readiness   | Known limitations                                                          |
| -------------------------- | ------------------------------------------------------ | ----------------------------------------------- | -------------------------------- | ---------------------------------------- | ----------------------------------------------- | ---------------------- | -------------------------------------------------------------------------- |
| Authentication             | Register/login/refresh/logout/me                       | COMPLETE login/register                         | User                             | Global sessionguard                      | Auth integration                                | PARTIAL                | Ingen återställning, verifiering eller MFA.                                |
| Sessions                   | Persistens, rotation, familjerevokering                | PARTIAL                                         | Session                          | Aktiv användare/session                  | Rotation integration                            | PARTIAL                | Ingen generell refresh vid API-401; flera flikar.                          |
| Organizations              | List/create/get/patch                                  | PARTIAL väljare                                 | Organization                     | Medlemskap; owner/admin uppdaterar       | Auth/org integration                            | PARTIAL                | Skapa/redigera UI saknas.                                                  |
| Multi-tenancy              | Organisationsscopade queries och resourceguards        | PARTIAL                                         | Komposit-FK                      | Medlemskap + roll                        | Flera integrationssviter                        | PARTIAL                | Org-bound frontend i FAS 17; ingen RLS/browser-E2E.                        |
| Permissions                | Fem roller, permissionshelpers                         | PARTIAL rollstyrda kontroller                   | OrganizationMember               | OWNER/ADMIN/ACCOUNTANT skriver bokföring | Unit + integration                              | PARTIAL                | SIE-export använder read i stället för export-permission.                  |
| Users                      | Registrering och aktuell användare                     | PLACEHOLDER administration                      | User/member                      | Hanteringspermission finns               | Auth/org integration                            | MISSING administration | Inga invitationer, medlems-/roll-API:er.                                   |
| Fiscal years               | List/create/close                                      | PARTIAL riktig kalender                         | FiscalYear                       | Owner/admin hanterar år                  | Unit/HTTP/integration                           | PARTIAL                | 24 perioder i service men högst 13 i DB.                                   |
| Accounting periods         | Automatiska månadsperioder                             | PARTIAL                                         | AccountingPeriod                 | Läsa som medlem                          | Kalender integration                            | PARTIAL                | Ingen separat periodredigering; DB-skydd för periodstruktur ofullständigt. |
| Period locking             | Lock/unlock + kalenderkontroll                         | COMPLETE bekräftelsedialog                      | SQL-triggers                     | Owner/admin/accountant                   | HTTP, SQL-integration                           | PARTIAL                | Races/deadlocks inte fullständigt testade.                                 |
| Chart of accounts          | List/get/create/patch, nummer-/namnsökning             | COMPLETE kontoform/tabell                       | Account                          | Manage accounts + medlemskap             | Unit/UI/integration                             | PARTIAL                | Historisk metadata kan ändras; ingen BAS-importprodukt.                    |
| VAT codes                  | Referensvalidering + fryst version/rate/direction      | PARTIAL fritextkod + explicit momsroll          | VatCode + JournalLine snapshot   | Organisationens kod                      | Golden engine/PG/browser                        | PARTIAL                | CRUD och historiska regelbibliotek saknas; legacy är unreviewed.           |
| Voucher series             | Läses i options; räknare i post/import                 | PLACEHOLDER administration                      | VoucherSeries                    | Via journalguard                         | Numrering integration                           | PARTIAL                | Ingen serie-CRUD; nya år får inte automatiskt serie.                       |
| Journal entries            | List/get/create/patch/post/reverse                     | PARTIAL editor/lista                            | JournalEntry                     | Read/create bookkeeping                  | Journal integration                             | PARTIAL                | PATCH före POST testat; samtidig versionskontroll saknas.                  |
| Journal lines              | Validerade beloppssträngar/referenser                  | COMPLETE redigerbar tabell                      | JournalLine                      | Via huvudpost                            | Journal integration + öre-unit                  | PARTIAL                | Ingen versionskontroll för samtidiga utkast.                               |
| Draft vouchers             | Create/update, obalanserat utkast tillåtet             | PARTIAL spara/ladda                             | DRAFT                            | Writeroller                              | Journal integration                             | PARTIAL                | Orgbyte rensar formulär; osparat arbete måste återinmatas.                 |
| Posting                    | Decimal-balans, två rader, transaktion                 | PARTIAL                                         | Deferred balance/immutability    | Writeroller                              | Journal integration                             | PARTIAL                | API-skydd starkare än UI-flödet; inga E2E.                                 |
| Voucher numbering          | Atomisk counter, serializable retries                  | Nummer efter postning                           | Fyrdelad unique                  | Via posting                              | Samtidighet integration                         | PARTIAL                | Import kan sänka counter; Int-gräns.                                       |
| Corrections/reversals      | Ny exakt motpost; en rättelse/original                 | COMPLETE dialog/länkar                          | Tenant-safe reversal FK          | Writeroller; öppen målperiod             | Journal integration                             | PARTIAL                | Ingen allmän rättelsekedja; historiska metadata ej frysta.                 |
| Attachments                | Upload/list/signed download                            | COMPLETE per sparad verifikation                | Attachment + SHA-256             | Medlemskap/read/write                    | UI + integration, storage mock                  | PARTIAL                | Arkiv-placeholder; ingen verklig S3-/AV-/restoreverifiering.               |
| Projects                   | Endast radreferenser/exportläsning                     | PLACEHOLDER register                            | Project                          | Via journalreferenser                    | Indirekta journal/report fixtures               | MISSING administration | Ingen CRUD eller väljare.                                                  |
| Cost centers               | Endast radreferenser/exportläsning                     | PLACEHOLDER register                            | CostCenter                       | Via journalreferenser                    | Indirekta fixtures                              | MISSING administration | Ingen CRUD; fel SIE-exportdimension.                                       |
| Posting templates          | Ingen tjänst                                           | PLACEHOLDER                                     | Template/line                    | Helpers, inget endpointflöde             | Schema endast                                   | MISSING                | Datamodell och meny är inte mallfunktion.                                  |
| Opening balances           | Validerad läsning i GL/BS/trial; SIE oförändrad        | MISSING editor                                  | OpeningBalance                   | Read bookkeeping; ingen normal skriv-API | Golden PG/HTTP                                  | PARTIAL                | IB-editor/överföring/import kvarstår.                                      |
| General ledger             | Validerad IB + POSTED, running, snapshot               | Filter/print/CSV                                | Journal/IB + befintliga index    | Read bookkeeping                         | Golden PG/HTTP/browser                          | PARTIAL                | IB/dimensioner ger 422; volym/paging kvarstår.                             |
| Voucher list               | Bokföringslista finns; rapport saknas                  | PLACEHOLDER rapport; verklig bookkeeping-lista  | JournalEntry                     | Read bookkeeping                         | Journal integration                             | PARTIAL                | Ingen särskild utskriftsrapport eller paging.                              |
| Trial balance              | IB + POSTED + sex sidtotals, snapshot                  | Filter/tabell/print, båda rutter                | Befintliga data; SQL-groupBy     | Read bookkeeping                         | Golden PG/HTTP/UI/browser                       | PARTIAL                | Manuellt FY-ID; ingen dimensionsfördelning.                                |
| Income statement           | POSTED, två metadata-grupper, period/YTD               | PARTIAL                                         | Journal queries                  | Read bookkeeping                         | Manuella totals integration                     | PARTIAL                | Inget mer detaljerat rapportschema; historiska kontotyper mutabla.         |
| Balance sheet              | Validerad IB + POSTED + verkligt årsresultat; snapshot | Jämförelse/print/CSV                            | OpeningBalance/journal           | Read bookkeeping                         | Golden PG/HTTP                                  | PARTIAL                | Jämförelse inom samma år; metadatahistorik/överföring kvarstår.            |
| VAT report                 | Explicit base/tax + versionerad begränsad SE-adapter   | PARTIAL underlag/print/CSV/granskningsvarningar | Frysta POSTED-rader              | Read bookkeeping                         | Golden engine/PG/browser                        | PARTIAL                | Inte komplett deklarationsmotor; unsupported/legacy kräver granskning.     |
| SIE import                 | Preview default; confirm-transaction                   | PLACEHOLDER                                     | SieImport finns men används inte | Create bookkeeping                       | 2 parser tests + service mocks/lock integration | BROKEN/ofullständig    | IB/dimensioner/raddatum tappas; counter/parserbrister.                     |
| SIE export                 | Text, saldo/voucher/object + exportjob/audit           | PLACEHOLDER                                     | SieExport används                | Read bookkeeping                         | Syntetisk pakettest, service audit mock         | PARTIAL                | Inte verifierad SIE4B-konformitet eller korrekt PC8-fil.                   |
| Audit / processing history | Read/filter/page, skrivning i transaktioner            | COMPLETE list/filter/details                    | Append-only audit + triggers     | Read bookkeeping                         | Unit/HTTP/DB integration                        | PARTIAL                | Ingen auth-säkerhetslogg/extern tamper-evident lagring.                    |
| Organization settings      | PATCH finns                                            | PLACEHOLDER                                     | Organization                     | Owner/admin                              | Org integration                                 | PARTIAL                | Ingen inställningsform/onboarding.                                         |
| User administration        | MISSING                                                | PLACEHOLDER                                     | Member + role-change audit       | Manage helper finns                      | Behörighetstest, inte administration            | MISSING                | Ingen invite/revoke/change-role-produkt.                                   |
| Import/export UI           | API finns                                              | PLACEHOLDER                                     | Jobmodeller                      | SIE routepermissions                     | Inga E2E                                        | MISSING                | Ingen filpreview/confirm/downloadvy.                                       |
| Dashboard                  | Ingen dashboard-API                                    | MOCK                                            | Ingen query                      | Skyddat skal                             | Mock-rendering unit                             | MOCK                   | Belopp, senaste vouchers och toppbarens år är exempeldata.                 |

### API-karta

Skyddade grupper kräver global AccessTokenGuard; organisationsdata kräver också
medlemskap. `organizationId` skickas i query/body där resource-ID inte används.

- `/auth`: POST register/login/refresh/logout; GET me. De fyra POST-rutterna är public med respektive auth-/refreshvillkor.
- `/organizations`: GET/POST; `/:id`: GET/PATCH.
- `/accounts`: GET/POST; `/:id`: GET/PATCH. Ingen DELETE.
- `/journal-entries`: GET/POST; `/options`: GET; `/:id`: GET/PATCH; `/:id/post`, `/:id/reverse`: POST. Ingen DELETE.
- `/journal-entries/:id/attachments`: GET/POST; `/attachments/:id/download`: GET.
- `/reports/general-ledger`, `/income-statement`, `/balance-sheet`, `/trial-balance`, `/vat`: GET under `/reports`.
- `/imports/sie`: POST; `/exports/sie`: GET.
- `/audit-events`: GET, 50 händelser per sida, datum/user/action/entity-filters.
- `/fiscal-years`: GET/POST; `/:id/close`: POST; `/accounting-periods/:id/lock` och `/unlock`: POST.
- `/health`: public liveness. `/docs`: Swagger monterad även i produktion.

Källor: modulernas controllers samt [audit.module.ts](../apps/api/src/audit/audit.module.ts).

## Bokföringsmotor och databas

Alla 20 domänmodeller i [schemat](../packages/db/prisma/schema.prisma) har UUID-ID.
UUID-default skapas av Prisma; handskriven SQL måste själv ange ID. Tidpunkter
är `timestamptz(3)`, bokföringsdatum `date`, pengar `numeric(18,2)`, kvantitet
`numeric(18,4)`, momssats `numeric(5,2)`. `updatedAt` är normalt Prisma-hanterat.

Manuell bokföring använder Decimal i API och BigInt-ören i UI. Varje rad måste
ha exakt en positiv sida och ingen negativ sida. Utkast får vara obalanserade;
POSTED måste ha minst två rader och exakt lika summor både i tjänsten och i
deferred SQL-trigger vid commit. Postning tilldelar seriecounter atomiskt och
skapar audit i samma serializable transaktion, med begränsad retry.

Fyrdelad voucher-unique är organisation/år/serie/nummer. Tenantägda relationer
använder organisation i komposit-FK. Ledgerposter/rader har uttrycklig RESTRICT
och SQL-immutability. Endast sessioner och mallrader har CASCADE. Rättelse
skapar ny POSTED motpost; originalet förblir POSTED. `reversedByEntryId` är
härledd från länken, inte ett separat redigerbart lagrat fält. Enum REVERSED
finns men används inte av det normala rättelseflödet.

Räkenskapsår kan inte överlappa per organisation. Kalendertriggers skyddar
både gammal och ny kalender vid förflyttning av utkast, rader och bilagor;
öppningsbalansändring spärras när någon period i året är låst. Stängning kräver
låsta perioder och inga utkast, men är inte ett komplett bokslut eller en
automatisk balanstransfer till nästa år.

### Samtliga migrationer

| Migration                                      | Faktiskt tillskott                                                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `20260914061329_init`                          | Historisk bootstrap-marker.                                                                                              |
| `20260914065404_core_database_domain`          | Domän, UUID/FK/index/unique/check, FY-exclusion, balans och auditimmutability; marker tas bort.                          |
| `20260914121500_auth_session_security`         | Sessionfamiljer/rotation/absolut expiry och case-insensitive email-unique.                                               |
| `20260914140000_account_management`            | Kontobeskrivning och pg_trgm-name index.                                                                                 |
| `20260914160000_journal_entry_bookkeeping`     | Tvåradersbalans, calendar/statusguards, POSTED header/line-immutability, index.                                          |
| `20260915090000_journal_entry_corrections`     | REVERSAL, unik tenant-safe originalrelation och exakt inversekontroll.                                                   |
| `20260915110000_accounting_attachments`        | Obligatorisk SHA-256/positiv begränsad filstorlek och attachment-index.                                                  |
| `20260922120000_general_ledger_report_index`   | Partiellt POSTED-index organisation/år/datum.                                                                            |
| `20261005120000_processing_history`            | Auditkontext/request-ID, FY-create/period-status/member-change audittriggers.                                            |
| `20261005140000_calendar_locking`              | Kalenderlås för entry/line/IB/attachment-writes och regler för årsstängning.                                             |
| `20261006150000_audit_trigger_record_dispatch` | Tabell-dispatch före NEW/OLD-fältåtkomst i audit-funktionen; befintliga triggers/skydd behålls.                          |
| `20261007120000_explicit_vat_model`            | Roller/grupp/snapshot, kodversion/giltighet/kategori och ytterligare rättelseintegritet. Ingen historisk klassificering. |

SQL-filerna måste appliceras, inte ersättas av `prisma db push`; annars saknas
kritiska regler som inte uttrycks av Prisma. Baslinjegranskningen applicerade inga
migrationer; uppföljningen körde hela kedjan endast i disponibla testdatabaser.

## Frontend, rutter och mockar

Verkliga arbetsvyer har både korta rutter och `/app/...`-alias: accounts,
vouchers/new/[id], de fem rapporterna, fiscal-years och processing-history.
Det är delade komponenter, inte två separata implementationsuppsättningar.
`/app/bookkeeping/new-voucher` är en äldre redirect. `/app/[...slug]` ger
WorkspacePlaceholder för kända menyval; okända slugs går till notFound.

Placeholder-val: posting-templates, attachments-arkiv, voucher-list-rapport,
projects, cost-centers, organization-settings, voucher-series, users och
import-export. Motsvarande korta rutter finns inte generellt för placeholders.
En menyplats betyder inte en färdig funktion. Inga bekräftade döda länkar i
huvudnavigeringen; startsidans mobila menyikon är däremot inte en knapp.

Dashboardmockar är isolerade i `lib/mock-data/dashboard.ts` och tydligt märkta
som exempeldata. Toppbarens årsval kommer från samma mock och påverkar inte
API-filter. Rapportvyer kräver manuella års-UUID:n. Print använder `window.print`
och enstaka Tailwind print-varianter; inget komplett printstylesheet eller
server-PDF-adapter har implementerats. Ingen browser-/mobil-/a11y-körning
genomfördes; iakttagelser om UI-beteende bygger på kodgranskning.

## Utvecklingsdata och driftsläge

Seed skapar demoorganisation, medlem, aktuellt Stockholm-år, tolv perioder,
serie A, två 25-procentskoder och tio sample-konton. Demoanvändaren har
`passwordHash: null` och kan inte logga in med ett demolösenord. Återkörning
återställer användarhash och öppna demo-perioder; seed är inte ofarlig mot
verkliga data. Den spärras vid `NODE_ENV=production`.

CI använder Postgres 16 och kör migrationer, lint, typecheck, unit och
integration, build. Baslinjens push-trigger gällde `main`; FAS 17 ändrar till `master` med fortsatt PR-verifiering.
FAS 17 rättar detta: CI anger en reserverad HTTPS-origin; Turbo web-build har env/hash för API_INTERNAL_URL.
Vercels direkta workspace-build undviker den Turbo-vägen. Se verifiering och
driftsrisker i [GAP_ANALYSIS](GAP_ANALYSIS.md#verifieringsprotokoll).

Ingen liveinspektion av Render/Vercel/Postgres/S3 gjordes. Backup, restore,
produktiva bucketpolicies, retention, monitoring, connection limits och
hemlighetsrotation är inte styrkta av repositoryt. Äldre ADR är ett historiskt
foundationbeslut, inte en beskrivning av dagens schema.
