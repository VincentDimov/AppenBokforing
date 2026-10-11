# FAS 37.1 — svensk 56-punktsrapport och releasegate

Datum 2026-10-11. Bascommit `cc68bcf48c260654a0187f5a887bf585a93bea82`.
Arbetet stannar vid FAS 37.1; ingen FAS 38, mastermerge eller produktionsdeployment.
Statusuppgifter nedan skiljer teknisk verifiering från officiell BAS-release.

## A. Git och version

1. **Commit:** kodändringarna finns på `codex/fas37-1-ci-catalog-validation`.
   Slutlig SHA och remote-resultat redovisas efter verklig push/CI-verifiering;
   bascommit ovan är inte den nya leveransens SHA.
2. **Filer:** CI-workflow; katalogvalidator/importer; uppgraderingsverktyg och
   sanitiserad diagnostik; source-layout/namn/manifestavstämning; fullskalig
   originalsyntetisk fixture/importer/HTTP/restore; kontostatus/årsväljare och
   browser/unit-tests; README/CURRENT_STATE/GAP_ANALYSIS/ROADMAP/faser och BAS-dokument.
   `.gitignore` utesluter Python-cache. Privata källfiler/.env ingår inte.
3. **Migrationer:** inga nya eller omskrivna migrationer; samma 25 checksummor.
   Ingen `db push`, reset, drop av bokföringsdatabas eller historikändring.
4. **Push:** separat featurebranch/PR används för CI; master lämnas orörd så
   dess Render/Vercel-auto-proddeploy inte startas av detta arbete.
5. **Remote CI:** ny run ännu inte verifierad vid denna rapports första commit.
   [Gamla run 37957362260](https://github.com/VincentDimov/AppenBokforing/actions/runs/37957362260)
   är fortfarande FAILURE och får inte räknas som nytt grönt resultat.

## B. CI-fixar

6. **Playwright-rotorsak:** Räkenskapsår-selecten fanns men saknade option efter
   verklig GET 429 i CI:s snabbare sekvens. Lokal baseline 45 PASS dolde problemet.
   Ny faktisk 429-reproduktion med tomma options och återhämtning passerar.
7. **Fix:** budgetkontroll före browserfall, avsiktlig verklig TTL-väntan när
   nödvändigt; select-felstate och explicit läsretry. Inte höjd limiter,
   borttagen assertion, mockad 429, tenantbypass eller bokföringsretry.
8. **Migration-rotorsak:** `P2010/0A000` vid historisk SELECT efter lyckad DDL;
   förberedd plan med tidigare varchar-resultattyp återanvändes efter TEXT-ändring.
9. **Fix:** reconnect före jämförelsen efter extern Prisma CLI-DDL. Diagnostik
   visar steg/koder/hashar utan råa SQL-parametrar eller privata rader.
10. **Kompatibilitet:** baseline 14/18/19/23/24/25 → 25 PASS i sex nya databaser.
    26 ursprungsrader i 19 fyllda modeller per fixture; samtliga ursprungskolumner
    bevarade i respektive 20/22/22/22/27/29 tabeller, inklusive tomma.
11. **Diagnostik:** fyra Node-regressioner PASS för secretredaktion, SQLSTATE,
    migration/constraint, cached-plan-kategori och säkra jämförelsehashar.
    [Detaljer och reproduktion](ci-fas37-1-root-cause.md).

## C. BAS-data

12. **Version:** officiell PDF BAS 2026 v1.1 (filnamnets v2 är inte versionen),
    officiell XLSX och båda SHA-256 i [källdokumentationen](bas-2026-integration.md).
13. **Antal:** 1285 förekomster i vardera källan, 1282 unika fyrsiffriga nummer.
14. **Gruppkonton:** 45, inga K2-markeringar. Rubriker är inte bokföringskonton.
15. **Huvudkonton:** 427 totalt, 417 obegränsade. 462 obegränsade nollslutande
    kandidater inklusive gruppkonton är inte 462 godkända/aktiverade standardkonton.
16. **Begränsade huvudkonton:** 10, lagrade som metadata utan # i numret.
17. **Underkonton:** 810 totalt, 794 obegränsade; samtliga är valfria.
18. **Begränsade underkonton:** 16, också valfria och K3-beroende.
19. **Dubbletter:** identiska 2120/2130 = en identitet per nummer. 2087 har
    motstridiga namn och är BLOCKED_EXTERNAL, ingen sista-raden-vinner.
20. **Parents:** 3211/3212/3231 saknar 3210/3230; modellen tillåter faktiskt
    befintligt 3200 som uttryckligen granskat grupp-parent. Tekniskt testat,
    officiellt granskningsbeslut saknas; inga påhittade huvudkonton.
21. **Namn:** 1285/1285 kompletta förekomstnamn maskinellt korsmatchade,
    0 saknade, längsta 173 tecken. Koordinat-/multiline-regressioner PASS.
    2087 förblir intern källkonflikt; inget färdigt officiellt manifest är godkänt.
22. **Ekonomisk klassificering:** 0/1282 oberoende professionellt godkända.
    Ingen massgissning från första siffran; klass 2/8 och kontra kräver per-post-beslut.
23. **Bokföringsbarhet:** tekniska boolean-/defaultguards testade, officiella
    per-post-beslut NOT_COMPLETED. Gruppkonton är inte automatiskt rubriker.
24. **Rättigheter:** NOT_ESTABLISHED för denna SaaS/distribution. BAS-villkor
    tillåter avtalad integration, men inget relevant operatörsavtal finns här.
    Detta är inte ett AI-juridiskt godkännande eller generellt integrationsförbud.
25. **Officiellt importerade poster:** exakt 0. 1310 originalsyntetiska poster
    i testdatabaser är inte den officiella BAS-katalogen.

## D. Applikationsintegration

26. **Automatiska konton:** bokföringsbara obegränsade nollslutande poster
    i vald standardversion skapas atomiskt vid onboarding. Fullskalig syntetisk
    browserfixture kontrollerar nyföretag; utan auktoriserad data kvarstår liten egen plan.
27. **Valfria huvudkonton:** individuellt serverpreview → explicit bekräftelse;
    restricted-main aktiveras inte av vanlig standardprovisionering.
28. **Underkonton:** ingen huvudkontoaktivering drar med underkonton.
    Aktivering materialiserar endast användarens tillåtna urval.
29. **Bulk:** 100 tillåtna konton i verklig HTTP-preview/aktivering;
    samtidiga identiska anrop skapar exakt 100, blandat spärrat urval skapar 0.
30. **K2/K3:** NOT_CONFIGURED/K2 nekar begränsade konton, K3 kräver uttrycklig
    organisationsbekräftelse. Manuella kopior/SQL/SIE/IB/mallar skyddas; historiken skrivs inte om.
31. **Verifikationer:** aktiverat konto hittas i verklig typeahead med keyboard;
    endast aktiva/eligible konton väljs, inaktiverat äldre utkast kan inte bokföras.
32. **Mallar:** skapa/tillämpa/ändra belopp/bokföring samt inaktiv referens-
    nekande testas via riktiga API/browserflöden, inte global kataloglista i varje rad.
33. **IB:** nonzero-rader valideras, historiska inaktiva saldon bevaras.
    Golden-fixture ger manuellt förväntade saldon i verklig PG och browser.
34. **Årsöverföring:** fingerprint/preview/confirm och faktisk EQUITY-metadata
    återanvänds; eligibility/K2/periodregler kringgås inte.
35. **SIE:** preview utan mutation och extra explicit BAS-aktiveringsack,
    PC8/binary-export/roundtrip testas. Inte använda valfria konton importeras inte.
36. **Rapporter:** huvudbok, saldobalans, resultat, balans, moms,
    verifikationsrapport och CSV använder tidigare Decimal/POSTED/IB/snapshotmotorer.
    Kataloghierarkin duplicerar inte belopp; manuella Golden-summor är regressionsevidens.
37. **Historik:** tidigare rader/kolumner i alla uppgraderingsbaselines identiska;
    browser avaktivering/provisionering behåller bokförda lines/snapshots exakt.
    Exakt inverterande rättelse är inte fri efterhandsredigering.
38. **Tenantisolering:** verklig HTTP/browser A/B, främmande medlemskap,
    READ_ONLY, K2/SQL-bypass och sena svar kontrolleras. Global metadata ger inte tenantåtkomst.

## E. Kvalitet

39. **Unit:** 311 PASS: API 175/22 suites, web 112/27 suites, DB 11, SIE 13.
    Dessutom 4 diagnostik-, 4 Python-layout-, 2 Prisma-kompatibilitets- och
    1 storage-reconciliation-test PASS. Lint 6 tasks/typecheck 9 tasks PASS.
40. **PostgreSQL:** 208 PASS/23 suites. Ny fullskalig HTTP-regression
    verifierar 1310 poster, 14 paginerade sidor, samtidig provisioning/bulk och contra.
41. **Browser:** första fulla fresh körningen PASS 46/46, 3,9 minuter,
    inklusive verklig 429 och fullskaliga BAS-aktiveringsfixtures. En ny separat
    fullskalig fyrbredds-/axe-kontroll ingår i nästa körning; ännu ej verifierad här.
42. **Säkerhetsaudit:** föreskriven runtime-audit PASS med 0 info/low/moderate/
    high/critical advisories; inga runtime-GRANTs utökade eller guards avstängda.
43. **Fresh migration:** verkligt tomma nya recovery- och browserdatabaser
    migrerade 25/25. Ingen databas återanvändes genom reset.
44. **Äldre uppgraderingar:** sex PASS, ingen ekonomisk drift i ursprungskolumner.
    Pre-snapshot/pre-FAS30/FAS35/FAS36/FAS37 omfattas. Områden äldre än migration 14 ej testade.
45. **Restore:** ny tom target, verklig pg_dump/pg_restore och privata blobs PASS;
    1310 extra syntetiska katalograder plus kontrollkatalog/proveniens jämförda
    rad-för-rad. Missing/orphan/checksum/size-fixtures ger korrekta negativa rapporter.
46. **Runtime LOGIN:** riktig begränsad LOGIN PASS; 16 DDL/evidence-operationer
    nekade, ingen migratormedlemskap, legitima auth/posting/reversal/report/IB/carry/
    katalog-SELECT/provisioning/aktivering fungerar. Restaurerade lås/obalans nekas.
47. **Skala:** importer 6 baseline + 13 fullskaliga fall PASS; två samtidiga
    CLI-anrop ger IMPORTED/ALREADY_IMPORTED, mismatch-version nekas,
    faktiskt deferred COMMIT-fel rullar tillbaka hela versionen/raderna.
    Full HTTP-fixture 1310 poster/14 sidor/100 bulk tog lokalt 2260 ms;
    detta är observerad fixturetid, inte ett produktions-SLA/loadtest.
48. **Tillgänglighet:** befintliga workspace/admin/rapport/public-flöden
    keyboard/axe PASS vid 1440/1024/768/390 px. Ny fullskalig katalogkontroll
    har ännu inte exekverats i denna rapportversion. Manuell hjälpmedelsgranskning ej påstådd.
49. **Produktionsbuild:** Next-build för fresh E2E PASS, 67 statiska sidor,
    inga databas/JWT/storagehemligheter skickade till frontend. Rootbuild slutkontrolleras separat.
50. **Remote GitHub Actions:** PENDING; ska avläsas från verkliga run/jobs för
    exakt kod-SHA. Lokal PASS gör inte remote verify/browser/recovery grön.
51. **Vercel/Render:** NOT_TESTED för ny kod; ingen manuell eller master-triggerad
    produktionsdeployment. Normal AIStor HeadBucket 404, CreateBucket 403 med
    saknad/utgången licens i felmetadata; separat lokal storage BLOCKED_EXTERNAL.

## F. Återstående och exakt gate

52. **Löst/verifierat:** två CI-rotorsaker lokalt, diagnostik, fullnamnskorsjämförelse,
    identiska dubbletter, explicit grupp-parentförmåga, skrivfri all-blockers-preview,
    fullskalig importer/HTTP/restore och kontostatus. Gamla failing runs är inte redigerade.
53. **Tekniskt återstår i denna rapportversion:** slutlig full browser47-/rootbuild-
    körning, remote tre jobb och uppdatering med faktisk CI-evidens. Ingen hävdad COMPLETE ännu.
54. **Externa blockerare:** BAS-rättigheter, 2087-resolution, oberoende ekonomisk/
    bookable-/parentgranskning; separat AIStor-licens/driftsbeslut. Inga fulla källposter
    godkänns/importeras eller lagringsvolymer byts för att få en grön ruta.
55. **Ej verifierade antaganden:** hosted miljö/grants/TLS/backup/MFA-key custody,
    professionell redovisnings-/SIE-matris, manuell hjälpmedelsgranskning och
    verkligt full-officiellt-katalogflöde. Tidigare dokumenterade P0 stängs inte av dessa tester.
56. **Exakt slutstatus i denna rapportversion:** teknisk slutgate PENDING_REMOTE_AND_FINAL_CHECKS;
    **FULL OFFICIAL BAS 2026 RELEASE = BLOCKED_EXTERNAL / NOT COMPLETE**.
    Deployment NOT_TESTED. FAS 38 NOT_STARTED.

## Evidensetiketter

RESOLVED/VERIFIED = faktisk kodfix/körning. BLOCKED_EXTERNAL = operatörsrättighet,
källbeslut eller professionell granskning saknas. BLOCKED_TECHNICAL = återstående
bekräftat tekniskt fel. NOT_IMPLEMENTED = t.ex. automatiskt historiskt versionsbyte.
NOT_TESTED = inget verifieringsbevis, inte ett påstående om PASS eller tekniskt fel.

PDF/spreadsheet-skillsen har använts för läs-only-korsjämförelse/layoutbevis,
PostgreSQL-skillen för lås-/integritetsgränser och React/verification-skillsen
för kontrollerbar browser → API → data → UI. Inget av detta är professionell
eller juridisk attestering.
