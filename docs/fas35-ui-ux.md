# FAS 35 — premium UI/UX och produktpolish

2026-10-08. Lokal implementation ovanpå `acbba5434321f0d5bfaf68b1a152d46d8e765b7e`.
Ingen commit, push, deployment eller ändring av produktionsdata/hemligheter.
Ingen redovisnings-, tillgänglighets-, SIE- eller efterlevnadscertifiering.

## Slutrapport: 43 punkter

1. **Git/commit.** Bascommit är oförändrad på master. FAS 35 är en lokal arbetskopia.
   Användarens redan ändrade `faser.md` har lämnats orörd. Tre genererade
   tsbuildinfo-filer är staged borttagna ur Git-indexet, men finns kvar lokalt;
   `*.tsbuildinfo` ignoreras nu. Ingen annan ändring har stagats för commit.
   Slutstatus (`git status --porcelain=v1 -uall`): 63 modifierade filer inklusive
   användarens `faser.md`, 4 ostagade borttagningar, 3 staged borttagningar från
   index och 12 nya ospårade filer. Alla nya produkt-/dokumentfiler behöver
   inkluderas vid en senare uttryckligen godkänd commit.
2. **Designriktning.** Nordisk operativ arbetsyta: neutrala ytor, tydlig hierarki,
   ink-färgad text och återhållsam teal för huvudåtgärder. Inte glassmorphism,
   gradientbakgrunder eller marknadsföringskort i bokföringsflödena.
3. **Tokens.** Gemensamma background/surface/surface-muted/ink/secondary/muted,
   border/accent/accent-soft/focus och success/warning/danger med mjuka
   statusbakgrunder. 8 px panelradie, 4/8 px spacing, systemfont, tabulära siffror.
   [Detaljer och komponentkontrakt](ui-design-system.md).
4. **Navigation.** Grupperad, kompakt sidebar med ikoner och korrekt aktiv länk
   för både kanoniska routes och /app-aliaser. Ny verifikation och listan är olika
   destinationer. Desktop kan fällas ihop och preferensen sparas lokalt.
5. **App shell.** Företag, räkenskapsår och användarmeny hålls samman i topbar.
   Roll visas på svenska. Skip link och main-landmärke. Utloggning går fortfarande
   till startsidan, inte till login. Sessionsfel har omläsning och väg till startsidan.
6. **Responsivitet.** 1440/1024/768/390 px kontrolleras mot riktig app. Desktopsidebar
   ersätts av modal drawer under 1024 px. Formulär staplas; breda tabeller rullar
   i egen fokuserbar yta. Ingen generell overflow-hidden som gömmer bokföringsdata.
7. **Dashboard.** Verkliga KPI:er, resultat/intäkter/kostnader/moms, månadsdata,
   senaste verifikationer och rollstyrda snabblänkar får tydligare hierarki.
   Utkast räknas inte som bokförda belopp. Golden-fixturens exakta summor bevaras.
8. **Verifikationslista.** Gemensam sidrubrik, sökning, antal, kompakta rader,
   svenska statusmarkeringar och avsiktliga laddnings-/tomlägen.
9. **Verifikationseditor.** Tydlig header, kontering, större beloppsfält,
   separata momsmetadata under disclosure, exakta debet/kredit/differens-summor
   och åtgärdsrad. Bokföring kräver bekräftelse även via Ctrl/Cmd+Enter.
   Ingen mutation vid avbruten bekräftelse. Bilagor ligger efter konteringen.
10. **Detalj/rapport.** Bokförda värden är fortfarande oföränderliga; rättelse
    erbjuds enligt befintliga roller/lås. Original/rättelse länkas tydligt.
    Verifikationsrapporten har gemensam rubrik, status, datum och bokföringstid;
    tekniska ID:n är under detaljer. Kontosnapshots och exakta belopp återanvänds.
11. **Kontoregister.** Fullbreddstabell utan tom editor-kolumn. Editor visas vid
    skapa/redigera och fokuserar första fältet. Sökning, kontotyp, moms och
    aktivstatus finns kvar. Behörighetskontrollerna är oförändrade.
12. **Projekt/kostnadsställen.** Delade rubriker, formulärrytm, egna tabellramar
    och tom-/laddningslägen. Inaktiva dimensions historik tas inte bort.
13. **Konteringsmallar.** Tydlig registeryta och editor med synliga dimensionstitlar.
    Mallkopiering är fortfarande vanlig utkastkontering; ingen automatisk
    balanseringsrad eller bokföringsbeslut introduceras.
14. **SIE.** Import/export/historik separeras i neutrala paneler. Preview,
    information, varningar och blockerande fel är tydligt åtskilda. Befintligt
    krav på explicit granskning/bekräftelse och serverns previewToken behålls.
    PC8-bytes och begränsad SIE 4B-omfattning ändras inte.
15. **Bilagearkiv.** Gemensamma filter, tabell, svenska statusar och tomläge.
    Verklig privat nedladdning, keyset-pagination och tenantkontroller behålls.
    Inga publika permanenta länkar eller osäkra filinbäddningar tillkommer.
16. **Ingående balans.** Namngivet år, konsekvent inmatning, exakta summor
    och tydlig bekräftelsetext. Decimal-/balans-/låsreglerna är samma.
17. **Årsöverföring.** Källår, målår och explicit resultatkonto hålls ihop.
    Förhandsgranskningen följs av modal bekräftelse. Befintliga fingerprints,
    stängt källår och skydd mot att skriva över målårets IB bevaras.
18. **År/periodlås.** Konsekvent kalenderform och periodtabell med status i text
    och färg. Lås/stängningsbekräftelser och backendens guards/audit kvarstår.
19. **Medlemmar/inbjudningar.** Svenska rollnamn, ordnad medlemslista och tomläge.
    Rolländring, medlemsborttagning, ägaröverföring och återkallning bekräftas.
    Serverns last-owner/email-binding/soft-removal-regler är fortsatt auktoritativa.
    Acceptflödet fungerar på mobil; verklig mailleverans är inte tillagd.
20. **Företagsinställningar.** Samma rubrik/formkomponenter och tydlig kontext.
    Formatkontroll är inte Bolagsverket-kontroll; identitetens bokföringslås kvarstår.
21. **Rapporter.** Huvudbok, saldobalans, resultat, balans och moms får gemensam
    presentation, namngivna år, synliga filter och egna tabellramar. Projekt/
    kostnadsställe söks på kod/namn, inte genom att skriva UUID. Laddad rapport
    och exportmetadata hålls separata från ännu ej tillämpade filter.
    Verifikationslista under Rapporter återanvänder verklig list-API, inte mockdata;
    dess utkast är uttryckligen märkta, inte redovisade som bokförda.
22. **Auth/onboarding.** Gemensam lugn auth-yta, password visibility, synliga
    etiketter och begriplig rate-limit-text. Onboarding/invitation använder
    samma formspråk. Cookies/sessionrotation och onboarding-idempotency ändras inte.
    Startsidan är återhållsamt polerad; illustrativa exempelbelopp är tydligt märkta.
23. **Laddning.** Delad LoadingState och lokala väntetexter. Rapportknapp visar
    hämtning; org-/requestnycklar och abort skyddar mot sena svar.
24. **Tomläge.** Delad EmptyState i listor/register, med konkret nästa steg;
    SIE-historik och inbjudningar har avsiktliga tomlägen. Inga påhittade transaktioner.
25. **Fel.** Alert/status, sanerade API-fel, explicit återförsök för sessions- och
    rapportläsning och delad årshämtning. HTTP 429 får begriplig väntetext. Nätverksfel skiljs från att sakna inloggning. API-fel skrivs
    inte om till framgång. Befintliga 400/403/404/500-assertions behålls.
26. **Tillgänglighet.** Synlig fokus, riktiga knappar/länkar, en h1, tillgängliga
    typeahead-labels, activedescendant, fokuserbara scrollramar och native dialog.
    Axe kör WCAG 2 A/AA och 2.1 A/AA utan regelfrånkopplingar i de nya testerna.
    Detta är automatiserade kontroller, inte full hjälpmedels-/WCAG-certifiering.
27. **Tangentbord.** Typeahead arrow/Enter/Escape/Tab kvarstår. Enter på sista
    kreditfältet skapar rad. Posting-shortcut öppnar samma bekräftelse.
    Modal Escape, fokuscontainment och fokusåtergång verifieras i riktig Chromium.
28. **Utskrift.** A4, dold navigation/filter/actions, bevarade metadata/belopp,
    upprepade tabellrubriker och skydd mot radbrytning över sida. CSV:s bytes/
    exakta belopp är oförändrade. Spara PDF betyder browserns print-dialog,
    inte en ny serverbaserad PDF-generator.
29. **Prestanda.** FiscalYearProvider delar en årshämtning mellan topbar och
    konsumenter, med tenantnyckel/abort/invalidation. UI-preferenslagring är
    optional och innehåller inte tokens. Dimensioner hämtas vid användning;
    inga dekorativa API-waterfalls eller fontnätverksanrop tillkommer.
    Full build visar 102 kB gemensam First Load JS; det är inte en Lighthouse-
    eller verklig produktion/latensbenchmark. React-skillgranskningen påverkade
    requestdelning, effektstädning och säker preferenslagring.
30. **Beroenden.** Endast `@axe-core/playwright@4.13.0` tillagt som devDependency
    (axe-core transitivt). Ingen ny runtimekomponent-/auth-/diagrambiblioteksmigrering.
    Befintlig shadcn/Radix/Tailwind används. Node 22.20.0, pnpm 9.15.4,
    Next 15.5.27 och Prisma 6.17.1 kvarstår.
31. **Borttaget.** Tre oanvända mockdashboard-komponenter och mock-data/dashboard.ts
    togs bort efter importkontroll. Gamla färger/dekorativa skuggor/blur förenklades.
    Borttagna spårade filer kan återställas från Git; inga användardata raderades.
32. **Ordinarie tester.** 209 PASS: API 93, web 92, DB 11, SIE 13.
    Ytterligare 10 PASS i kompatibilitet/reconciliation/E2E-safety, separat räknade.
    Turbo får återanvända verifierade resultat för oförändrade backendpaket.
33. **PostgreSQL.** 157 PASS, 21 integrationstestsviter, mot isolerad loopbackdatabas.
    Accounting, tenant, samtidighet, lås, bilagor, snapshot, IB/carry och SIE ingår.
34. **Playwright.** 29 PASS: alla 24 befintliga flöden plus 5 nya UI-/responsiva
    tester. Inga skip eller försvagade ekonomiska assertions. Befintliga tests
    selectors följer nya svenska statusar, årsväljare och explicita bekräftelser.
35. **Responsiva resultat.** Fyra viewporttester navigerar alla 20 större
    sidebar-routes plus dashboard, laddar fem verkliga rapporter och kontrollerar
    sidöverspill. Mobil posting-confirm/cancel bevarar 10.01/exakta totalsummor.
    Auth/start/onboarding/invitation/rapport har också riktiga mobilkontroller.
    Desktop och mobil har granskats sida för sida med screenshots; tablet
    kontrolleras automatiskt och har stickprovsgranskats visuellt för kontotabell och kontering.
36. **Audit.** `node scripts/security-audit.cjs`: PASS, 0 info/low/moderate/high/
    critical production-advisories. Detta bevisar inte deployad säkerhet.
37. **Build.** Root `corepack pnpm@9.15.4 build` med
    `API_INTERNAL_URL=https://ledgerapp-api.example.invalid`: PASS, 54 Next-sidor.
    Lint och typecheck PASS. Ingen ny remote FAS 35-CI/deployment påstås.
38. **Recovery/runtime.** Verklig DB+blob restore PASS, 22 modeller
    jämförda, checksum/signed download/immutability/tenant-FK/runtime-DDL guards.
    Actual LOGIN PASS: 8 DDL-denials, ingen migratormembership, legitima
    auth/account/calendar/post/reverse/report/onboarding/member/IB/carry-flöden.
    Restored periodlock/balance guards och tre verkliga storage-races PASS.
    Fresh migration: 23 PASS. Upgrade: tidigare 14 + 9, 13 modellmängder bevarade.
    Samma fas körde dessa mot oförändrad backend; inga migrationsfiler ändrades.
39. **Upptäckt/rättat.** Muted-textkontrast, scrolltabellers fokus, mobilmenyns
    rubrik, grid-min-width för fullt laddad kontotabell, modal/popup-clipping,
    ogenomtänkt momsradshöjd, fältetiketter, teknisk rapportheader och beloppsfältens CSS-specificitet (nu explicit breddassertion i fyra viewporttester).
    Första browserkörningars failures redovisas som failures, inte som gröna;
    slutkörningen PASS. Rate-limit-skyddet lättades inte för att få gröna tester. Den nya route-svepningen reserverar ett verkligt läsfönster enligt API-headers; inga accounting writes återförsöks eller mockas.
40. **Kvarvarande P0.** P0-03 deployed security/operator controls; P0-07 historiska
    legacy-/företagsmetadata; P0-10 extern/full SIE-matris; P0-11 resterande
    samtidighet/retries; P0-13 verklig cloud/KMS/backup/RPO/RTO/operatorbevis.
    UI stänger inte dessa. Äldre signed URL förblir en tidsbegränsad capability
    efter logout; ny signering nekas, men redan signerad URL revokeras inte omedelbart.
41. **Produkt/UX-gränser.** Dark mode medvetet uppskjutet. Mobilens breda
    accountingtabeller rullar horisontellt; det är en desktop-first produkt,
    inte en alternativ full mobilradeditor. Skärmläsar-/enhets-/browsermatris,
    användartest med redovisare, server-PDF, full mailleverans och större
    data/performancebenchmark återstår. Vissa specialistfilter för aktör/uppladdare
    använder fortfarande ID; rapporternas år och dimensioner gör inte det.
42. **Fasstatus.** FAS 35 COMPLETE som lokal UI/UX-implementation och lokal
    releasegate. Inte en produktion-, compliance- eller cloud-releaseförklaring.
43. **Nästa steg.** Produkt-/kodgranskning, nya tre remote CI-gates för arbetskopian
    och separat auktoriserad release. Därefter prioritera kvarvarande P0-
    operatörsbevis och redovisnings-/SIE-granskning. Ingen FAS 36 har startats.

## Reproducerbar lokal kontroll

Kört i denna fas med Node 22.20.0 / pnpm 9.15.4, på separata testresurser.
Ordinarie användar-Compose och produktionsmiljöer ändrades inte.

| Kommando / gate                                                                                                                                               | Resultat                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| corepack pnpm@9.15.4 lint                                                                                                                                     | PASS                                 |
| corepack pnpm@9.15.4 typecheck                                                                                                                                | PASS                                 |
| corepack pnpm@9.15.4 test                                                                                                                                     | 209 PASS                             |
| corepack pnpm@9.15.4 test:integration                                                                                                                         | 157 PASS                             |
| corepack pnpm@9.15.4 test:e2e                                                                                                                                 | 29 PASS                              |
| node scripts/security-audit.cjs                                                                                                                               | 0 advisories / PASS                  |
| node --test tests/prisma-config-compatibility.test.cjs tests/storage-reconciliation.test.cjs scripts/e2e-safety.test.cjs                                      | 10 PASS                              |
| prisma migrate deploy, fresh disposable ledgerapp_drill_fas35                                                                                                 | 23 migrationer PASS                  |
| RUN_DISPOSABLE_RESTORE_DRILL=yes UPGRADE_TEST_DATABASE=ledgerapp_upgrade_fas35 node scripts/verify-migration-upgrade.cjs                                      | 14 + 9 migrationer, 13 modeller PASS |
| RUN_DISPOSABLE_RESTORE_DRILL=yes RESTORE_DRILL_SOURCE_DB=ledgerapp_drill_fas35 RESTORE_DRILL_TARGET_DB=ledgerapp_restore_fas35 node scripts/restore-drill.cjs | DB + blob PASS, 6.715 s              |
| Samma opt-in/DB-namn, node scripts/verify-runtime-login.cjs                                                                                                   | faktisk LOGIN och 8 DDL-denials PASS |
| Samma opt-in/DB-namn, node scripts/verify-restored-guards.cjs                                                                                                 | restored lås/balans PASS             |
| Samma opt-in/DB-namn, node scripts/verify-storage-races.cjs                                                                                                   | 3 verkliga races PASS                |
| API_INTERNAL_URL=https://ledgerapp-api.example.invalid corepack pnpm@9.15.4 build                                                                             | PASS, 54 Next-sidor                  |

POSIX-formen ovan visar env-bindningarna; Windows-körningarna satte motsvarande
PowerShell-processenv. Inga .env-filer eller produktionshemligheter ändrades.
Upgrade-scriptets enda ändring är validerbart explicit disponibelt DB-namn;
defaultnamn, port och säkerhetsgräns behålls.

Teststack: PostgreSQL 16 på 127.0.0.1:15443 (ledgerapp_test/ledgerapp_e2e),
drill-source 15440, restore-target 15441, privat S3-kompatibel RustFS på 19500,
Next 4310 och API 4410. Recovery-artifact:
`C:\Users\Vince\AppData\Local\Temp\ledgerapp-restore-drill-KaF4sx`.
Drill-bucketar `ledgerapp-drill-source-b9b281ad` och
`ledgerapp-drill-restored-b9b281ad` behölls. Test-DB/bucketar ska inte raderas
automatiskt; en ny fresh/restore-körning kräver nya disponibla DB-namn.
De fyra isolerade test-/drill-containrarna stoppades efter slutkontrollen;
volymer, databaser och bucketar behölls. Användarens ordinarie PostgreSQL 5433
och MinIO 9000–9001 kör fortfarande. Testservrarna på 4310/4410 är avslutade.

UI-screenshots och Playwright HTML/trace-artifacts ligger i ignorerade
`apps/web/test-results` / `apps/web/playwright-report`. De är testfixturer,
inte produktionsdata. Bokföringens serverlogik, tenant-/rolechecks, money-
engine, tidigare migrations-SQL och schema har ingen diff i FAS 35.

## Baslinje och historiska dokument

FAS 30–34 ingår i master-bascommit ovan. GitHub API verifierade
[run 37785265772](https://github.com/VincentDimov/AppenBokforing/actions/runs/37785265772):
completed/success, samma SHA, verify/browser-e2e/recovery-runtime-gate SUCCESS.
Vercel READY för bascommit uppges av användaren och är inte självständigt
verifierat i denna fas. Inget av dessa äldre remote bevis gäller ocommittad FAS 35.

README, CURRENT_STATE, GAP_ANALYSIS och ROADMAP pekar nu på denna rapport.
Den tidigare fasrapportens lokala/opushade och "FAS 35 ej påbörjad"-uppgifter
är uttryckligen markerade som historiska/ersatta, inte omskrivna testbevis.
