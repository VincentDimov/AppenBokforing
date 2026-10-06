# LedgerApp — GAP-analys

Datum: 2026-10-06. Granskad kod: `0b2f11a` på `master`.
Omfattning: båda apparna, alla fem paket, schema, tio migrationer, seed,
controllers/guards/DTO:er, centrala tjänster, större frontendkomponenter,
testrutter/fixtures, CI, Compose, miljöexempel, manifest och låsfil.
Källkoden väger tyngre än äldre dokumentation. Analys och dokumentation endast.

## Bedömningsmodell

- CRITICAL: styrkt allvarlig kompromettering eller omfattande oåterkallelig förlust. Ingen sådan attack har verifierats i denna granskning.
- HIGH: felaktig bokföring, betydande säkerhets-/databevaranderisk eller blockerande releasegap.
- MEDIUM: begränsad/exponeringsberoende risk, robusthets- eller försvar-på-djupet-gap.
- LOW: mindre UX-/underhållsproblem.

**Bekräftat** betyder direkt kodbevis eller angiven lokal diagnostik.
**Risk** betyder möjlig följd som inte reproducerats i hela systemet.
**Ej verifierat** betyder att extern miljö eller ytterligare test behövs.
Sårbarhetsdatabasens severity är inte automatiskt samma sak som exploaterbarhet
i denna applikation. Ingen live-penetrationstestning, browseraudit eller
granskning av cloudkonton genomfördes. Detta är inte ett uttömmande säkerhetsintyg.

## Bokföringsrisker

| ID  | Severity / prioritet | Fynd och konsekvens                                                                                                                                                                                                                                                                                | Kodbevis / verifiering                                                                                                                                                                                                                                                       |
| --- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A01 | HIGH / P0            | Huvudboken utelämnar OpeningBalance. Ingående saldo är endast tidigare POSTED-rader inom året; UB kan skilja sig från balansräkning och SIE-export.                                                                                                                                                | [ReportsService.generalLedger](../apps/api/src/reports/reports.service.ts), `byAccount` initieras med noll; ingen IB-query.                                                                                                                                                  |
| A02 | HIGH / P0            | Befintligt utkast bokförs utan att skärmens ändringar sparas. Knappen validerar nya lokala belopp men `entry ?? persistDraft(false)` väljer den gamla sparade posten. Gammal balanserad kontering kan därför bokföras trots att användaren ser en annan.                                           | [VoucherEditor.handlePost](../apps/web/components/journal-entries/voucher-editor.tsx). Bekräftad kontrollflödesbrist; ingen UI-regressionstest.                                                                                                                              |
| A03 | HIGH / P0            | Kontoidentifierare, typ och normalbalans kan ändras trots historiska/låsta transaktioner. Rapporter läser dagens metadata; omklassificering ändrar historiska grupper/resultat utan journalradsändring.                                                                                            | [AccountsService.update](../apps/api/src/accounts/accounts.service.ts), [ReportsService](../apps/api/src/reports/reports.service.ts). Audit av kontoändring ersätter inte stabil rapporthistorik.                                                                            |
| A04 | HIGH / P0            | Momsrapporten summerar hela nettobeloppet på alla VAT-taggade rader, inte en tydligt definierad tax/base-klassificering. Seed kopplar OUTPUT-koden till både 3001 och 2611: vid 1 000 försäljning + 250 moms med koder på båda räknas 1 250 som utgående moms; utan radkod räknas raden inte alls. | [VAT-motor](../apps/api/src/vat/vat-reporting-engine.ts), [seed](../packages/db/prisma/seed.mjs), journalens `prepareDraftInput`. Ingen automatisk kopiering av kontokod eller rate/base-kontroll.                                                                           |
| A05 | HIGH / P0            | Bekräftad SIE-import sparar konton/verifikationer men inte parsade IB, objektfördelning eller transaktionsraddatum. Orginfo kontrolleras inte mot målorganisation; användaren kan välja legitim men fel organisation.                                                                              | [SieService.import](../apps/api/src/sie/sie.service.ts): map skapar bara konto, beskrivning och belopp. `openingBalances` används inte.                                                                                                                                      |
| A06 | HIGH / P0            | SIE-import sätter counter till varje imports nummer + 1. Osorterat innehåll eller äldre nummer kan sänka counter. Unique stoppar dublett, men efterföljande manuell postning kan fastna på redan använt nummer.                                                                                    | `voucherSeries.upsert.update.nextVoucherNumber.set` i SieService. Exempel: A10 följt av A2 ger counter 3; tidigare befintlig A3 blockerar nästa postning.                                                                                                                    |
| A07 | HIGH / P0            | SIE-preview använder Number och tolerans 0.005, inte exakt Decimal. Beloppsprecision/range, verkligt kalenderdatum och mandatory records valideras otillräckligt. Sista #RAR vinner oavsett årsindex.                                                                                              | [parseSie4](../packages/sie/src/index.ts). Lokal körning: #RAR 0=2026 följt av -1=2025 gav 2025; 20260230 gav `2026-02-30` med `errors: []`. SQL-belopp skyddar commitbalans men inte korrekt preview/datumtolkning.                                                         |
| A08 | HIGH / P0            | Export saknar #GEN, använder #UB även för resultatkonton i stället för #RES, deklarerar PC8 utan bytekodning och använder dimension 7 för kostnadsställen. Nummer 1 är cost centre; 6 är project enligt 4B.                                                                                        | [exportSie4](../packages/sie/src/index.ts), SieService.export. Se officiell specifikation nedan. Därför inte verifierad SIE4B-konformitet.                                                                                                                                   |
| A09 | HIGH / P0            | Service tillåter 24 månadsperioder men DB-check tillåter endast 1–13. År med fler perioder misslyckas vid persistens; dokumentationen lovar mer än DB tillåter.                                                                                                                                    | [monthlyPeriods](../apps/api/src/fiscal-years/fiscal-years.service.ts), core-migration `accounting_periods_number_check`. Stödgräns måste beslutas tillsammans med redovisningskunnig.                                                                                       |
| A10 | HIGH / P1            | Inget normalt flöde för balanserade IB, årsöverföring eller saldobalans. Årsstängning kontrollerar lås/utkast men inte ett fullständigt bokslut, IB-balans eller carry-forward.                                                                                                                    | [FiscalYearsService.close](../apps/api/src/fiscal-years/fiscal-years.service.ts), OpeningBalance-schema; inga IB-/trial-balance controllers.                                                                                                                                 |
| A11 | MEDIUM / P0          | Journalens SQL-statuscheck använder `voucher_number > 0` utan `IS NOT NULL`. Med null kan CHECK bli UNKNOWN och passera; DB-regeln ensam garanterar inte nummer för POSTED. Normal API-postning sätter nummer.                                                                                     | Core-migration `journal_entries_voucher_status_check`. [PostgreSQL CHECK-semantik](https://www.postgresql.org/docs/current/ddl-constraints.html). Kräver direkt-SQL-test.                                                                                                    |
| A12 | MEDIUM / P0          | Periodstruktur saknar DB-exclusion/årsomslutning. Period-delete och INSERT av redan CLOSED år omfattas inte av alla updatebaserade stängningsskydd. API:t erbjuder inte dessa bypassoperationer.                                                                                                   | Core- och calendar-locking-migrationerna. Defense-in-depth mot administrativa/framtida skrivvägar, inte bevisad vanlig API-bypass.                                                                                                                                           |
| A13 | MEDIUM / P1          | Olika låsordning: draft update tar år före journal; posting/reversal tar journal före år. Triggerlåsta perioduppdateringar kan ge omvänd ordning. Raw SQLSTATE 40P01 täcks inte av samma retry som 40001/P2034.                                                                                    | [JournalEntriesService](../apps/api/src/journal-entries/journal-entries.service.ts), [calendar helper](../apps/api/src/fiscal-years/accounting-calendar.ts), calendar SQL. Deadlock kan rulla tillbaka korrekt men visas som fel; ingen balanserad post får anses lyckad då. |
| A14 | MEDIUM / P1          | Hela året låses exklusivt för accounting-writes, vilket serialiserar även olika serier/perioder. Reports/SIE laddar stora mängder rader; SIE-confirm saknar avsiktliga chunk/volymgränser och transaktionsbudget.                                                                                  | requireOpenCalendar/SQL `FOR UPDATE`, findMany, standard interactive transaction. Genomströmning ej mätt.                                                                                                                                                                    |
| A15 | MEDIUM / P1          | Listor saknar paging/år/datumfilter; huvudbok sorterar datum/nummer/rad utan serie- eller entry-tiebreak. Kontointervall är lexikografiska trots varierande sifferlängd.                                                                                                                           | Journal list DTO/service; GeneralLedgerQueryDto/ReportsService. Ingen precisionförlust, men oförutsägbar ordning/urval kan försvåra avstämning.                                                                                                                              |
| A16 | MEDIUM / P0          | Export/balansrapport hämtar flera delar med separata queries utan en gemensam snapshot. Samtidig postning eller metadataändring kan skapa inbördes inkonsekvent underlag.                                                                                                                          | Promise.all i ReportsService.balanceSheet/SieService.export. Risk, inte reproducerad snapshotrace.                                                                                                                                                                           |
| A17 | MEDIUM / P1          | SIE-confirm kan skickas som första request; preview är default, inte obligatorisk tidigare granskningshändelse. Ingen preview-ID/hash, idempotens eller persistens av SieImport/sourceAttachment/journalens sieImportId.                                                                           | SieController/Service och schema. Audit-IMPORT pekar på ett slump-ID utan motsvarande jobbrad; originalfil saknas.                                                                                                                                                           |
| A18 | MEDIUM / P1          | Importtyp härleds grovt från första siffran: alla 2-konton blir EQUITY, övriga efter 3 blir EXPENSE. Befintliga inaktiva konton kan användas utan den manuella postingvägens aktiva-kontokontroll.                                                                                                 | SieService inferAccountType/normalBalance och account-ID-map. Typgranskning och mapping måste föregå confirm.                                                                                                                                                                |

### Skydd som faktiskt finns

Manuell postning validerar Decimal-strängar, minst två giltiga rader, exakta
summor, aktiva tenantreferenser och verkligt datum i året/perioden. SQL
kontrollerar radbelopp, commitbalans och journalimmutability; inga journal-DELETE
endpoints finns. Tenant-komposit-FK och voucher-unique är verkliga DB-skydd.
Corrections är atomiska motposter med länkar och exakt inverse-trigger; original
och motpost ingår båda i POSTED-rapportering. Lås kontrolleras även på direkta
entry/line/IB/attachment-writes. Dessa styrkor ska bevaras, inte byggas om.

Generella tecken: huvudbok debet minus kredit; intäkter kredit minus debet,
kostnader debet minus kredit; balans tillgångar debetpositiva, EK/skulder
kreditpositiva samt syntetiskt årets resultat. Ingen allmän teckeninversion
identifierades i dessa motorer. Begränsningarna är A01/A03/A04 och importmapping.
VAT credit-notes/rättelser flaggas som unexpected enbart för motsatt sida och
EXEMPT-belopp flaggas generellt; detta är inte en tillräcklig avvikelsepolicy.

Specifikationskontroll: [SIE-Gruppens 4B-specifikation](https://sie.se/wp-content/uploads/2020/05/SIE_filformat_ver_4B_ENGLISH.pdf)
beskriver obligatoriska poster, PC8/CP437, IB/UB/RES och reserverade dimensioner.
Att ignorera RTRANS/BTRANS är uttryckligen tillåtet för en importer som använder
kompletterande TRANS-rader; det är **inte ensamt ett bokföringsfel**. Nuvarande
parser verifierar däremot inte strukturen och kontraktet runt dem. Ingen
SIE-certifiering eller full standardsupport ska påstås.

## Säkerhetsgranskning

| ID  | Severity / prioritet  | Fynd och exponering                                                                                                                                                                                                                | Bevis / gräns                                                                                                                                                                                                                                                                                       |
| --- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S01 | HIGH / P0             | Produktionsgrafen innehåller 12 advisories: 7 high, 4 moderate, 1 low, 0 critical. Multer 2.2.0 har DoS-advisories som är relevanta för multipart-boundary.                                                                        | `pnpm audit --prod --json` med nätåtkomst, 2026-10-06; tabell nedan. Auth/resourceguard körs före upload-interceptor, så applikationens attackväg kräver auktoriserad uppladdare. Ingen attack kördes.                                                                                              |
| S02 | HIGH / P0             | SIE GET-export returnerar obearbetad string som HTML. Konto-/organisationstext kan innehålla HTML och radbrytningar; textgeneratorn varken HTML-säkrar eller stoppar nya SIE-poster.                                               | Lokal verklig SieController med mockad tjänst/guard: 200, `text/html; charset=utf-8`, `<script>` bevarat. Testet isolerade transporten, inte auth. HTML-/SIE-injektion är bekräftad boundarybrist; full XSS ej verifierad. API-Helmet/CSP kan begränsa script; proxy-/browserbeteende måste testas. |
| S03 | MEDIUM / P0           | Ingen explicit CSRF-token, origin- eller Fetch-Metadata-kontroll. SameSite=Lax och JSON/validering minskar många angrepp; CORS är inte en fullständig CSRF-policy. GET SIE-export skriver job/audit och kan triggas av navigation. | [HTTP setup](../apps/api/src/http/app-setup.ts), cookieSettings, SieService.export. Ingen styrkt cross-tenant CSRF-attack; kräv full proxy/cookie-testmatris.                                                                                                                                       |
| S04 | MEDIUM / P0           | SIE-export kräver READ_BOOKKEEPING, trots separat EXPORT_BOOKKEEPING-helper. MEMBER/READ_ONLY får därför exportera.                                                                                                                | [SieController](../apps/api/src/sie/sie.controller.ts), [permission helpers](../apps/api/src/organizations/organization-permissions.ts). Bekräftad policyavvikelse, inte outsider-IDOR.                                                                                                             |
| S05 | MEDIUM / P0           | Familjerevokering sker för ROTATED-session eller fel hash innan presentatören styrkt rätt refreshhemlighet. Kännedom om giltigt sessions-UUID kan orsaka session-DoS.                                                              | [AuthService.refresh](../apps/api/src/auth/auth.service.ts). UUID är privat/högentropiskt; okänd användare kan inte därmed logga in.                                                                                                                                                                |
| S06 | MEDIUM / P1           | Rotationsrace mellan legitima flikar kan revokera familjen; endast inom-flik promise-dedup finns. Generella API-helper/report-fetch saknar 401-refresh. Logout rensar klientstate även när logoutresponse är fel.                  | [AuthProvider](../apps/web/components/auth/auth-provider.tsx), lib/api. Risk för utloggning och skenbar logout med kvarvarande servercookie.                                                                                                                                                        |
| S07 | MEDIUM / P1           | Ratelimiter är processlokal, utan delad adapter eller explicit trust-proxystrategi. Proxy-IP kan dela kvot eller ge fel identitet; flera replicas delar inte begränsningar.                                                        | AppModule, HTTP setup. Verifiera hostens proxykedja; aktivera inte obegränsad proxy-tillit.                                                                                                                                                                                                         |
| S08 | HIGH villkorligt / P0 | Authsettings accepterar kända exempelhemligheter om de är minst 32 tecken. Tidigare delade skärmbilder innehöll hemligheter; rotationsstatus kan inte styrkas.                                                                     | AuthSettingsService + .env.example. Inga verkliga hemligheter återges. Om samma värden används publikt krävs rotation före fortsatt användning; ingen aktuell cloudcredential kontrollerades.                                                                                                       |
| S09 | MEDIUM / P1           | Magic-byte-validering är grund, inte full filparser/AV. PDF aktivt innehåll/polyglot upptäcks inte generellt. Buffered 10 MiB-uppladdningar och Argon2-belastning behöver samtidighetsgränser.                                     | [file validation](../apps/api/src/attachments/attachment-file-validation.ts), controller/settings. Ingen server-RCE påvisad.                                                                                                                                                                        |
| S10 | HIGH driftrisk / P0   | Privat bucket, block-public-access, minsta S3-behörigheter, TLS/kryptering, backup/versionering/retention säkerställs inte i adapter/config.                                                                                       | [S3-adapter](../apps/api/src/attachments/s3-object-storage.service.ts). Signed URLs är beareråtkomst tills TTL går ut, även efter medlemsrevokering. Verklig bucketpolicy ej inspekterad.                                                                                                           |
| S11 | MEDIUM / P1           | PUT till S3 sker före DB-commit; cleanupfailure ignoreras och ingen orphan-/missing-object-reconciliation finns. SHA-256 lagras men normal download verifierar inte bytes.                                                         | [AttachmentsService](../apps/api/src/attachments/attachments.service.ts). Krasch/fel kan lämna blob utan metadata eller metadata utan återställbart blob.                                                                                                                                           |
| S12 | MEDIUM / P1           | CSV quote-escaping stoppar inte kalkylbladsformler från konto-/radtext som börjar med =,+,-,@.                                                                                                                                     | GL/balance/VAT-komponenternas exportCsv. Kalkylbladsbeteende måste testas; skilj textfält från legitima negativa numeriska belopp.                                                                                                                                                                  |
| S13 | MEDIUM / P1           | Inaktiv organization filtreras från listan men medlemsguards kräver inte organization.isActive.                                                                                                                                    | Orgservice list och access/membershipguards. Policy för avstängda tenant måste beslutas; ingen cross-tenant läcka bevisad.                                                                                                                                                                          |
| S14 | MEDIUM / P1           | Ingen samlad auth-säkerhetshistorik, sessionadministration eller loggning av nekade operations. Request-ID tas ofta från klientheader eller genereras per händelse, inte konsekvent middlewaretrace.                               | Authservice/main/audit writers. Bokföringsaudit finns; operational/security audit är separat gap.                                                                                                                                                                                                   |
| S15 | LOW / P2              | Publik Swagger i produktion; register409 ger email-existenssignal.                                                                                                                                                                 | main/registerservice. Dokumentation är inte i sig en authbypass; exponering ska vara ett avsiktligt beslut.                                                                                                                                                                                         |

### Tenant-, SQL- och inputkontroller

Ingen endpoint identifierades där en icke-medlem kan läsa en annan organisations
data bara genom att byta ID. Org-, account-, voucher- och attachmentguards
löser membership, returnerar 404 till outsider och tjänster scopar reads till
organisation. Rapport/SIE/kalender/historik använder organisationsguard.
DTO whitelist/forbidNonWhitelisted begränsar mass assignment. Raw SQL använder
Prisma parameteriserade tagged templates, inte dynamisk interpolation av input.
RLS saknas men är inte ett krav för att befintliga medlemsguards ska fungera.
FK skyddar referenser; de skyddar inte obehöriga SELECT eller privilegierad SQL.

Cookies har httpOnly, Secure i produktion, SameSite=Lax, path / och __Host-namn.
AccessJWT kontrollerar issuer/audience/type, giltig DB-session och aktiv användare.
Argon2id har miniminivå i produktion; tokens lagras inte i localStorage.
Detta är goda grundskydd, men inte bevis för att Vercel/Render-proxyflödet,
revokering eller ratelimiter fungerar säkert i livekonfiguration.

`.env` och `.vercel` är ignorerade och inte versionsspårade vid granskningen.
Ingen full git-history-/molnsecret-scan genomfördes. Exempelcredentials i Compose
är endast lokala. Skydd mot att oavsiktligt använda dem produktivt saknas.

### Beroendekontroll — exakta advisories

Auditens initiala sandboxkörning misslyckades med nät-EACCES; läsande omkörning
med godkänd nätåtkomst lyckades och gav exit 1 på grund av advisories. Inga
beroenden uppdaterades. Registrykontrollen rapporterade 351 produktionsberoenden.

| Paket, installerad version | Severity | Advisory            | Auditens patched range |
| -------------------------- | -------- | ------------------- | ---------------------- |
| effect 3.16.12             | high     | GHSA-38f7-945m-qr2g | >=3.20.0               |
| postcss 8.4.31             | moderate | GHSA-qx2v-qp2m-jg93 | >=8.5.10               |
| postcss 8.4.31             | high     | GHSA-6g55-p6wh-862q | >=8.5.12               |
| postcss 8.4.31             | moderate | GHSA-fxqj-rqcc-2cmp | >=8.5.23               |
| postcss 8.4.31             | high     | GHSA-r28c-9q8g-f849 | >=8.5.18               |
| deepmerge-ts 7.1.5         | high     | GHSA-ggr8-5vv4-36mx | >=8.0.0                |
| multer 2.2.0               | high     | GHSA-wc9g-mqfw-jrwm | >=2.3.0                |
| multer 2.2.0               | high     | GHSA-qfvm-cv95-jqjf | >=2.3.0                |
| multer 2.2.0               | low      | GHSA-qvfw-j98x-7q72 | >=2.3.0                |
| multer 2.2.0               | high     | GHSA-535w-7cp7-47q4 | >=2.3.0                |
| multer 2.2.0               | moderate | GHSA-3pph-fpjx-jg34 | >=2.4.0                |
| js-yaml 5.3.0              | moderate | GHSA-r3ph-w7gj-g6xm | >=5.4.1                |

Upstream-källor: [Multer DoS](https://github.com/expressjs/multer/security/advisories/GHSA-wc9g-mqfw-jrwm),
[PostCSS source-map disclosure](https://github.com/postcss/postcss/security/advisories/GHSA-6g55-p6wh-862q).
Övriga identifierare kan slås upp som `https://github.com/advisories/{ID}`.
PostCSS kommer via Next och Prisma-konfiguration drar in Effect/deepmerge-ts;
det betyder inte automatiskt att en publik endpoint accepterar angriparstyrd
CSS/Effect-RPC/YAML. Memory storage gör Multers disk-write-advisory mindre
direkt relevant, men fältnamns-/abortbrister måste behandlas. Uppgradering kräver
kompatibilitetstester; blind majoruppgradering av Prisma är inte en analysåtgärd.

## Databasgranskning och arbetslast

Styrkor: UUID, explicit deletion policy, organization-scoped unique/composites,
NUMERIC, balans/immutability/correction/calendar-triggers, audit UPDATE/DELETE
spärr. CASCADE begränsas till disponibla sessioner och konfigurationsmallrader.
Optional actor SET NULL kan vid fysisk user-delete kollidera med immutability;
ingen normal user-delete API finns. Audit polymorphic entityId har avsiktligt
ingen universell entity-FK. Metadata och aktör kan saknas på äldre/adminskrivna
händelser. Request-ID/metadata fylls på nya auditinserts.

| ID  | Severity / prioritet | DB-/operationsgap                                                                                                                                                                                                                        |
| --- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D01 | HIGH / P0            | Ingen separerad migrations-/runtime-roll eller GRANT-policy i repo. Tabellägare kan TRUNCATE/disable triggers; append-only är inte skydd mot privilegierad administratör. Ingen extern tamper-evidence.                                  |
| D02 | HIGH / P0            | Ingen verifierad backup-/restoreprocedur för databas **och** bilagor, RPO/RTO eller återläsningsövning. Cloudbackup kan finnas utanför repo; status okänd.                                                                               |
| D03 | MEDIUM / P1          | Actor SET NULL/immutable history, auditretention, användaranonymisering och medlemsrevokering behöver gemensam livscykelpolicy. Ingen casual DELETE ska införas.                                                                         |
| D04 | MEDIUM / P1          | Ingen dokumenterad connection-limit/poolingbudget per API-replica. PrismaClient återanvänds lokalt, men total produktionsbudget och backpressure saknas.                                                                                 |
| D05 | MEDIUM / P1          | Ingen mätt EXPLAIN/loadtest eller rapportvolymbudget. Föreslagna index nedan är kandidater, inte konstaterat nödvändiga migrationer.                                                                                                     |
| D06 | MEDIUM / P1          | Upgrade/rollbacktest av alla migrationer saknas. Attachmentmigration kräver hash på befintliga filer och avbryter vid saknad hash; backfillplan behövs. pg_trgm/btree_gist kräver hoststöd. `db:push` får inte ersätta migrationskedjan. |

Index som finns: konto tenant/nummer-unique, namn-GIN pg_trgm, memberships
user/org, kalenderdatum/status, journal org/år/status och partiellt POSTED
org/år/datum, journal-line org/account/VAT/project/CC, IB org/år/account,
attachment org/entry/created och org/hash, audit org/date/entity samt actor/date
och requestId. Prisma index-listan visar inte alla specialindex i SQL.

Kandidater att mäta mot verklig arbetslast: audit `(organization_id, action,
created_at, id)` för filter+sort; `(organization_id, actor_user_id, created_at,
id)` för tenant+user; `(organization_id, entity_type, created_at, id)` för
entityfilter (befintligt entity-index börjar efter typen med entityId).
Pröva stable-order journal-index inkluderande serie/id samt case-insensitive
dimensionsfilter bara om queryplan kräver det. Keysetpaging, aggregering och
begränsat select kan ge mer än fler index. Utan DB-körning är inga planvinster styrkta.

## Frontend och produktgap

| ID  | Severity / prioritet | Fynd                                                                                                                                                                                                                                                                                                                         |
| --- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F01 | HIGH / P0            | Orgbyte rensar/binder inte alla rapporter eller befintlig voucher-editor. Rapport från A kan visas/exporteras under B; editor laddas endast på entryId men writeroll/options följer aktiv organisation. Medlem i båda kan därmed utföra legitim API-write mot A när UI visar B. Detta är kontextfel, inte outsider-IDOR.     |
| F02 | MEDIUM / P1          | Accounts/voucher lists kan visa gamla rader medan ny organisation laddas. Kalender och historik har däremot uttrycklig organisationbindning + abortkontroll att återanvända.                                                                                                                                                 |
| F03 | MEDIUM / P1          | Rapporter saknar pending/try-catch för nät/JSON-fel, abort/versionskontroll för races och rensning efter fel. Tomrapport saknar enhetligt empty-state. UUID och dimensionkoder måste skrivas manuellt.                                                                                                                       |
| F04 | MEDIUM / P1          | Årsval i toppbaren är mock utan koppling till rapporter eller verifikationer. Nyregistrerad användare saknar org-onboarding; nytt riktigt år får inga serier/VAT-koder. UI-hänvisningen att skapa organisation saknar verkligt flöde.                                                                                        |
| F05 | MEDIUM / P1          | Print gäller hela skalet; nav/topbar/filter saknar övergripande print-hidden-regler. Enstaka print-klasser är inte komplett printstylesheet. PDF-adapter är beskriven, inte implementerad.                                                                                                                                   |
| F06 | MEDIUM / P2          | Stor konteringstabell scrollar horisontellt, men rapporttabeller har inte motsvarande wrapper. Mobile-nav saknar fokusfälla/Escape/dialogsemantik; startsidans menyikon är inert. Combo saknar aria-activedescendant och vissa tabellfält har bara placeholder, inte tillgängligt namn. Statiska fynd; ingen WCAG-bedömning. |
| F07 | LOW / P2             | Dubbelrutter/legacyredirect är avsiktliga men inte helt enhetliga för placeholders. Generisk placeholdertext antyder att även befintlig bokföring saknas. Public auth ignorerar `next`. Logoutredirect till `/` finns men tävlar potentiellt med skalets anonymous→login-effect; kräver browserregressionstest.              |
| F08 | LOW / P2             | shared/config/ui-paket är små scaffolds, inte gemensamma fullständiga kontrakt. SIE saknar lint-script. Domän-fetch och types dupliceras mellan reportkomponenter utan gemensam fel-/sessionspolicy.                                                                                                                         |

Saknat jämfört med målprodukten: user/invite/rolladministration,
organisation-onboarding/settings, serier, projects/CC-register, mallar,
öppningsbalansflöde, saldobalans, särskild verifikationsrapport, globalt
bilagearkiv, verklig dashboard och import/export UI. Det är en konceptuell
jämförelse mot användarens funktionslista, inte en certifierad jämförelse av
Kapitas aktuella produkt. Ingen proprietär kod/design har hämtats eller kopierats.

## Testkarta och prioriterade luckor

| Område                  | Befintliga tester                                                                  | Viktiga otäckta beteenden                                                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Auth/tenant/permissions | Auth-org/accounts/journal/attachment/audit/kalender integration; permission unit   | Logoutfel, utgången access under arbete, reuse med felhemlighet, cross-tab race, samtliga report/SIE-IDOR/rollmatriser.              |
| Posting/nummer          | Balanced/unbalanced/locked/invalid/cross-org, flera samtidiga posts och reversals  | Importcounter/max-id, lock-vs-post races, 40P01, precisiongränser, versionskonflikt.                                                 |
| Immutable/corrections   | API refusal och DB integration; inverse/link/locked-target/foreign/read-only       | Uppdatering av referenced metadata och låsta rapporters stabilitet, orphan-actor-policy.                                             |
| Rapporter               | 5 fixturetestfall för GL/IS/BS, POSTED och tenant                                  | Faktisk IB i huvudbok, minus/kreditnotor, metadataändring, saknat IB, snapshots, alla filtergränser.                                 |
| Moms                    | En unit-fixture för motorn och fyra anomalies                                      | Verklig försäljning/base+tax, negativa rättelser, EXEMPT-policy, uppdaterad rateversion, HTTP/tenantintegration.                     |
| SIE                     | 2 syntetiska pakettester, 3 service audit-mocktester; låst confirm via integration | Officiella filer, lyckad full import+export i DB, IB/objekt/#RAR, PC8/ÅÄÖ, #RES, newline/HTML, previewbindning, rollback/idempotens. |
| Bilagor                 | 6 integrationsfall och UI-tests                                                    | Verklig MinIO/S3 roundtrip/policy/signed expiry, abort/race, storagefailure/orphans, restore/AV.                                     |
| Kalender/historik       | Unit/HTTP + SQL integration för lås och audit                                      | 14–24 perioder, periodöverlappning/delete/closed-insert, stängningsrace, least-privileged runtime roll.                              |
| DB-kontrakt             | 11 schemavaliderings/textkontrakt                                                  | Reglernas faktiska SQL-exekvering och migrationsupgrade. Textmatchning bevisar inte triggersemantik.                                 |
| Frontend                | 6 sviter, 12 tester                                                                | VoucherEditor posting, organisationbyte, rapportfel, auth/proxy, print/mobile/keyboard. Inga E2E-filer eller runner hittades.        |

Prioriterad saknad testlista:

1. P0: sparat utkast → ändra kontering → bokför, inklusive hotkey/dubbelklick; verifiera synliga belopp mot DB.
2. P0: IB+POSTED fixtures där GL, BS, saldobalans och SIE stämmer av mot manuella förväntningar.
3. P0: periodlåst historik + konto/VAT-metadataändring får inte tyst ändra rapportunderlag.
4. P0: moms med 1 000 underlag + 250 skatt, olika satser, rättelser och undantag; HTTP med foreign tenant.
5. P0: SIE official/synthetic import utan IB-/dimensionsförlust, fler årsindex, felaktigt datum/precision, blandad nummerordning och full rollback.
6. P0: SIE-export säkert content-type/disposition/CSP, HTML/newline/control input, CP437 och externa läsare.
7. P0: post/import/lock/close parallellt, stabila counters, 40001/40P01 samt två användares samtidiga utkast.
8. P0: full auth/tenant/rollmatris via Vercel-proxy, cross-tab refresh, CSRF och riktiga sessioncookies.
9. P0: färsk DB + upgrade av varje migration med direkt-SQL-bypassförsök och separerad runtime-roll.
10. P1: verklig S3-upload/download, återställning av DB+blob, public-block-policy och signing-expiry.
11. P1: report-fetch races/orgbyte/loading/empty/error, valid UUID-val från riktig kalender, print/mobile/a11y.
12. P1: E2E från nyregistrering till org/år/serie/konto/voucher/rapport/export och full logout.

## Verifieringsprotokoll

Kört från repo-roten med Node `22.20.0` via `corepack pnpm@9.15.4`,
2026-10-06. Turbo återanvände en del befintliga DB-/småpaketsresultat; API/web
test- och kontrolltasks kördes. Ingen ny databas, seed eller migration kördes.

| Exakt kommando                                                                                              | Status                                 | Resultat/orsak                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `corepack pnpm@9.15.4 lint`                                                                                 | PASS                                   | 6 tasks; SIE har ingen lint-task. API lint täcker src, inte integrationstestfiler.                                                                                                |
| `corepack pnpm@9.15.4 typecheck`                                                                            | PASS                                   | 9 tasks inkl. dependencies. API tsconfig omfattar src, inte test-directory.                                                                                                       |
| `corepack pnpm@9.15.4 test`                                                                                 | PASS                                   | API 10 sviter/28, web 6/12, DB 11, SIE 2 = 53 tester. DB-textkontrakt hämtades ur Turbo-cache.                                                                                    |
| `corepack pnpm@9.15.4 build`                                                                                | FAIL, exit 1                           | Next config: `API_INTERNAL_URL must be set to the public HTTPS origin of the LedgerApp API in production.`                                                                        |
| `$env:API_INTERNAL_URL='http://localhost:4000'; corepack pnpm@9.15.4 build`                                 | FAIL, exit 1                           | Samma fel: Turbo strict env filtrerar variabeln; env/passThroughEnv saknas.                                                                                                       |
| `$env:API_INTERNAL_URL='http://localhost:4000'; corepack pnpm@9.15.4 exec turbo run build --env-mode=loose` | PASS                                   | 4 buildtasks, webb/API/DB/SIE. Diagnostisk lokal adress, ingen produktionsrelease. Root-script/CI är fortfarande inte rättade.                                                    |
| `corepack pnpm@9.15.4 test:integration`                                                                     | BLOCKED/FAIL, exit 1                   | Alla 7 sviter stoppas i setup: `TEST_DATABASE_URL must point to an isolated PostgreSQL database before integration tests can run.` 0 assertions körda; 47 testfall finns i koden. |
| `docker info --format '{{.ServerVersion}}'`                                                                 | FAIL                                   | Docker config access warning och docker_engine pipe saknas; ingen körande daemon tillgänglig.                                                                                     |
| `corepack pnpm@9.15.4 audit --prod --json`                                                                  | FAIL i sandbox; rapport med nätåtkomst | Initial EACCES mot npm registry. Auktoriserad omkörning exit 1: 12 advisories, se tabell.                                                                                         |

Separata, icke-persistenta Node-diagnostiker: SIE-datum/årsindex reproducerade
A07; en isolerad Nest/Supertest-körning mot riktiga SieController reproducerade
S02. Ett första `node -e`-försök föll på PowerShell-quoting och ersattes med
kod till Node stdin; det var ett diagnostikverktygsfel, inte ett produktfel.
Ingen live-auth, databas, S3 eller browserbeteende hävdas därmed verifierat.

## Produktionsberedskap och redovisningsgranskning

**Bedömning: inte redo att användas som produktionssystem för verklig bokföring.**
Det finns en substantiell, användbar teknisk grund; nya moduler bör inte byggas
ovanpå felaktiga rapport-/import-/editorflöden utan först P0-stabilisering.

| ID  | Severity / prioritet | Produktionstillstånd                                                                                                                                                                                                 |
| --- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O01 | HIGH / P0            | CI push gäller main, granskad gren master. CI-build saknar processenv och Turbo env-kontrakt. Faktisk GitHub-runstatus granskades inte; repo-konfigurationen är otillräcklig.                                        |
| O02 | HIGH / P0            | D02/S10: retention, backup och restore av hela bokföringsunderlaget ej styrkta. Named Docker volumes är persistens, inte backup.                                                                                     |
| O03 | MEDIUM / P1          | /health är endast liveness; DB/storage readiness, timeouts, alerting och syntetiska auth/report-checks saknas.                                                                                                       |
| O04 | MEDIUM / P1          | Nest Logger finns, men strukturerad requestlogging, konsekvent correlation, redaction, metrics och errortracking saknas. Startup catch döljer felorsak förutom generiskt meddelande.                                 |
| O05 | MEDIUM / P1          | Migrationer finns men inga backfill/rollback/zero-downtime/promotion-runbooks. Att migrera under build kan ändra DB även om release misslyckas; releasegate behövs. API använder API_PORT, inte hostens PORT direkt. |
| O06 | MEDIUM / P1          | Compose AIStor-image/tag/licens/startbarhet och mc-healthcheck är inte körverifierade. Endast infra-containers, inga appcontainers. Produktionskostnad/kapacitet/SLA inte bedömda.                                   |
| O07 | MEDIUM / P1          | Next-build kräver en variabel men kontrollerar inte faktisk HTTPS-origin. API:s envvalidering är spridd och S3 är lazily validated; pool-, origin- och timeoutkrav behöver central policy.                           |

Före produktionsbruk krävs kvalificerad svensk redovisningsgranskning av
verifikationer/rättelser, räkenskapsårsregler, låsning/bokslut/IB, rapportgrupper
och momsunderlag/deklarationsfält samt spårbarhet och systemdokumentation.
Separat juridisk/dataskyddsgranskning behövs för arkivering, tillgänglighet,
personuppgifter, behörighetslivscykel, gallring och leverantörsavtal.
Här fastställs inga lagstadgade tidsfrister eller efterlevnadscertifieringar.
Passing tests, SIE-text eller append-only-triggers bevisar inte svensk regeluppfyllelse.

Äldre docs anger bland annat 24 perioder, full SIE4B-export och privat bucket;
kodens begränsningar ovan gäller tills de åtgärdats. Foundation-ADR är historisk.
README och CURRENT_STATE är den uppdaterade ingången, inte en tyst rättning av dessa funktioner.
