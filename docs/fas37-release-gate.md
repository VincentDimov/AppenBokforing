# FAS 37 — svensk 37-punktsrapport och releasegate

Datum: 2026-10-09. Endast lokal arbetskopia; ingen commit/push/deployment.
**Exakt status: IMPLEMENTERAD KATALOGARKITEKTUR; FULL BAS 2026 RELEASE BLOCKED.**
Detta ersätter äldre fasrapporter som källa för dagens status. Det är inte COMPLETE.

1. **Källversion:** BAS 2026 v1.1, enligt första sidan i den
   [officiella PDF:n](https://www.bas.se/wp-content/uploads/2026/04/BAS_kontoplan_2026_v2.pdf).
   Filnamnets v2 är inte kontoplanens versionsnummer. PDF + officiell XLSX granskade.
2. **Totalt:** 1285 kontoförekomster i vardera källan; 1282 unika fyrsiffriga nummer.
3. **Gruppkonton:** 45 obegränsade, 0 begränsade. Rubriker är inte konton.
4. **Standardhuvudkonton:** 417 obegränsade huvudkonton; 462 obegränsade nollslutande
   kandidater inklusive gruppkonton. Inga 462 konton har påståtts aktiverade.
5. **Begränsade huvudkonton:** 10. `#` lagras som metadata, inte i numret.
6. **Underkonton:** 810 totalt, varav 794 obegränsade.
7. **K2-begränsade underkonton:** 16.
8. **Extraherat/verifierat:** alla 39 PDF-sidor och samtliga XLSX-rader lästa.
   1285/1285 nummer- och markörförekomster matchar exakt; fem direkta källreferenser
   verifierade. Full namn-/multiline-/ekonomisk granskning är inte färdig.
   Dubbla nummer 2087/2120/2130, varav 2087 har motstridiga namn.
   3211/3212/3231 saknar sifferhärledda huvudkonton. 0 saknade XLSX-namn,
   längsta namn 173 tecken. 0 officiella produktionsposter importerade.
9. **Licens:** NOT_ESTABLISHED för denna SaaS/distribution. Fri nedladdning är inte
   integrations-/distributionsbevis; se [BAS maskinläsbara produkt](https://www.bas.se/kontoplaner/kontoplanen-i-maskinlasbart-format/).
   Full källdata hålls utanför Git/seed/produkt. Operatörens dokumenterade rättigheter krävs.
10. **Migrationer:** ny `20261009010000_bas_catalog`, totalt 25. UUID/FK/RESTRICT,
    checks/triggers/index; Account.name blir TEXT. Inga äldre migrationer skrivs om.
11. **Central katalog:** global immutable BasCatalogVersion + BasAccountCatalog,
    exakt radantal, käll-/manifesthash, granskad hierarki och explicit provenance.
    SELECT-only runtime; importeraren kräver operatorflagga, attestation och godkänd hash.
12. **Automatisk provisioning:** godkänd standardversions bookable, obegränsade
    nollslutande konton skapas i nya företag atomiskt. Restricted/sub optional.
    Utan katalog bevaras tidigare lilla egna startplan; inget låtsat BAS-stöd.
13. **Befintliga företag:** explicit idempotent upgrade, organisation FOR UPDATE;
    befintliga ID/namn/VAT/typ/aktivstatus/historik bevaras. Klassificeringskonflikter
    rapporteras. Befintligt begränsat konto ger kontrollerad 409-avstämning före versionsval.
14. **Valfri aktivering:** individuellt Lägg till → serverpreview → explicit confirm.
    Kompatibelt befintligt konto återaktiveras utan identitetsbyte. Immutable audit.
15. **Bulk:** 1–100 unika UUID, verkliga counts/orsaker, revalidering i atomisk tx;
    inget tyst delresultat, duplicerings- eller tenantbypass.
16. **Avaktivering:** vanlig skyddad PATCH, inga DELETE. Nyval/utkast/mallar spärras,
    historik/IB/rapport bevaras. UI visar konsekvenser; exakt historisk reversal tillåts.
17. **K2/K3:** K2 och NOT_CONFIGURED nekar `#`, även via manuella nummer/SQL/SIE/IB.
    K3 kräver explicit aktivering. OWNER/ADMIN bekräftar regelverk med företagsnamn.
    Berörd historik kräver avstämning, inte omskrivning. K1 är inte implementerat.
18. **Klassificering:** struktur och ekonomi är separata. Explicit ASSET/LIABILITY/
    EQUITY/REVENUE/EXPENSE + DEBIT/CREDIT + bookable per granskad post, aldrig
    generell förstasiffergissning för BAS. 0/1282 ekonomiska produktionsmappningar
    godkända; alla behöver granskning, inklusive klass 2/8 och kontra-/resultatkonton.
19. **Moms:** befintliga företagskopplingar/centrala VAT-regler bevaras. Inga
    automatiska godtyckliga BAS→VAT-associationer eller efterhandsändrade snapshots.
20. **Verifikationseditor:** bounded aktiv/eligible typeahead, 150 ms debounce,
    AbortController, sökning nummer/namn och keyboard. Inga globala valfria konton i raden.
21. **Mallar:** samma server-/DB-eligibility vid referenser och tillämpning; ingen
    förbigång via sparat inaktivt konto. Äldre referenser får inte raderas.
22. **IB:** nonzero-rader kräver giltig bokföringsbar referens; inaktiva historiska
    saldon visas men nya redigeringsfält spärras. Balanser/versionskontroll bevaras.
23. **Årsöverföring:** samma eligibility vid preview/confirm; resultatkonto söks med
    faktisk EQUITY-metadata, inte antagen kontosiffra. Tidigare carry-granskning kvarstår.
24. **SIE:** accountPlan i preview, explicit BAS-aktiveringsack, omkontroll i samma
    kalenderlåsta tx med preview-token/fingerprint. Ej använda valfria konton materialiseras
    inte automatiskt. Export läser företagsdata. Oklar klass 8/type/K2 blockerar import.
25. **Rapporter:** befintliga Decimal-/POSTED-/IB-/snapshotmotorer bevaras. Huvudbok,
    saldobalans, resultat/balans/moms/verifikationsrapport/CSV/SIE regressionskontrolleras;
    global hierarki skapar inga dubbla bokföringsbelopp. Historiskt avaktiverade konton kvar.
26. **UI/UX:** premium FAS 35, fyra flikar, riktiga counts, filtrering/sortering,
    paging, gruppvy med parentmetadata, individuella/bulk-dialoger och typed framework.
    Testade 1440/1024/768/390 px, keyboard och automatisk tillgänglighet. Ingen mock i drift.
27. **API:** GET /accounts/catalog, POST …/activation-preview, …/activate,
    …/provision, …/framework; befintliga GET/POST/PATCH /accounts återanvänds.
    Läsning tenantguard; kontoändringar MANAGE_ACCOUNTS; framework OWNER/ADMIN.
28. **Tenantisolering:** PostgreSQL och browser testar att A:s aktivering inte
    aktiverar B och att gamla A-listor inte kan skriva över B. READ_ONLY/foreign nekas.
29. **Historikregression:** bokförda belopp/referenser/snapshots och exakt reversal
    bevaras. Vanlig lokal 24→25-upgrade jämförde samtliga tidigare rader/kolumner i
    27 tabeller efter backup, identiska. Basimporten muterar inte gamla ekonomiska värden.
30. **Enhetstester:** **302/302 PASS**: API 169 (22 suites), web 109 (26 suites),
    DB 11 och SIE 13. Inkluderar 19 katalogvalidatorfall och 1 versionsdiff-test.
31. **PostgreSQL:** **207/207 PASS**, 23 suites, inklusive 17 nya syntetiska BAS-fall;
    isolerad loopback ledgerapp_test, inte vanlig utvecklings-/cloud-databas.
32. **Playwright:** **45/45 PASS**, senaste fullsviten 3,0 minuter. Fyra
    nya BAS-fall använder riktig Nest/PostgreSQL, originalsyntetisk katalog och browser.
    Automatisk nyföretagsinit, optional/keyboard, K2-servernekande/K3, A/B och historik ingår.
33. **Migration/restore:** fresh 25-migrationsinstallation och lokal 24→25-upgrade PASS.
    DB+blob restore till tom disposable target PASS; hela katalogposter/proveniens jämförda.
    Verklig least-privilege LOGIN: **16 DDL/evidence-denials**, katalog-SELECT/provisioning/
    aktivering och normal bokföring PASS. Restaurerade periodlås/obalans/immutabilitet PASS.
    Backup: `../LedgerApp-Backups/ledgerapp-before-fas37-9713cdb3-1620-44a7-b948-6fa0bbf4dad8.dump`,
    SHA-256 `af6435bce331b399e8d2520105612c5ca82cc08449f821f988fe37bdedf3c5c8`.
34. **Säkerhetsaudit:** föreskriven `node scripts/security-audit.cjs` PASS med 0
    info/low/moderate/high/critical runtimeadvisories. Inga utökade privileges för runtime.
    Verklig importer: 6 synthetic CLI-fall PASS för flaggor/hash/rights/idempotens/immutabilitet.
35. **Produktionsbuild:** **PASS**, slutlig rootbuild 4/4 tasks; Next 67 statiska
    sidor genererade samt dynamiska rutter. Explicit lokal test-API-origin, inga secrets i frontend-build.
    Detta bevisar inte att hosted API-origin/databas är konfigurerade eller deployade.
36. **Kvar:** operatörsrättigheter, full namn-/semantik-/bookable-mappning och
    dubblett-/parentresolution blockerar full BAS-dataset. Godkänd framtida import,
    manuell redovisningsgranskning, remote CI/hostinggrants och tidigare P0 behövs.
    Ingen automatisk företagsversionsövergång eller regulatorisk compliance garanteras.
    Vanlig lokal MinIO nekar skapande av saknad bucket (403 AccessDenied) trots
    matchande servercredentials: lokal bilagelagring/readiness är separat BLOCKED.
37. **Slutstatus:** FAS 37-katalogfunktionerna är implementerade med explicit
    auktoriserad-data-mekanism; **FULL BAS 2026 RELEASE BLOCKED / INTE COMPLETE**.
    Ingen FAS 38 har startats. Ingen full källkontoplan, privileged bootstrap,
    commit/push eller cloud-deployment har utförts.

## Gate och verifieringsgränser

| Slutkontroll, faktiskt exekverad                 | Resultat                                             |
| ------------------------------------------------ | ---------------------------------------------------- |
| pnpm lint                                        | PASS, 6/6 tasks                                      |
| pnpm typecheck                                   | PASS, 9/9 tasks                                      |
| pnpm test                                        | PASS, 302 tester                                     |
| pnpm test:integration                            | PASS, 207 tester / 23 suites                         |
| pnpm test:e2e                                    | PASS, 45 browserfall                                 |
| node scripts/security-audit.cjs                  | PASS, 0 runtimeadvisories                            |
| pnpm build                                       | PASS, 4/4 tasks                                      |
| Fresh installation och 24→25 upgrade             | PASS, gamla 27 tabellers data identiska              |
| DB/blob/katalog restore och actual runtime LOGIN | PASS, 16 nekade privilegierade operationer           |
| Lokal startsida/login/register                   | HTTP 200, browser utan pageerrors                    |
| Lokal /api/auth/me anonymt och /app              | 401 respektive login?next=%2Fapp                     |
| Lokal /health och frontend /api/health           | HTTP 200                                             |
| Lokal /ready                                     | 503: PostgreSQL OK, MinIO bucket saknas/creation 403 |
| Licens/full katalog-/klassificeringsgranskning   | BLOCKED                                              |

Vanlig lokal frontend körs på http://localhost:3000 och API på 127.0.0.1:4000,
med befintlig `.env` oförändrad. Browserflödet för anonym användare är kontrollerat;
inga nya användarkonton skapades i normal lokal databas. Faktiskt register/login/
postningsflöde verifierades i den separata disposable E2E-databasen, inte med ett
antaget lösenord för användarens befintliga konto. API-loggar visade normal startup;
lokala storage-admin- och appcredentials matchade den körande containern utan att
värden loggades. Bucket-initiering nekades; ingen storagevolym/credentials byttes
och inga filer raderades. Den lokala 503-gränsen redovisas, inte som full runtime PASS.

Tidigare försök redovisas: integration-env stoppade ett felkonfigurerat testförsök
före alla tester; första rootbuild saknade den obligatoriska API_INTERNAL_URL.
En äldre browser-selector behövde ändras efter att samma cell fick kategori-text;
exact name/assertion bevarades. Utökade browserfall nådde en verklig read-rate-limit.
Testet reserverar nu ett helt read-TTL, utan höjd limiter/mockade positiva svar eller
retry av bokföringswrites. Ursprungliga 400/403/404/500/network assertions kvarstår.

PDF/XLS-skills styrde read-only källkontrollen; PostgreSQL-skillen styrde explicita
lås, bounded queries och runtimegrants; React-skillen styrde abort/tenantinvalidation,
debounce och keyboard. Verifieringsskillen kräver faktisk flow-evidens och tydlig
gräns mellan syntetiska integrationstester och användarens befintliga lokala konto.
Miljöskillen styrde separationen mellan lokala/test-/hostingvärden: inga cloud-envs
hämtades och befintlig `.env` skrevs inte över.

Se [källrapport](bas-account-validation.md), [modell/import](bas-account-catalog.md),
[flöden/API](bas-account-activation.md) och [integration](bas-2026-integration.md).
