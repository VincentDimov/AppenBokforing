# FAS 36 – verifiering och implementeringsrapport

Arbetskopia, verifierad 2026-10-08–09. Ingen commit, push eller cloud-deployment ingår.
Resultaten nedan är faktiskt verifierade lokalt, inte bevis för en hosted release.
Inget verkligt privilegierat konto har bootstrappats i avsedd lokal/cloud-databas.
Bootstrapmekanism och testkonton ska inte förväxlas med operatörens aktivering.

## Verifiering

| Gate                          | Faktiskt resultat                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------ |
| lint                          | PASS                                                                                                   |
| typecheck                     | PASS                                                                                                   |
| root unit tests               | PASS: 278 tester – API 149/20 sviter, webb 105/25 sviter, DB 11, SIE 13                                |
| PostgreSQL integration        | PASS: 190 tester i 22 sviter; 33 nya adminfall, inklusive root test:integration                        |
| Playwright E2E                | PASS: 41 Chromiumfall (29 tidigare + 12 admin), 2,8 minuter, inga retries/skips                        |
| säkerhetsaudit                | PASS: 0 info/low/moderate/high/critical; inga nya undantag                                             |
| tom PostgreSQL                | PASS: 24 migrationer från tom ledgerapp_fas36_fresh_final; inga skapade användare/grants/bootstrap     |
| föregående schema             | PASS: 23 → 24 och äldre 14 → 24; ursprungliga kolumner i 13 datamodeller bevarade                      |
| restore                       | Databas/blob-checksums och signed download PASS, 6,536 sekunder i lokalt prov                          |
| runtime-login                 | PASS: faktisk separat NOSUPERUSER-login, 12 DDL/evidence-denials med PostgreSQL permission-check       |
| återställda redovisningsskydd | PASS: periodlås och obalanserad postning nekas; tre verkliga S3-races + tenant/logout-skydd            |
| produktionsbygge              | PASS: root build, fyra tasks (två cached), 26,164 sekunder; Next/API, 67 frontendroutes                |
| vanlig lokal utveckling       | PASS: tre publika sidor, två hydrerade authformulär, API-proxy och anonymt 401-skydd; inga skrivningar |

## Lokal databas och testmiljö

Den vanliga databasen localhost:5433/ledgerapp uppgraderades efter en arkivverifierad
backup utanför Git: LedgerApp-Backups/ledgerapp-local-before-fas36-20261008-29d1e28b-30f0-4214-ae37-3ed7407e2409.dump
(157256 byte). Alla 22 ursprungliga tabellers kontrollsummor för befintliga kolumner
är identiska före/efter migrationen. Tre tidigare användare och historik bevarades;
plattformgrants/bootstrap är fortfarande tomma. Inga gamla volymer eller data raderades.

Mutationstester använder enbart ledgerapp_test/ledgerapp_e2e och dedikerade drill-
databaser på loopback 15440/15441, privat lokal S3 på 19500. Testcontainrar och
fixtures hålls separata från normal PostgreSQL/MinIO. Inga cloud-credentials eller
verkliga initiala adminlösenord används. Tidigare utfärdade S3-URL:er blir inte
automatiskt ogiltiga vid logout: ny signering nekas, gamla URL:er löper ut enligt
gällande begränsade TTL. Det är en dokumenterad befintlig säkerhetsgräns.

Den vanliga utvecklingsmiljön startades om på http://localhost:3000 och API-port
4000 efter slutliga gates. Ett separat läsande Playwright-prov verifierade `/`,
`/login`, `/register`, lösenordssynlighetens React-interaktion, `/api/health` och
att anonyma `/api/auth/me` och `/api/platform-admin/users` nekas med 401.
Inga konton skapades, formulär skickades eller kontouppgifter ändrades i provet.

Ett extra smokeprov avsett för hostad HTTPS kördes först mot lokal HTTP: health
passerade, men tre publika sidprov föll enbart på saknad HSTS. HSTS är avsiktligt
produktionsspecifik; detta prov var fel miljö för den assertionen. Varken
produktionskravet eller smokeassertionen försvagades. Det separata lokala provet
ovan passerade med utvecklingens avsedda headers. Hosted HTTPS-smoke/release har
inte körts eller godkänts i denna fas.

## 42-punktsrapport

1. **Global arkitektur:** separat domän och persistenta globala grants, aldrig e-post- eller företagsrollsgenväg.
2. **Databas:** fem nya modeller, User/Session-utökningar; framåtmigration 24, RESTRICT och oförändrade gamla migrationer.
3. **Bootstrap:** explicit operatörsflagga + CLI-auktorisation, Argon2id, singleton/advisory lock, idempotens utan kontouppgradering.
4. **Faktisk bootstrap:** endast syntetiska isolerade testkonton; avsett Master Admin-konto väntar på operatör.
5. **Authentication:** lösenordsbyte, sessionsrevokering, färska databaschecks och login-evidence; normal auth kvarstår.
6. **Authorization:** SUPER_ADMIN, PLATFORM_ADMIN, SUPPORT_ADMIN, PLATFORM_VIEWER med explicit least privilege.
7. **MFA/step-up:** TOTP, krypterad hemlighet, replay-skydd, 12-timmars läsning/femminuters skrivning, engångsåterställning.
8. **Normal dashboard:** villkorad Admin-länk under Översikt, verklig plattformsöversikt utan påhittat företagsmedlemskap.
9. **Navigation:** separata moduler, desktop-collapse, mobildialog och tillbaka-länk.
10. **Adminlayout:** separat skyddat shell med samma FAS 35-designsystem; logout till startsidan.
11. **Översikt:** databasräknade KPI:er, datumintervall, registreringar, länder, roller, jobb och audit.
12. **Användartabell:** verkliga paginerade data, status, medlemskap, tidsstämplar och profilåtgärder.
13. **Sök/sort:** parameteriserad serversökning, svensk ICU A–Ö/Ö–A, stabil UUID-sort och begränsade filter.
14. **Användarprofil:** metadata, interna anteckningar, medlemskap, inbjudningshistorik, sessioner och audit.
15. **Användarredigering:** namn/anteckningar sparas; verifierat e-postbyte är uttryckligen spärrat.
16. **Lösenord:** tillfälligt lösenord/krävt byte för vanliga konton, sessioner återkallas; inget falskt resetmejl eller adminoverride.
17. **Sessioner:** maskerad IP/enhet, revokering individuellt och samlat; inga tokens exponeras.
18. **Företagstabell:** namn, nummer, adress, land, medlemsantal, status och datum från databas.
19. **Företagsprofil:** metadata, paginerade medlemmar, år/lås, serier, verifikationsantal, inbjudningar och audit; inga belopp.
20. **Företagsredigering:** metadata och reversibel inaktivering; bokföring/historik bevaras, identitet spärras efter bokföring/IB.
21. **Medlemskap:** explicit tillägg/roll/soft removal/återställning och atomisk ägaröverföring; sista ägare skyddas.
22. **Plattformsadministratörer:** endast SUPER_ADMIN tilldelar/ändrar/revokerar globala grants; sista aktiva super skyddas även vid samtidighet.
23. **Audit:** immutable SQL- och API-kontrakt, säkra före/efterdata, aktör/mål/request/resultat; begränsad CSV-export.
24. **Säkerhetscenter:** verkliga grants/statusar, nekade försök, credentialhistorik och konfigurationsvarningar.
25. **Användning:** databasantal och bilagemetadata-byte; ingen påhittad billing eller objektinventering.
26. **System:** verkligt SELECT 1, migrationsstatus/kompatibilitet; extern CPU/uptime/storage ej mätt.
27. **Import/export:** paginerad persistent SIE-jobbmetadata; inget filinnehåll eller global importbekräftelse/retry.
28. **Övrigt:** servervalidering, typed confirmation, atomiska spärrar, limiter för beständiga misslyckade MFA-försök.
29. **UI/UX:** återanvända tokens, tabeller, formulär, dialogs, loading/empty/error/retry och aborterade gamla sökningar.
30. **Tillgänglighet:** semantiska etiketter/tabeller och fokusdialog; axe utan överträdelser samt keyboard/Escape/fokus PASS.
31. **Responsivitet:** 1440/1024/768/390 pixlar PASS utan dokumentoverflow; desktop/mobil visuellt granskade.
32. **API:** full endpointmatris i platform-admin.md; inga publika adminvägar eller audit-update/delete.
33. **Unit:** 278 PASS: API 149, webb 105, DB 11, SIE 13; ytterligare 10 CI/safety-kontrakt PASS.
34. **PostgreSQL integration:** 190 PASS i 22 sviter: tenant/global isolation, MFA/recovery/refresh/concurrency/immutability och vanlig auth.
35. **Playwright:** 41 PASS: verklig proxy → API → PostgreSQL, första inloggning/MFA/edit/profile/layout/logout och tidigare bokföring.
36. **Security audit:** PASS, noll kända produktionsadvisories; inga nya eller försvagade undantag.
37. **Recovery/migration:** DB/blob-restore, runtime-principal, 23→24 och 14→24 PASS; lokal 23→24 bevarade 22 originaltabeller. Molnåterställning ej verifierad.
38. **Build:** slutligt root-produktionsbygge PASS: fyra tasks (två cached), 26,164 sekunder; Next/API och 67 frontendroutes. Normal utveckling startades därefter om separat.
39. **Rättade fel:** SQL-reserverat alias, väntning/scopad browserrad, Nexts tomma route-announcer, MFA-testfixture utan historikradering och Windows DLL-lås vid parallell generering.
40. **Extern infrastruktur:** verifierad mail/identitet, MFA-key custody/rotation, extern telemetry/tamper evidence och operatörsåterställning kvarstår.
41. **Risker/P0:** ingen cloud/remote-release är verifierad; ursprungliga redovisnings-/SIE-/restore-P0 försvinner inte av denna fas.
42. **Samlad status:** FAS 36:s kod och lokal verifiering är klara, inklusive root-produktionsbygge. Faktisk Master Admin-aktivering väntar på operatören; infrastrukturbundna funktioner är uttryckligen otillgängliga. Cloud-release och produktionsgodkännande påstås inte.

Skill-stöd användes för PostgreSQL least privilege/lås/index/pagination samt
auth-kontrakt, React-fokus/stale-request-hantering och end-to-end-verifiering.
Ingen extern tjänst konfigurerades eller deployades. Tester är inte bevis för
certifiering eller svensk regel-/redovisningsefterlevnad. FAS 37 startas inte.
