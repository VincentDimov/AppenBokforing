# FAS 30–34 — implementation och lokal releasegate

> Historisk lokal ögonblicksbild. Git-/CI-/FAS 35-statusen nedan är ersatt:
> FAS 30–34 ingår nu i acbba5434321f0d5bfaf68b1a152d46d8e765b7e, med
> verify/browser-e2e/recovery-runtime-gate SUCCESS i GitHub-run 37785265772.
> Se [aktuell FAS 35-rapport](fas35-ui-ux.md). Äldre lokala testbevis behålls.

2026-10-08. Detta är lokal implementation/verifiering, inte en produktion-,
regel-, redovisnings- eller SIE-certifiering. Vid denna historiska ögonblicksbild
hade FAS 35 ännu inte påbörjats; det är inte dagens fasstatus.
Tidigare fasrapporter är historiska och deras testantal/gitstatus är inte dagens.

## 1. Commit och arbetskopia

Bascommit/master: `441567e0379a1703fe48462408eebe16963bdd06` (FAS 29).
FAS 30–34 och den avgränsade säkerhetspatchen är lokala, ocommittade, opushade
och odeployade. Ingen ny remote CI eller cloud-release påstås. Inga användardata,
produktionskonton, cloudmiljövariabler eller produktionshemligheter ändrades.
Testerna använder separata loopback-databaser och privata disponibla bucketar.
Slutstatus: 47 ändrade tracked filer och 43 nya untracked filer på master,
inklusive genererade tracked tsbuildinfo-filer. Ingen ny commit skapades.

## 2. FAS 30

Verklig mallhantering: lista/sök, skapa, redigera, duplicera, aktivera/inaktivera
och kopiera till utkast. Konton, projekt och kostnadsställen valideras i samma
tenant under transaktion/lås. Utkastet använder vanliga save/post/version-API:er.
[Kontrakt](posting-templates.md).

## 3. FAS 31

SIE UI återanvänder befintligt paket/backend: val av bytes/år, skrivfri preview,
varningar/blockerare, explicit signerad bekräftelse, atomär import, resultat och
persistenta jobb. PC8-export laddas ned som bytes, inte avkodad UTF-8-text.
[Kontrakt och begränsad SIE-variant](sie-ui.md), [befintlig SIE-motor](sie.md).

## 4. FAS 32

Organisationsgemensamt arkiv för alla befintliga bilagemetadata, inklusive
dokument utan verifikationskoppling. Serverfilter/keyset-paginering, verkliga
verifikationslänkar och behörighetskontrollerad signering. Ingen publik bucket,
osäker inbäddning, automatisk dubblettradering eller ny inboxmodell.
[Kontrakt](attachment-archive.md).

## 5. FAS 33

Verifikationsrapport med serverbelopp, historiska nya kontosnapshots, befintliga
dimensionssnapshots, bilagemetadata och rättelselänkar. Fem rapporter har ett
gemensamt Decimal-säkert CSV-kontrakt och A4-utskrift/Spara PDF via webbläsaren.
Ingen separat server-PDF-generator påstås. [Kontrakt](report-exports.md).

## 6. FAS 34

Mockdashboard ersatt med riktiga KPI:er, periodval, månadsdiagram, senaste
verifikationer/rättelser och rollstyrda snabbval. Samma inkomst- och momsmotor,
RepeatableRead och PostgreSQL-aggregation; inga demo-/bank-/fakturavärden gissas.
[Kontrakt](dashboard.md).

## 7. Nya framåtriktade migrationer

| Migration                                   | Innehåll                                         |
| ------------------------------------------- | ------------------------------------------------ |
| `20261008100000_posting_template_defaults`  | Standardtext och årsoberoende seriepreferens     |
| `20261008110000_sie_import_history`         | Valfri källbilaga, filnamn, SHA-256, summering   |
| `20261008120000_attachment_archive_indexes` | Tenant/tid/id B-tree och pg_trgm GIN             |
| `20261008130000_voucher_account_snapshots`  | Kontosnapshot/postning/rättelse/legacy-namnskydd |

23 migrationer totalt. Inga äldre migrationer ändrade, inga db-push/reset-gates.

## 8. Databasmodeller

Befintliga PostingTemplate får `defaultText`, `voucherSeriesCode`; befintliga
PostingTemplateLine återanvänder nullable NUMERIC(18,2) och DEBIT/CREDIT.
SieImport får `sourceFileName`, `sourceSha256`, JSONB `summary` och valfri
tenant-säker `sourceAttachmentId` med RESTRICT. JournalLine får nullable JSONB
`accountSnapshot`. Attachment får index, inte ny lagrings-/retentionsmodell.
Ingen dashboardtabell/materialiserat demosaldo. [ER-modell](database.md).

## 9. API

| Endpoint                                                      | Funktion                                                        |
| ------------------------------------------------------------- | --------------------------------------------------------------- |
| GET/POST `/organizations/:id/posting-templates`               | Lista/sök/skapa                                                 |
| GET/PATCH `/organizations/:id/posting-templates/:templateId`  | Läs/uppdatera/inaktivera                                        |
| POST `/organizations/:id/posting-templates/:templateId/apply` | Validera/kopiera mall                                           |
| GET `/organizations/:id/sie/history`                          | Säkra import-/exportjobb, högst 100 vardera                     |
| POST `/imports/sie`                                           | Befintlig preview/confirm, nu även validerat filnamn/historik   |
| GET `/exports/sie`                                            | Befintlig verifierad binär export, oförändrat säkerhetskontrakt |
| GET `/organizations/:id/attachments`                          | Alla tenantbilagor, serverfilter/keyset                         |
| GET `/dashboard`                                              | Sammanhängande period/årssnapshot                               |

Verifikationsrapport/CSV återanvänder journal-/bilage-/rapport-API:erna. Ingen
alternativ postningsmotor eller frontendbokföringsregel introducerad.

## 10. Frontend

Nya kanoniska sidor `/bookkeeping/posting-templates`, `/settings/import-export`,
`/bookkeeping/attachments`, `/reports/voucher/[id]`, med befintlig `/app`-aliaspolicy.
Ny/draft-verifikation får mallväljare; bokförd verifikation får rapportlänk.
`/app` använder riktig dashboard. Huvudbok/saldobalans/resultat/balans/moms får
gemensamma rapportverktyg/CSV/utskrift. Befintliga navigationsval används.

## 11. Behörighet

Inga nya roller. Befintliga medlems-/journalguards och permission helpers är
auktoritativa. Aktiva medlemmar kan läsa; OWNER/ADMIN/ACCOUNTANT kan administrera
och applicera mallar/importera SIE enligt CREATE_BOOKKEEPING. MEMBER/READ_ONLY
kan inte skriva där och får inga dashboard-mutationsknappar. READ_ONLY kan läsa
dashboard/rapporter/arkiv/export. Borttaget/utländskt medlemskap nekas före signering.

## 12. Mallarkitektur

Tenant-säkra fullständiga mallrader, 2–100, fasta Decimal-strängar eller NULL för
användarinmatning. Söklista begränsad till 200. Seriepreferens är kod, inte länk
till ett räkenskapsår. Uppdatering/radersättning/audit är atomär och referenser
låses i stabil ordning. Inaktiva historiska referenser är läsbara och tillåter
inaktivering, men kan inte appliceras/aktiveras för ny bokföring.

## 13. Mall → verifikation

Explicit samtycke krävs innan editorrader ersätts. Kopian kan redigeras och är
oberoende av framtida malländringar. Inga automatiska balanseringskonton/rader.
Normal validering, optimistisk version, periodlås, atomär postning och numrering
gäller fortfarande. Mall som inaktiverats medan den valts ger tydligt fel.

## 14. SIE preview/confirm

ArrayBuffer överförs som base64 för befintlig PC8-motor, högst 128 KiB. Filbyte,
års-/tenantbyte nollställer preview. Granskaren ser konto/IB/verifikation/dimension,
metadata, varningar, unsupported records och blockers; inga konflikter löses tyst.
Bekräftelsecheckbox och in-flight-lås hindrar dubbelklick. Servern återverifierar
actor/tenant/år/bytes/fingerprint/token och importerar i en databastransaktion.
Misslyckande rullar tillbaka både bokföring och nytt jobb. Ingen raw SIE i loggar.

## 15. SIE-download

`application/octet-stream`, fast Content-Disposition attachment, nosniff/no-store
och verkliga PC8/CP437-bytes bevaras genom Next-proxyn till en Blob-download.
JSON-fel sparas inte som lyckad SIE-fil. Oberoende begränsad läsare verifierar
browserfilens bytes/dimensioner/IB/balanser. Full interoperabilitet/certifiering
är inte bevisad. Källfilens bytes lagras inte som ny S3-bilaga; hash/namn sparas.

## 16. Bilagearkiv

Arkivet läser alla befintliga Attachment-kinds, inte bara VOUCHER. Valfri koppling
visas uttryckligt. Kontrollerad attachment-disposition används; ingen automatisk
aktiv PDF/HTML-preview, destruktiv bokföringsändring eller osäker relänkning.
POSTED-bilagor består. Storage keys väljs inte till publikt listresultat.

## 17. Arkivsökning och pagination

Filnamn ILIKE, minst tre tecken, indexerad med pg_trgm. Uppladdningsdatum/MIME/
status/serie/nummer/uppladdare samt `hasVoucher=true/false`. Verifikationsfilter
utesluter okopplade dokument; utan sådana filter syns även dessa. Stabil ordning
createdAt DESC/id DESC, standard 50/max 100 + 1. Tenant/datum/UUID-cursor valideras
och ändrar inte accesspredikat. Cursor är position, aldrig behörighet.

## 18. Verifikationsrapport och historik

Verifikation, organisation, år, datum, text, status, rader och servertotaler,
bilagefilnamn/SHA-256 och länkar original↔rättelse visas. Inga edit/delete-knappar.
Alla nya postningsvägar fryser kontonummer/namn i DB-trigger; rättelser kopierar
originalet. Äldre NULL-snapshots förblir NULL med varning och framtida namnskydd,
inte fabricerad backfill. Företag och samlade rapporters kontorubriker är aktuella;
generell historisk reproducerbarhet P0-07 är fortfarande PARTIAL.

## 19. Exportformat

Huvudbok, saldobalans, resultat-, balans- och momsrapport: CSV och A4-utskrift/
webbläsar-PDF. Verifikationsrapport: A4/utskrift/webbläsar-PDF. SIE: befintligt PC8.
Ingen XLSX, fristående PDF-server eller obegränsad exportjobbkön påstås.

## 20. CSV-säkerhet och precision

UTF-8 BOM, semikolon, CRLF, full citering/quote-escaping. Text med =/+/-/@ även
efter whitespace/kontrolltecken skyddas med apostrof. Numeriska celler valideras
separat och behåller exakta negativa Decimal-strängar (även över 2^53). Ingen
Number/parseFloat-redovisning. Exportmetadata använder senast laddad rapport och
faktiska filter, inte osparad filtertext. Organisation/år/datum/dimension/tid,
momskoder/anomalier/adaptervarningar och jämförelsekolumner ingår.

## 21. Dashboardarkitektur

Ett READ_BOOKKEEPING-anrop i RepeatableRead. Befintlig IB-validering, gemensam
inkomstgruppering, momsengine/svensk adapter återanvänds. Inkomst period/YTD görs
med DB-groupBy och månadsdata med date_trunc/SUM(NUMERIC), inte N+1/kopierad motor.
Moms behöver bounded radnivådata för anomalier; ingen påstådd O(1)-momsberäkning.
Dimensionella dashboardfilter nekas tydligt eftersom moms inte stöder dem här.

## 22. KPI-definitioner

Intäkt = REVENUE kredit−debet; kostnad = EXPENSE debet−kredit; resultat = skillnad.
Endast POSTED, med bokförda motposter/rättelser. Moms in/ut/netto enligt samma
rapport; anomalier/varningar visas. Antal utkast/POSTED avser valt datumintervall.
Golden: intäkt 4500.00, kostnad 2500.00, resultat 2000.00; juni −500.00/0.00/−500.00.
Ingen hårdkodad 1930-bankklassificering eller fiktiva AR/AP-operativa fakturor.

## 23. Diagram

Samma kontotyp/presentationsmotor som resultatrapport. Årets månadsgrupper visar
intäkt/kostnad/resultat, även negativa och nollmånader, tydligt helår oavsett
kortets period. Golden juli kostnad −1500.00, resultat 1500.00. Max 24 månader.
BigInt används endast för stapelgeometri; visade belopp är oförändrade serversträngar.

## 24. Organisationsbyte

Tenant-nycklad montering, AbortController och response keys för år/intervall
rensar gammalt data och ignorerar sena svar. Mall/SIE/arkiv/rapport/dashboard
följer detta. Övergång till nytt tomt företag visar riktiga nollor, aldrig demosiffror.

## 25. Audit

Atomär CREATE/UPDATE på mall, inaktivering som UPDATE/isActive=false. Befintlig
SIE-import/exportaudit behålls med jobbkoppling/säkra metadata. Befintlig upload-
audit återanvänds. Mallapplicering, arkiv- och dashboardläsning skapar inte spam.
Normal runtime har fortsatt ingen audit-update/delete eller DDL-rätt.

## 26. Backup/recoverypåverkan

Komplett DB-drill jämför 22 modeller inklusive PostingTemplate/Line, ett bekräftat
SIE-importjobb med filnamn/hash/summering/länk och alla nya journal-snapshots.
Arkivmetadata och privata objekt/manifest bevaras. Beräknade rapporter/dashboard
behöver inte lagras. Reconciliation är report-only: ingen orphan-radering.

## 27. Index och prestanda

Nya tenant/createdAt DESC/id DESC- och filnamns-GIN-index följer arkivpredikaten.
Återanvänd befintliga template-tenant/active/code-, SIE-historik-, journal-år/status/datum- och
FK-index; inga spekulativa indexmängder. Migrator måste ha trusted pg_trgm.
Huvudbok/moms begränsas till 20 000 rader, konton/IB till 10 000, CSV till 30 000;
gräns+1 upptäcker för stora urval och avbryter, aldrig tyst finansiell trunkering.
Full stora-tenant-EXPLAIN/load/streaming återstår som separat driftarbete.

## 28. Exakta unit-/contractantal

`corepack pnpm@9.15.4 test`: **195 PASS** = API 93 + web 78 + DB 11 + SIE 13.
Separat kompatibilitet/reconciliation/E2E-safety: **10 PASS** = 2 + 1 + 7.
Alltså 205 om de separata kontrakten räknas in; inga dubbelräknade PG/browserfall.
Tidigare ordinarie baseline var 180. Fokusfallen kördes fasvis före nästa fas.

## 29. PostgreSQL-integration

`corepack pnpm@9.15.4 test:integration`: **157 PASS, 21 sviter**, verklig disponibel
PG16 på 127.0.0.1:15443. Tidigare baseline 140. Nya mall/SIE/arkiv/snapshotfall,
Golden dashboard, READ_ONLY, FK/tenant/gränser samt tidigare bokföring/races ingår.

## 30. Playwright

Slutlig full körning: **24 PASS** (Chromium, 35.0 s). Sex nya huvudflöden A–F och
18 tidigare = 24 fall; inga skips eller testexkluderingar.
Filer går genom browser→Next-proxy→Nest→PG/privat S3. Alla fem CSV/printvägar
har nu verklig browserexport med Golden-värden och rätt metadata.
En omkörning gav 23 PASS/1 rate-limit-fel i tidigare serieflöde: HTTP 429 på
överflödiga fiscal-year-laddningar. Testhjälparen navigerar nu direkt, utan att
sänka produktionens limiter. Därefter passerade hela omkörningen med ny API/web-build.

## 31. Säkerhetsaudit

`node scripts/security-audit.cjs`: **PASS**, info/low/moderate/high/critical = 0.
Första slutgaten hittade två nya moderate Next-advisories i 15.5.24. Avgränsad
patch till Next + eslint-plugin 15.5.27/lockfile; inga majorbyten/nya undantag.
[Officiell patchrelease](https://github.com/vercel/next.js/releases/tag/v15.5.27).
Prisma 6/scoped deepmerge-compatibility bibehållen; no-store/Origin/CSRF/auth/S3
runtime- och limiterkontrakt försvagades inte. Audit är daterad lokal evidens.

## 32. Tom databas

**PASS**: samtliga 23 migrationsfiler applicerade på fresh loopback PG-databaser,
inklusive återställningsdrillens tomma källdatabas. Inga tidigare data rensades.

## 33. Representativ uppgradering

**PASS**: riktig äldre 14-migrationsbaseline, 13 representativa modeller (vanliga
posted journalrader/IB/dimensioner inkluderade), sedan 9 framåtmigrationer till 23.
Varje originalkolumn/värde jämförd. Äldre NULL-konto/dim-snapshots förblir NULL;
framtida historisk namnskyddstrigger verifierad. Script: verify-migration-upgrade.cjs.

## 34. Återställning och runtime

**PASS**: pg_dump/pg_restore full-row 22-modellers jämförelse, privat blobrestore,
storlek/SHA-256/signerade bytes och noll korrekt reconciliation. Fyra separata
negativa missing/orphan/checksum/size-fixturer upptäcks report-only.
Slutdrill: `ledgerapp_drill_fas3034b` → `ledgerapp_restore_fas3034b`;
artefakter `C:\Users\Vince\AppData\Local\Temp\ledgerapp-restore-drill-tktD28`.
Första försöket stoppade korrekt på felaktigt fixture-fältnamn; färsk omkörning
passerade efter rättning av assertion, inte av redovisnings-/lagringsgränser.

Verklig nonsuperuser runtime LOGIN: **PASS**, normala auth/IB/carry/post/reverse/
mall/admin/report/dashboardflöden, åtta DDL/audit/migrationsdenials och ytterligare
invitation/carryhistorikskydd. Återställd låst/obalanserad direktpost nekas.
Tre riktiga S3-upload-vs-post/lock/move-races: **PASS**, kompensationscleanup och
foreign/utloggad signering nekas. Redan signerad bearer-URL återkallas inte av
logout: gäller till sin begränsade expiry, ingen omedelbar revokering påstås.
Disponibla data/bucketar/artefakter är inte schemalagda krypterade cloudbackuper.

## 35. Lint/typecheck/build

Lint: **PASS**, 6 tasks. Typecheck: **PASS**, 9 tasks, inklusive de nya
E2E-fallen; ingen strictness-sänkning eller TypeScript-exkludering.
`API_INTERNAL_URL=https://ledgerapp-api.example.invalid; corepack pnpm@9.15.4 build`:
**PASS**, 4 tasks, Next 15.5.27 och 52 genererade sidor; API/db/SIE ingår.
Bygget kräver ingen nåbar API-host och har utförts separat från E2E-builden.
Prisma validate ingår i DB-test. git diff --check körs efter sista dokumentändringen.
Slutlig whitespace-kontroll: **PASS**. Inga testfall/strictness-/auditgränser exkluderade.

Utförda rootgates: `lint`, `typecheck`, `test`, `test:integration`, `test:e2e`,
`build` med pnpm 9.15.4; `security-audit.cjs`; Node-test för Prisma-config,
storage-reconciliation och E2E-safety; migrate deploy på fresh PG och verklig
äldre schema-upgrade; full restore-drill samt runtime-login/restored-guards/
storage-races. Ingen PASS-markering för ny remote CI eller cloud-verifiering.

## 36. Upptäckta fel och rättelser

- UTF-8 svenska multipartfilnamn tolkades som Latin-1 av Busboy; strikt reversibel
  utf8-avkodning infördes före befintlig filnamnsvalidering. Inga relaxed MIME-regler.
- Mallinaktivering med gamla inaktiva dimensioner behövde läsa historiska register;
  läs alla men erbjud enbart aktiva för nytt val, validera på servern.
- SIE-auditmock behövde riktiga PROCESSING/COMPLETED-jobb; auditassertion kvarstår.
- Restorefixture använde fel nytt fieldName; korrigerat till sourceFileName/hash.
- Teststorm gav legitim 429; redundant dashboardnavigation borttagen, limiter kvar.
- Arkiv första implementation uteslöt okopplade dokument; alla kinds/kopplingsfilter
  och eget PG-test tillagda utan ändring av upload/retention.
- Två nya Next-advisories patchades till 15.5.27, inga audit-undantag.
- CSV/printtest täcker nu alla fem verkliga rapporter, inte bara saldobalans.

## 37–41. Fasstatus

| Punkt | Fas | Status   | Avgränsning                                                                   |
| ----- | --- | -------- | ----------------------------------------------------------------------------- |
| 37    | 30  | COMPLETE | Fast/valfri-inmatningsmall, inga procent-/balanseringsregler                  |
| 38    | 31  | COMPLETE | Befintlig dokumenterad SIE-subset, ingen full certifiering                    |
| 39    | 32  | COMPLETE | Alla befintliga bilagor, inget nytt inbox/upload-livscykelssystem             |
| 40    | 33  | COMPLETE | Voucher/CSV/A4; generell äldre presentation P0-07 fortfarande PARTIAL         |
| 41    | 34  | COMPLETE | Auktoritativa tillgängliga KPI:er; bank/invoice metrics avsiktligt utelämnade |

COMPLETE avser fasens kontrakt/backendlås/behörighet/integration och lokala gates,
inte generell produktionsrelease. De öppna P0-gränserna nedan består.

## 42. Återstående P0-blockerare

P0-03: tidigare exponerade hemligheters rotation måste operatören bekräfta;
deployerad auth/logg/proxy/shared limiter samt malware/quarantine/driftkontroller.
P0-07: verklig äldre konto-/företags-/aggregatpresentation och versionshistorik;
nya snapshots fyller inte igen tidigare okänd historik.
P0-10: full officiell SIE-interoperabilitet/extern redovisningsvalidering.
P0-11: återstående bredare close/import/retry/transient-race-matris; redan verifierade
races/cross-org-numrering förklaras inte felaktigt oprövade.
P0-12: review/commit/push och samtliga nya remote CI-gates/patchad deployment.
P0-13: verkliga cloudgrants, begränsad SIE/upload-runtime, TLS/SSE/KMS,
schemalagd krypterad backup/retention/RPO-RTO/alerts och kvalificerad legal/redovisningsgranskning.

## 43. P1/P2-luckor

Verklig inbjudningsmail/outbox/verifierad e-post, vänliga gemensamma rapportårsväljare,
dimensionell IB, full årsstängning, licensierad BAS-import, större streamingexport,
ytterligare SIE-varianter/komplett momsadministration och premium-UX.
Inget skyms med fake feature flags, demoresultat eller falska mail-/compliance-svar.

## 44. Nästa fas

FAS 35 premium UI/UX som separat senare uppdrag, **inte påbörjad**.
Review/remote CI och P0-operatörsgates måste hanteras före en produktionsrelease.
Ingen automatisk push/deployment eller fortsatt fas efter FAS 34 utförs här.

Fyra identifierade disponibla testcontainrar stoppades efter sista kontrollen,
inte borttagna. Databaser/bucketar/backupfiler finns kvar för granskning.
Användarens PostgreSQL på 5433 och MinIO på 9000/9001 lämnades igång/orörda.
Verifierings-, React- och PostgreSQL-granskningen styrde tenant-nycklad UI-state,
säker CSV/bytehantering, verklig browser→API→DB/S3-verifiering och begränsade frågor.
