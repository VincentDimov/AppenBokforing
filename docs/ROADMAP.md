# LedgerApp — roadmap från nuvarande implementation

## Aktuell status efter FAS 21–23 — 2026-10-07

Sammanhängande genomförande utan faspauser: begränsad förlustmedveten SIE,
verifikationsversioner och samtidighetskontroll, säkerhet och restoreverktyg.
Se [CURRENT_STATE](CURRENT_STATE.md) och [releasechecklistan](production-readiness.md).
Nästa P0-arbete: oberoende SIE-verifiering, återstående race-matris, Prisma HIGH,
malformed/polyglot-uploadgräns, fungerande privat S3 och full blob-restore,
verkliga cloud roller/backup/monitorering och kvalificerad redovisningsgranskning.
P0-02/03/10/11/13 är PARTIAL. P1 kan planeras, men full P0 releasegate är inte
stängd och systemet är inte produktionsgodkänt. Inga orelaterade P1-funktioner
har lagts till. Statusavsnitten nedan är bevarad historik.

## Status efter FAS 20 — 2026-10-07

P0-08 COMPLETE inom explicit BASE/TAX-modell, negativa matchande par, fryst
VAT-metadata, anomalier och begränsad versionerad svensk fältmappning.
Golden-facit: utgående 490, ingående 250, netto 240; underlagen redovisas separat.
Historisk klassificering och SIE-metadata gissas inte. Momsadministration,
fler regelversioner och ej stödda skattefall kvarstår; se [scope](vat-reporting.md).
P0-07 allmän kontohistorik och P0-09/10 SIE är inte levererade av denna fas.
FAS 21 har inte påbörjats. Redovisningsgranskning och releasegates gäller fortsatt.
Kontroller PASS: lint/typecheck/build, 132 ordinarie tester, 73 PG-integration,
11 lokala browserfall och 7 safety-kontrakt. Ingen produktionsrelease utförd.

## Status efter FAS 19 — 2026-10-07

**P0-06 COMPLETE inom FAS 19:** validerad IB i GL, gemensamt teckenkontrakt,
RepeatableRead för GL/BS/trial/income, tydlig IB-dimensionspolicy och verklig
saldobalans. Samma Golden-fixtur ger identiska manuellt förväntade avstämningar
i PG/HTTP; 59 integrationstester passerar.
Slutligt: lint/typecheck/build PASS, 109 ordinarie tester och 10 lokala browserfall PASS.
[Kontrakt och exakt facit](accounting-balances.md).
Legacy-acceptansen nedan nämner även SIE; dess återstående snapshots/format/IB
hanteras separat under P0-09/10, inte som ett obestyrkt avslut i denna fas.
P1-05 är delvis levererat (saldobalans + print); särskild verifikationsrapport
och övrig export återstår. P1-03 IB-editor/årsöverföring är inte levererat.

Nästa avgränsade fas i underlaget är FAS 20 momsmodell, men den har inte startats.
P0-07 metadatahistorik, P0-09/10 SIE, P0-11 concurrency/DB samt releasegränser
kvarstår. Att rapporterna balanserar ersätter inte redovisningsgranskning.

## Status efter FAS 18

Playwright-infrastruktur och lokala browser→Next→Nest→PostgreSQL-flöden är
implementerade med separat CI-jobb. Root-kontroller passerar (99 ordinarie,
50 integration). Publik read-only smoke 4 PASS/1 SKIPPED, healthrewrite styrkt.
[Verifiering och begränsningar](e2e-verification.md).

P0-04 har nu browserbevis för osparade synliga belopp, dubbelklick och hotkey;
fleranvändar-versionering är fortsatt PARTIAL. P0-05:s utvalda tenantvyer och
sent rapport-svar har lokala browserbevis; matrisen är inte alla moduler.
P0-12 har browserjobbsdefinition; faktisk Actions-run/rent checkout återstår.
Frontend-orgskapande/serieadministration är inte infört i verifieringsfasen.

Nästa fas bör vara avgränsad **accounting correctness**, först med dokumenterade
manuella facit: IB i huvudbok/balans, rapport-snapshot/metadata och konkurrens
kring journalversionering. Separata därefter beslutade leveranser för momsbaser
och SIE PC8/IB/import/export. P0-fynd får inte stängas för att denna browserfixture
passerar. Härdning av publika HTML-headers, säkert drift-testkonto,
hemlighetsrotation/backup/arkivering och Actions-bevis är releaseblockers.

Baslinje 2026-10-06, commit `0b2f11a`. Detta är en plan, inte redan genomförda
ändringar. Se [CURRENT_STATE](CURRENT_STATE.md) och [GAP_ANALYSIS](GAP_ANALYSIS.md).
Behåll monorepo, Nest/Next-gränsen, Decimal, tenant-FK, journalimmutability och
deferred balansskydd. Ingen omstart av projektet eller ny fas 1–15 föreslås.

Komplexitet: S = avgränsad ändring, M = flera komponenter/testfall,
L = flera lager/migrationer, XL = större domän- och arbetsflödesarbete.
Inga timskattningar. Risk-ID hänvisar till GAP_ANALYSIS.

## Status efter FAS 17 del 1

- **P0-01 PARTIAL:** säker text/attachment/nosniff/UTF-8-transport och testad
  128 KiB-content/1 MiB-JSON-boundary klar. Injektion av SIE-records via
  serializertext och verklig PC8-kodning återstår; ingen SIE4B-certifiering.
- **P0-04 PARTIAL (begärt frontendflöde klart):** current-value PATCH/CREATE före
  POST, sparfelskydd, submitlås, knapp/hotkey och status/org-regressionstester
  passerar. Separat fleranvändar-versionering och browser→DB-E2E återstår.
- **P0-05 COMPLETE inom granskade frontendvyer:** organisationsbundet reset,
  obsolete abort/svarsskydd och mismatch utan writes testat för editor,
  fyra rapporter, konton/verifikationer, kalender/historik och bilagor.
  Backendguards har inte ersatts; live-/browserverifiering återstår.
- **P0-12 PARTIAL:** master+PR, strict web-env/hash, reserverad CI-origin,
  migrationskontrakt/testdatabasspärr och lint/typecheck av integrationfiler
  implementerade. Root lint/typecheck/test/build passerar (99 tester).
  Uppföljningen körde alla elva migrationer från tom isolerad PostgreSQL och
  49 integrationstester i sju sviter med PASS. Audit-triggerns tabell-dispatch
  och nested Prisma-period-input rättades utan försvagade DB-skydd.
  Faktisk GitHub-run, rent checkout och browser→DB-E2E är fortfarande ej styrkta.

Tabellen nedan bevarar ursprunglig leverans/acceptans; denna status avgör vad
som är löst. Baslinjens loose-env-byggdiagnostik är inte längre lösningen:
root build fungerar nu i strict-läge med dokumenterad processenv.

## P0 — accounting/security correctness

Nästa utvecklingsetapp bör vara **Korrekthet och release-säkring**. Beslut om
redovisningsregler ska först få dokumenterade förväntningar och fixtures.

| ID    | Leverans                                      | Komplexitet | Koppling / acceptans                                                                                                                                                                |
| ----- | --------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0-01 | Säker SIE-exporttransport och inputboundary   | M           | S02: text/fil, disposition/nosniff, ingen HTMLtolkning eller nya records via input. HTTP/proxy/negativtester.                                                                       |
| P0-02 | Beroendestabilisering och rådgivningstriage   | M           | S01: uppgradera relevanta transitiva dependencies kompatibelt, ny audit/test. Dokumentera icke nåbara advisories; inga blinda majorbyten.                                           |
| P0-03 | Produktionskonfiguration och sessionspolicy   | L           | S03–S08: rotation av exponerade värden utanför repo, reject-known-placeholder, explicit CSRF/originpolicy, exportpermission och rätt refresh-revokering. Proxy/cookie/rollfixtures. |
| P0-04 | Bokför de värden användaren ser               | M           | A02: spara ändrat utkast före postning eller atomiskt versionerat postkontrakt. UI/E2E även hotkey, dubbelklick och samtidighet.                                                    |
| P0-05 | Organisationsbunden frontendstate             | M           | F01/F02: state/requests/mutations binds till org; orgbyte under pending operation ger inte fel kontext.                                                                             |
| P0-06 | Gemensamt korrekt IB-/rapportkontrakt         | L           | A01/A10/A16: GL inkluderar IB, definierade tecken/snapshots, avstämning GL/BS/SIE mot manuella fixtures, dimensionpolicy för IB.                                                    |
| P0-07 | Stabil historisk konto-/VAT-metadata          | L           | A03: frys/versionera historiskt relevant metadata och begränsa ändringar. Låsta rapporter förblir reproducerbara.                                                                   |
| P0-08 | Momsens data- och beräkningskontrakt          | XL          | A04: skilj underlag/skatt/return-mapping, credits/rättelser/undantag och versionerad svensk konfiguration från motor. Redovisningsreview och realistiska fixtures.                  |
| P0-09 | SIE-confirm utan förlust/counterregression    | L           | A05–A07/A18: IB/objekt/raddatum/#RAR, exakta belopp/verkliga datum, säkert maximum och mappingreview. Unsupported data stoppas eller varnas tydligt före confirm.                   |
| P0-10 | Verifierbar SIE4-export                       | L           | A08/A16: obligatoriska records, UB/RES, dimensioner, bytekodning, snapshot och officiella/sample-filer. Oberoende läsare, inga obestyrkta standardclaims.                           |
| P0-11 | DB-invariants och concurrencykontrakt         | L           | A09/A11/A12/A13: gemensam periodgräns, explicita nullchecks, periodstruktur/stängning, lockorder och retry. Direkt-SQL- och racefixtures.                                           |
| P0-12 | Tillförlitlig CI och körda integrationstester | M           | O01: faktisk huvudgren, env passthrough/cachehash, isolerad Postgres, kontroll även av integrationfiler. Befintliga tester körs; E2E för högriskvägar.                              |
| P0-13 | Least privilege och återställbart underlag    | L           | D01/D02/S10: separera DB-roll, privat bucket/TLS/behörigheter, backup/RPO/RTO och återläs DB+blob isolerat. Bevara audit/ledgerimmutability.                                        |

P0-01–03 är säkerhetspaket, P0-04–11 redovisningspaket och P0-12–13 releasepaket.
Historisk build med loose-env var en diagnostik; FAS 17 har ett strikt env-kontrakt. Ingen produktionsdata i test.

### P0 releasegate

- Kända HIGH-korrekthetsfel har åtgärder och regressionstester.
- Rent checkout med dokumenterad env kör lint/typecheck/test/build och riktig PostgreSQL-integration.
- Tenant-/rollmatris täcker samtliga controllers och ID-byte.
- Posting/import/reversal konkurrerar säkert med lås/stängning; inga halvresultat.
- Huvudbok/balans/resultat/IB/SIE avstämmer mot manuellt definierade fixtures.
- Sårbarhetsbeslut, secrets/bucket/DB-roll och restoreövning dokumenteras.
- Redovisningskunnig granskar domänregler; inget automatiskt compliancepåstående.

## P1 — required for a usable bookkeeping product

| ID    | Leverans                                          | Komplexitet | Acceptans / beroende                                                                                            |
| ----- | ------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------- |
| P1-01 | Ny användare → organisation → år → serie → konton | L           | Onboarding/settings och serie-API/UI; nytt år kan användas utan SQL. P0-kontrakt först.                         |
| P1-02 | Verklig årskontext och rapportfilter              | M           | Ersätt mock, välj riktiga år/perioder/dimensioner; samma context i rapport/editor.                              |
| P1-03 | Öppningsbalans och årsöverföring                  | L           | Editor/import, totalbalanskontroll, lås/audit och carry-forward; ingen overwrite av POSTED.                     |
| P1-04 | Invitationer och medlemsroller                    | L           | Invite/accept/revoke, ownerregler och atomisk audit; revoked-access-/tenanttester.                              |
| P1-05 | Saldobalans och verifikationsrapport              | L           | POSTED+IB där rätt, filter, avstämning, print/export; separat från bookkeeping-listan.                          |
| P1-06 | SIE-jobb och import/export UI                     | L           | Preview hash/user/org, explicit confirm, rollback/idempotens, sourceAttachment/SieImport och säkert filuttag.   |
| P1-07 | Robust session-/requesthantering                  | M           | Central 401-refresh, cross-tabkoordination, logoutfel, nextredirect, abort/latest-result/empty/loading/error.   |
| P1-08 | Organisationsmärkta utskrifter                    | M           | Hide shell/filters, print CSS, datum/år/org/filter i rapport/CSV och formulaskydd för text.                     |
| P1-09 | Observability och belastningsgränser              | L           | Readiness, redacted structured log/request-ID, metrics/errortracking, poolbudget, delad ratelimiter/proxy-ID.   |
| P1-10 | Storage-/migrationsreleasehantering               | L           | Verklig S3-test, orphanreconciliation, checksum/restorepolicy, backfill/upgrade/runbook och säkra releasegates. |
| P1-11 | Paging och rapportprestanda                       | L           | Bounded queries/exports, keyset, deterministisk ordning; EXPLAIN/lasttest före nya index.                       |

P1 gate: ny behörig användare klarar bokföring/rapport utan manuella UUID:n eller
DB-administration. E2E går genom samma proxy/session/storage som driftsättningen.

## P2 — important product functionality

| ID    | Leverans                              | Komplexitet | Acceptans                                                                                 |
| ----- | ------------------------------------- | ----------- | ----------------------------------------------------------------------------------------- |
| P2-01 | Projekt-/kostnadsställeregister       | M           | Tenant-safe CRUD/deactivate, typahead/audit; bevara historik.                             |
| P2-02 | Konteringsmallar                      | L           | API/UI, dimensioner/VAT och utkastförslag; samma postingvalidering.                       |
| P2-03 | Dashboard med verkliga data           | M           | Nyckeltal/senaste vouchers från rapportkontrakt, år/org-bound state.                      |
| P2-04 | Globalt bilagearkiv                   | M           | Filter/page/länkning med lifecycle/retention och signed download.                         |
| P2-05 | Licensierad kontoplansimport          | L           | Adapter + licens/version/audit, preview/map/confirm; ingen otillåten scraping.            |
| P2-06 | Konto-/VAT-administration             | L           | Årsvis applicability vid behov, versionering och tax/base-val. P0-07/08 först.            |
| P2-07 | Mobil, tangentbord och tillgänglighet | M           | Labels/combobox/fokus/dialog, rapportlayout, hotkeys, axe/manual/browser-matris.          |
| P2-08 | Säkerhetslivscykel                    | L           | Password reset/change, email verification, sessionadministration och dataskydd/retention. |

## P3 — enhancements

| ID    | Leverans                                  | Komplexitet | Acceptans                                                                        |
| ----- | ----------------------------------------- | ----------- | -------------------------------------------------------------------------------- |
| P3-01 | Server-PDF via renderer-adapter           | L           | Samma rapportdata, ingen ny beräkning; verifierad pagination/fonts/artifact.     |
| P3-02 | Jämförelser över år och rapportgruppering | L           | Mapping/metadatahistorik, jämförbara perioder och manuella fixturetotaler.       |
| P3-03 | Approvals                                 | L           | Separera skapa/granska/post med explicit rollpolicy och audit.                   |
| P3-04 | Prestanda-/driftförfining                 | L           | Jobbkö för stora utbyten, säkra transaktionsgränser, observability/idempotens.   |
| P3-05 | MFA och externa revisionsuttag            | L           | Hotmodell, återställning, säker export och eventuell tamper-evident extern logg. |

## P4 — future / optional

| ID    | Leverans                                | Komplexitet | Förutsättning                                                                  |
| ----- | --------------------------------------- | ----------- | ------------------------------------------------------------------------------ |
| P4-01 | Bank-/faktura-/leverantörsintegrationer | XL          | Stabil huvudbok, avstämning, rättigheter/licens/avtal och kvalificerad review. |
| P4-02 | OCR och konteringsförslag               | L           | Människa bekräftar; aldrig kringgå posting-/periodregler.                      |
| P4-03 | API-ekosystem/automation                | XL          | Public contract, scopes, quotas, versionspolicy och replay-safe mutations.     |
| P4-04 | Fler jurisdiktioner/valutor             | XL          | Separata regelversioner, kurs-/rapport-/domänregler.                           |

Varje etapp slutar med tester och dokumenterat resultat. Omprioritera endast
med ny riskbedömning; fler vyer ersätter inte P0-korrekthet.
