# FAS 18 — browser och driftgräns

## FAS 19 — tillagd gemensam Golden-fixtur, 2026-10-07

local.spec.ts använder nu tests/fixtures/accounting-golden.ts för verklig IB,
POSTED-rörelser, kreditnota och API-rättelse. Browsern laddar saldobalans genom
Next→Nest och visar 11 000 bank/13 500 UB-totals; API-läsningar av GL/BS/IS och
den ursprungliga PostgreSQL-IB-raden verifieras i samma flöde. Orgbyte rensar vyn.
Hela lokala sviten: **10 PASS (17,0 s)**, en worker, inga retries.
[Kontrakt, facit och körprotokoll](accounting-balances.md).
Ingen ny produktions-smoke eller cloudmutation i denna fas.

## Tre separata lager

1. `test`: ordinarie unit-/kontraktstester; Playwright-filer undantas från Jest.
2. `test:integration`: verklig isolerad PostgreSQL `ledgerapp_test` och NestJS/Supertest.
3. `test:e2e`: Chromium → Next `/api/*` → kompilerad NestJS → verklig PostgreSQL
   `ledgerapp_e2e`. Separat skrivskyddad `test:e2e:smoke` mot publicerad webb.

Playwright 1.63.0, en worker, inga automatiska retries. Lokala testservrar startas
av Playwright och får **inte** återanvända redan körande servrar. Lokal webb kör
en ny produktionbuild och `next start`, inte Next dev/hot reload.

Runnern bygger DB/SIE/API/webb och applicerar migrationer före serverstart.
Fail-closed guard kräver loopback HTTP för både webb/API och en loopback
PostgreSQL-databas med exakt namnet `ledgerapp_e2e`. Produktions-/preview-URL
accepteras endast av smoke-konfigurationen, inte av mutationstesterna.
Guardens sju negativa/positiva kontraktstester körs separat med:

```sh
node --test scripts/e2e-safety.test.cjs
```

Detta skyddar inte mot en manuellt uppsatt tunnel från localhost till en verklig
databas. Operatören måste verkligen använda en disponibel lokal databas.

## Lokal körning

Exempel på nya, disponibla resurser (byt namn/port om upptagna):

```powershell
docker run --name ledgerapp-e2e-local -e POSTGRES_USER=ledgerapp -e POSTGRES_PASSWORD=disposable_local_only -e POSTGRES_DB=ledgerapp_e2e -p 127.0.0.1:15435:5432 -d postgres:16-alpine
corepack pnpm@9.15.4 install --frozen-lockfile
corepack pnpm@9.15.4 exec playwright install chromium
$env:E2E_DATABASE_URL='postgresql://ledgerapp:disposable_local_only@127.0.0.1:15435/ledgerapp_e2e'
corepack pnpm@9.15.4 test:e2e
# Alternativt:
corepack pnpm@9.15.4 test:e2e:headed
```

Default: `E2E_BASE_URL=http://127.0.0.1:4310`,
`E2E_API_URL=http://127.0.0.1:4410`. Båda kan ändras till andra lediga lokala
portar. Använd inte vanliga utvecklingsservrar/databaser.

Testanvändare har slumpade lösenord/email. Organisationer, konton, år och
bokföringsfixturer skapas genom ordinarie API. Verifikationsserier och en
READ_ONLY-testroll provisioneras direkt i testdatabasen eftersom motsvarande
administrationsflöden saknas. Ingen direkt SQL används för att fabricera POSTED
verifikationer eller rapportbelopp. Ingen DB-truncate/reset körs; gamla
testruns identifieras med nya UUID. Behåll containern för felsökning eller
stoppa den efteråt; radering av testdata är en separat avsiktlig operatörsåtgärd.

Kör inte Prisma generate samtidigt som den lokala API-processen håller dess
Windows-DLL öppen. Kör unit/integration/build före eller efter E2E.

## Täckning och gränser

Lokala browserfall: registrering, cookies, omladdning, utloggning till startsida,
skyddad redirect, felaktig inloggning och inga auth-tokenlagringsnycklar.
Organisationerna växlar konton/verifikationer; alla tre rapporter töms vid byte;
ett fördröjt **verkligt** API-svar får inte återinföra gammalt rapportinnehåll.

Obligatorisk regression: spara D1930/C3000 1000, ändra till 5000 utan extra
manuell sparning, dubbelklicka bokför och jämför API + Prisma/Decimal + serien.
POSTED-inputs är låsta, giltigt PATCH ger 409, DELETE saknas, rättelse har
inversa belopp och originalets rader är oförändrade. Tangentbordsvägen verifierar
250 efter ett sparat 1000-utkast. Ogiltiga/obalanserade rader stoppar UI-postning.

Periodfall: bokför öppet, öppna nytt utkast, lås genom API, verifiera API-409 och
browserfel utan att utkastet blivit POSTED.

Rapportfixture bokför 1000 intäkt och 200 kostnad genom ordinarie posting.
Fyra POSTED-DB-rader ger bank 800, intäktskonto -1000, kostnad 200,
period-/ackumulerat resultat 800 och balansdifferens 0 i synlig rapport.
**Ingen IB, jämförelseperiod, moms eller SIE-korrekthet bevisas av denna fixture.**
Kända redovisningsgap i GAP_ANALYSIS kvarstår; inga rapportregler ändras.

Felgränser: verklig 401/403/404/400/409 från API och browserbehörighet/
inloggnings-/låsfeedback. 500 och nätverksfel i rapport-UI är uttryckligt
Playwright-felinjicerade, inte en framtvingad produktionsincident. Råa
Prisma-stackar får inte synas i rapportfelet. Detta är inte en komplett
fel-UX-matris för alla sidor eller ett CSRF-/penetrationstest.

## Skrivskyddad produktion-smoke

```powershell
$env:E2E_BASE_URL='https://bokforingsappen.vercel.app'
corepack pnpm@9.15.4 test:e2e:smoke
```

Den separata filen gör GET på startsida, login, register och proxad health;
inga bokföringsmutationer, registreringar, exportjobb eller rapportskrivningar.
Ingen trace/video/screenshot av produktion sparas. Även preview-URL kan användas.

Autentiseringskontrollen är **skipped** utan alla tre miljövariabler:
`E2E_SMOKE_AUTH_ALLOWED=true`, `E2E_SMOKE_EMAIL`, `E2E_SMOKE_PASSWORD`.
Sätt dem endast efter uttryckligt godkännande av ett isolerat drifttestkonto.
Det frivilliga fallet gör login/me/logout, inga bokföringsändringar, och
kontrollerar HTTPS-cookies Secure/HttpOnly/SameSite=Lax. Inga credentials
eller cookie-värden skrivs ut. Lokala HTTP-cookies bevisar inte Secure i drift.

## CI

Separat `browser-e2e`-jobb på PR/master har egen PostgreSQL-service, Chromium och
slumpade lokala sessionshemligheter. Befintligt integrationsjobb är separat.
Ingen publik produktionsmutation eller produktionscredential används i PR-CI.
CI-definitionen är tillagd; en faktisk GitHub Actions-run är inte verifierad lokalt.

Lokala `apps/web/playwright-report` och `apps/web/test-results` ignoreras av
Git/lint. Failure traces kan innehålla disponibla sessionscookies/testdata:
dela dem inte publikt; CI laddar inte upp dem.

## Bekräftade fynd 2026-10-06

- Browsern avslöjade ett Prisma nested create/deleteMany-ordningsfel vid
  radersättning: P2002 på befintliga radnummer. Rättat genom explicit,
  tenant-scopad draft-line deletion **inom samma transaktion**, före create.
  Ny PostgreSQL-integration täcker ersättning 100→5000→POST.
- Browsern reproducerade konkurrerande logout/home och anonymous/login
  redirects. Layoutens explicita logoutavsikt rättar denna kapplöpning.
- Publik smoke: **4 PASS, 1 SKIPPED** (ingen godkänd driftcredential).
  Alla tre HTML-sidor returnerade 200, LedgerApp-titel och h1 utan pageerror.
  HTML-svaren saknade CSP, X-Content-Type-Options, X-Frame-Options,
  Referrer-Policy. Detta är ett kvarstående härdningsgap, inte ett godkännande.
- `/api/health`: 200 med `service=ledgerapp-api, status=ok`, CSP,
  nosniff, SAMEORIGIN, no-referrer och no-store. Next→API-proxyn är styrkt.
  Den första anropstiden var ca 54 s, nästa 292 ms; cold-start är en möjlig
  förklaring, inte en verifierad driftorsak/SLA.
- Browser→DB-resultat och slutliga kommandon redovisas i CURRENT_STATE.
  Slutlig sammanhängande `corepack pnpm@9.15.4 test:e2e`: **9 PASS (14,9 s)**,
  utan retries. Alla ovanstående lokala fall kördes i samma Chromium-run.

Ingen deployment, ingen modifiering av molninställningar och inga
produktionsbokföringsdata har ändrats i denna fas.
