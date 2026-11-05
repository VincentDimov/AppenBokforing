# Projektstädning — 2026-10-20

## A. Sammanfattning och omfattning

Lokal rensning ovanpå `10ee95b`, utan commit, push eller deployment.
Användarens befintliga ändring i `faser.md` är inte del av arbetet.

- **10 spårade filer borttagna**, varav nio tillhör tre oanvända workspaces.
- **171 produktionskodsrader borttagna, fyra tillagda** i TS/TSX: netto 167 färre.
  Dokumentation, test-/verktygskonfiguration, manifest, lockfil och ignorerade
  testartefakter ingår inte i detta radmått.
- **Tre beroendedeklarationer borttagna**. Ett externt paket, `zod`, försvinner
  helt ur lockfilen; `clsx` och `tailwind-merge` behövs fortfarande i webben.
- **Fyra befintliga TSX-filer förenklade**. Inga nya produktionsabstraktioner.
- Aktiva workspaces: sju → fyra, exklusive repo-roten.
- Ingen styrkt minskning av levererad JavaScript-bundle påstås. Oanvänd kod
  kunde redan exkluderas av byggaren. Nytt bygge visar 102 kB gemensam First Load
  JS och 153 kB för kontosidan, samma avrundade nivå som föregående bygge.

Inventeringen omfattade 526 spårade filer, däribland 395 TS/TSX/JS-filer före
rensning, 71 `page.tsx`, fyra layouts, 20 Nest-kontroller med 108 HTTP-dekoratorer,
26 SQL-migrationer och 25 operatörs-/verifieringsscript. Detta är inventeringsmått,
inte ett påstående att varje endpoint eller möjlig URL har körtestats separat.

README, foundation-ADR, workspace-manifest, TypeScript/ESLint/Turbo/Next/Jest/
Playwright-konfigurationer, CI, proxy/deployment och säkerhetskontrakt granskades.
Import-/reexportgraf med TypeScript-parser kompletterades med sökning efter
dynamiska anrop, kompilerade `dist`-konsumenter, routingkonventioner och dokumentation.
Ingen ytterligare orefererad produktionsmodul hittades med den metoden; det är
inte ett formellt bevis att all dynamiskt oanvänd kod är identifierad.

## B. Borttagna filer

| Filer                                                                                           | Skäl                                                                                     |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `apps/web/components/accounts/accounts-table.tsx`                                               | Ersatt av den aktiva BAS-vyn; ingen import, routing- eller dynamisk konsument.           |
| `packages/config/package.json`, `packages/config/src/index.ts`, `packages/config/tsconfig.json` | Oanvänd foundation-Zod-hjälpare utan konsumenter i appar, test, script eller deployment. |
| `packages/shared/package.json`, `packages/shared/src/index.ts`, `packages/shared/tsconfig.json` | Endast oanvänd `isDefined`. Inget aktivt domänkontrakt.                                  |
| `packages/ui/package.json`, `packages/ui/src/index.ts`, `packages/ui/tsconfig.json`             | Oanvänd kopia av `cn`; den använda implementationen i `apps/web/lib/utils.ts` behålls.   |

Spårade filer kan återhämtas ur bascommiten. De pensionerade paketmapparnas
kvarvarande genererade Turbo-loggar flyttades, inte raderades permanent, till
`.local-artifacts/cleanup-20261020/retired-foundation-packages/`.
Övriga privata källunderlag, backuper, loggar och testhistorik behålls.

## C. Beroenden

`pnpm@9.15.4 remove` användes för `zod` i config-workspacet och för `clsx`/
`tailwind-merge` i det oanvända ui-workspacet. Efter borttagning av manifesten
uppdaterades lockfilen med pnpm och verifierades genom frozen installation.
Lockfilens diff tar endast bort poster; inga kvarvarande paketversioner uppgraderades.

Nest-peerberoenden, metadata, Prisma/CLI, pnpm för Windows/Turbo, Jest/Playwright,
axe, Tailwind/PostCSS och övriga konfigurationsberoenden behålls även när de
inte används genom vanliga runtime-importer.

## D. Förenkling och säkerhet

- `admin-shared.tsx`: oanvänd `AdminConfirmDialog` och dess import borttagna.
  Den använda `AdminAction`, dess explicita bekräftelse och alla serverguards behålls.
- `select.tsx`: oanvända `SelectGroup`, `SelectLabel` och `SelectContentProps`
  borttagna. Aktiva Radix-komponenter och deras beteende är oförändrade.
- `badge.tsx`/`button.tsx`: endast internt använda propstyper exporteras inte längre.
- `.gitignore`: `.env.*` täcker även t.ex. `.env.production` och `.env.test`;
  `.env.example` förblir det enda spårade miljöexemplet. Inga env-filer ändrades.
  En begränsad signatursökning efter privata nycklar/GitHub-token/AWS-nycklar
  i spårade filer gav inga träffar (`faser.md` undantogs). Detta ersätter inte
  en fullständig hemlighets- eller historikrevision.
- `.prettierignore`: privata underlag, browserresultat och Python-cache undantas.
  Det befintliga bevarandekontraktet testar de nya skydden.
- Smoke-konfigurationen använder en separat ignorerad `test-results-smoke`-mapp.
  Samtidiga smoke-/lokalkörningar ska inte radera varandras tracefiler;
  testkontraktet och Git/ESLint/Prettier-undantagen täcker separationen.
- README och nulägesdokumentet beskriver den kvarvarande workspace-strukturen.

React-granskningsguiden användes för att begränsa UI-arbetet till verifierat
oanvända delar. Ingen ändrad styling, CSS, effekt, state, hämtning eller memoization.
Ingen ändrad bokföringsberäkning, API, autentiseringskonfiguration, databasstruktur,
migration, produktionsdata eller deployment-resurs.

## E. Verifiering

Kontrollerna kördes på Windows/Node 22.20.0/pnpm 9.15.4. En separat källkopia
i `.local-artifacts/cleanup-20261020/validation` fick egen frozen-installation,
Prisma-klient och Next-output; normala utvecklingsservrar behövde inte stoppas.
Kopian innehåller spårad källkod, inte privata filer; dess `.env` är en kopia av
det offentliga `.env.example`, inte användarens `.env`.

| Kontroll                                                | Resultat                                                                                                                                                                                                                 |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Frozen install, arbetskopia och ren källkopia           | PASS; ren kopia installerad offline från paketlagret.                                                                                                                                                                    |
| Lint                                                    | PASS, omkört utan Turbo-cache i källkopian.                                                                                                                                                                              |
| Typecheck                                               | PASS, omkört utan Turbo-cache.                                                                                                                                                                                           |
| Ordinarie tester                                        | PASS: 331 (API 175, webb 131, DB 12, SIE 13), utan Turbo-cache.                                                                                                                                                          |
| PostgreSQL-integration                                  | PASS: 209 tester i 23 sviter mot disponibel loopback-DB `ledgerapp_test`.                                                                                                                                                |
| Produktionsbygge                                        | PASS: DB/SIE/API/webb; 67 statiskt genererade sidor, dynamiska rutter behållna.                                                                                                                                          |
| Script-/säkerhetskontrakt                               | PASS: 36 Node-tester.                                                                                                                                                                                                    |
| Python-källayoutkontrakt                                | PASS: 17 tester i nätverkslös, skrivskyddad `python:3.12-alpine`-container.                                                                                                                                              |
| Produktionsberoenden, `node scripts/security-audit.cjs` | PASS: 0 advisories i tjänstens aktuella svar.                                                                                                                                                                            |
| Formatteringskontroll av ändrade kod-/dokumentfiler     | PASS.                                                                                                                                                                                                                    |
| Git diff / bevarade gränser                             | PASS: API, alla routefiler, schema, 26 migrationer och deploymentkonfiguration oförändrade.                                                                                                                              |
| Lokal Chromium-E2E                                      | PASS efter riktad omkörning: 46 scenarier passerade i helkörningen och det enda artefaktdrabbade scenariot passerade separat med `--last-failed`. Totalt 47 scenarier verifierade, inte en enda obruten grön helkörning. |
| Befintlig publicerad webb, skrivskyddad smoke           | PASS: fyra GET-kontroller. Ett frivilligt autentiserat produktionstest SKIPPED, inga produktionscredentials användes. Avser föregående publicerade version, inte dessa opublicerade ändringar.                           |

Inledande verifieringsförsök behövde korrigeras: att starta alla Turbo-mål
samtidigt i en tom källkopia gav saknade `dist`-filer. Normal CI-ordning
lint → typecheck → test → build passerade därefter. Node-kontrakten behöver också
byggd DB; de passerade efter detta. Ingen produktionskod ändrades för att dölja
dessa körordningsfel. E2E-lagringens säkerhetsspärr avvisade först ett bucketnamn
utan det obligatoriska testprefixet; korrekt disponibelt namn användes sedan.
Säkerhetsspärrarna är oförändrade.

Den nästlade verifieringskopian ger Next-varning om två lockfiler. Inga
produktionskonfigurationsändringar gjordes för att tysta en testkatalogvarning.

Den första helkörningen (9,5 minuter) fick ett `ENOENT` i Playwrights trace-
livscykel när parallell smoke rensade den gemensamma resultatmappen. Ingen
applikationsassertion identifierade en regression i det fallet. Smoke fick
egen resultatmapp, passerade igen medan lokalsviten pågick, och det berörda
K3-scenariot passerade därefter separat (17,9 sekunder inklusive setup).
Inga testassertioner, produktionsgränser eller säkerhetskontroller lättades.

Separata operatörsdrills för full backup/restore, sex historiska uppgraderingar
och produktionsimport är **NOT RUN** i denna rensning: backend, SIE, schema,
migrationer och operatörsverktyg ändrades inte. Tidigare CI-resultat används
inte som ny verifiering av dessa lokala ändringar. Ingen ny remote CI kördes.

Efter verifieringen togs enbart denna körnings disponibla käll-/byggkopia bort.
Den kan återskapas från arbetskopian och frozen lockfil. Testcontainrarna är
stoppade men deras data behålls. Den vanliga lokala databasen, lagringen och
de tre befintliga Node-processerna lämnades igång. Backuper och källunderlag är kvar.

## F. Kandidater som behålls

- Legacy-/aliasrutter och catch-all: filbaserad routing och befintliga länkar,
  inte döda filer bara för att de saknar importer.
- `catalog-diff.ts` och admin-bootstrap: används av operatörsscript via `dist`.
- `mfa-crypto.ts`: används för att testa bevarad historisk ciphertext och migration;
  flytt/borttagning kräver separat beslut om den kompatibilitetstäckningen.
- `SIE_VARIANT`: dokumenterande export på paketgränsen; tas inte bort utan att
  först fastställa eventuella externa scriptkonsumenter.
- API-klienternas liknande felavkodning: olika feltyper, meddelanden och
  payloadkontrakt. Ingen bred sammanslagning utan separat kontraktstestning.
- Globala CSS-/Tailwind-klasser: dynamiskt sammansatta varianter, Radix och print
  gör statisk textsökning otillräcklig som borttagningsbevis.
- Historiska fasrapporter, licensunderlag, fixtures, återställningsverktyg och
  ignorerade privata artefakter: aktivt revisions-/återställningsvärde eller oklart ägarskap.
- Deprecation-varningar från använda testverktyg/transitiva paket kräver en
  separat uppgraderingsinsats, inte borttagning eller otestad major-uppgradering.

## G. Slutstatus

Rensningen är genomförd och lokalt verifierad med ovan redovisade gränser.
Den ändrar ingen produktionsdrift. Alla 47 browser-scenarier har passerat över
helkörning och riktad omkörning. Gröna tester är inte ett nytt
redovisnings-, regulatoriskt eller fullständigt produktionsgodkännande; tidigare
externa release- och driftkrav kvarstår.
