# LedgerApp

LedgerApp är en svensk, flerorganisationsbaserad bokföringsapplikation under
utveckling. Fas 1–7 innehåller plattform, PostgreSQL-domän, säker
autentisering, organisationsbehörighet, applikationsskal, kontoregister och
ett dubbel bokföringsflöde för verifikationer med spårbara rättelser.

## Starta lokalt

Kör från projektets rot i PowerShell:

```powershell
corepack pnpm install
Copy-Item .env.example .env
corepack pnpm infra:up
corepack pnpm db:generate
corepack pnpm db:deploy
corepack pnpm dev
```

- Webben: <http://localhost:3000>
- API-hälsa: <http://localhost:4000/health>
- API-dokumentation: <http://localhost:4000/docs>
- AIStor-konsol: <http://localhost:9001>

Kräver Node.js 22+, Docker Desktop med Compose v2 och nätåtkomst vid första
installationstillfället.

## Authentication and authorization

API:t erbjuder `POST /auth/register`, `POST /auth/login`,
`POST /auth/refresh`, `POST /auth/logout` och `GET /auth/me`, plus
organisationsrutterna `GET`/`POST /organizations` och
`GET`/`PATCH /organizations/:id`.

Lösenord använder Argon2id. Access- och refresh-token skickas endast genom
`httpOnly`-cookies; refresh-sessioner lagras hashade i PostgreSQL och roteras
vid användning. Alla skyddade rutter kräver en giltig session, och rutter med
ett organisations-ID kontrollerar medlemskap.

Rollerna är `OWNER`, `ADMIN`, `ACCOUNTANT`, `MEMBER` och `READ_ONLY`.
`OWNER`, `ADMIN` och `ACCOUNTANT` kan hantera konton; övriga medlemmar kan
läsa kontoplanen. Konton nås i appen via `/registers/accounts` (samt den
befintliga arbetsytelänken `/app/registers/accounts`).

## Verifikationer

`GET /journal-entries`, `GET /journal-entries/:id`,
`POST /journal-entries`, `PATCH /journal-entries/:id` och
`POST /journal-entries/:id/post` är organisationsskyddade. Endast
`OWNER`, `ADMIN` och `ACCOUNTANT` kan skapa, ändra utkast och bokföra.

En postning sker i en kort serialiserbar databastransaktion. Rader valideras
med Decimal-värden, debet och kredit måste balansera exakt, datumet måste
tillhöra ett öppet räkenskapsår och en öppen period, och
verifikationsnumret tilldelas atomiskt. Bokförda verifikationer och rader kan
inte ändras eller tas bort. Appvyerna finns på
`/bookkeeping/vouchers`, `/bookkeeping/vouchers/new` och
`/bookkeeping/vouchers/:id` (med motsvarande `/app/...`-länkar i sidomenyn).

## Rättelser av bokförda verifikationer

`POST /journal-entries/:id/reverse` skapar en spårbar rättelse i stället för
att ändra bokföringshistoriken. Begäran anger rättelsens
`transactionDate` och `voucherSeriesId`, samt kan ange en valfri beskrivning.
Den nya verifikationen får källan `REVERSAL`, bokförs direkt och innehåller
samma rader som originalet med exakt omvända debet- och kreditbelopp.

Rättelsens datum måste tillhöra ett öppet räkenskapsår och en öppen
redovisningsperiod, och den valda serien måste vara tillgänglig i det
räkenskapsåret. Det gör det möjligt att rätta en historisk verifikation i en
senare, öppen period utan att öppna eller skriva om den gamla perioden.
Originalets belopp, rader och status förblir oförändrade och bokförda.

Varje rättelse länkar tenant-säkert till sitt original via
`reverses_entry_id`. En unikhetsspärr per organisation tillåter högst en
rättelse per original; API:t exponerar den omvända länken som
`reversedByEntryId`. Båda verifikationerna är skrivskyddade efter bokföring.
Flödet skapar audit-händelser för skapande och bokföring av rättelsen samt en
`REVERSE`-händelse på originalet. Frontend visar länkar mellan original- och
rättelseverifikationen och erbjuder inga destruktiva åtgärder för bokförda
poster.

Webben proxar `/api/*` till `API_INTERNAL_URL`, vilket gör cookies förstapart
för browser-origin och håller tokenvärden borta från JavaScript-lagring.

Läs [authentication.md](docs/authentication.md) för sessionsmodell,
behörighetsmatris, ratelimits och konfiguration. Läs
[database.md](docs/database.md) för ER-diagram och integritetsregler. Läs
[chart-of-accounts-import.md](docs/chart-of-accounts-import.md) för den
licensmedvetna importgränsen för kontoplaner.

## Bilagor till verifikationer

Sparade utkast kan få underlag via `POST /journal-entries/:id/attachments`.
`GET /journal-entries/:id/attachments` visar auktoriserad metadata och
`GET /attachments/:id/download` utfärdar en kortlivad signerad nedladdningslänk.
Endast PDF, JPEG, PNG och WEBP tas emot, högst 10 MiB per fil. Servern
validerar filändelse, MIME-typ och filsignatur, skapar en SHA-256-kontrollsumma
och använder alltid en genererad lagringsnyckel i den privata MinIO/S3-bucketen.
Bilagor kan läggas till medan en verifikation är utkast och bevaras när den
bokförs; nya uppladdningar till bokförda verifikationer blockeras.

`S3_ENDPOINT` ska vara tillgänglig för API:t. Om den interna S3-adressen inte
kan nås av webbläsaren anges dessutom `S3_PUBLIC_ENDPOINT`; den adressen
används i signerade nedladdningslänkar. Standardgiltigheten är fem minuter och
kan justeras med `S3_SIGNED_URL_TTL_SECONDS` (max en timme).

## Vanliga kommandon

| Kommando                         | Syfte                                               |
| -------------------------------- | --------------------------------------------------- |
| `corepack pnpm dev`              | Startar webb och API.                               |
| `corepack pnpm infra:up`         | Startar PostgreSQL och AIStor.                      |
| `corepack pnpm db:generate`      | Genererar Prisma-klienten.                          |
| `corepack pnpm db:deploy`        | Applicerar incheckade migreringar.                  |
| `corepack pnpm db:seed`          | Lägger in idempotent utvecklingsdata.               |
| `corepack pnpm lint`             | Kör ESLint.                                         |
| `corepack pnpm typecheck`        | Kör TypeScript-kontroller.                          |
| `corepack pnpm test`             | Kör schema- och enhetstester.                       |
| `corepack pnpm test:integration` | Kör API-integrationstester mot `TEST_DATABASE_URL`. |
| `corepack pnpm build`            | Bygger databaspackage, webb och API.                |

## Integrationstester

Integrationstester använder alltid en separat databas. Efter att Docker har
startats kan en lokal testdatabas skapas och migreras:

```powershell
$ledgerDbPassword = (Get-Content .env | Where-Object { $_ -like 'POSTGRES_PASSWORD=*' } | Select-Object -First 1).Substring(18)
docker compose exec -T -e "PGPASSWORD=$ledgerDbPassword" postgres psql -h 127.0.0.1 -U ledgerapp -d postgres -c 'CREATE DATABASE ledgerapp_test;'
$env:TEST_DATABASE_URL = 'postgresql://ledgerapp:ledgerapp_local_password@localhost:5433/ledgerapp_test?schema=public'
$env:DATABASE_URL = $env:TEST_DATABASE_URL
corepack pnpm --filter @ledgerapp/db exec prisma migrate deploy --schema prisma/schema.prisma
corepack pnpm test:integration
```

Anpassa anslutningssträngen om lokala PostgreSQL-värden har ändrats. Testerna
skriver bara till `ledgerapp_test`, aldrig till utvecklingsdatabasen `ledgerapp`.

# AppBokf-ring
