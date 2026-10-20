# Kontosaldo vid kontering

Konteringstabellen visar **Saldo** efter knappen för att ta bort raden. Moms
är inte längre en tabellkolumn. Kod/roll/grupp kan fortfarande granskas och
ändras under den infällda sektionen **Momsuppgifter (valfritt)**. Sparade
momsuppgifter, mallar och bokförings-/momsvalidering ändras inte.

## Vad saldot betyder

- Valda räkenskapsårets validerade ingående balans plus bokförda rörelser från
  årets början till och med verifikationens valda bokföringsdatum.
- Samma teckenkontrakt som huvudboken: debet minus kredit. Exempelvis positivt
  banksaldo och negativt kreditsaldo; ingen automatisk absolutbeloppsvisning.
- Utkast och belopp som ännu bara skrivits i editorn ingår inte. Flera rader
  med samma konto visar samma bokförda saldo, inte ett löpande utkastssaldo.
- Vid visning av en redan bokförd verifikation ingår den, om den omfattas av
  datumet. Detta är en aktuell beräkning, inte en fryst historisk saldosnapshot.
- Det är ett bokföringssaldo, inte ett direkt hämtat saldo från bank/PlusGiro.

Konto-/datum-/organisationsbyte tömmer föregående saldokoppling direkt. Hämtning
avbryts när kontexten byts och sena svar får inte återinföra gamla saldon.
Debet-/kreditinmatning utlöser inga saldoförfrågningar. Spara/bokför och knappen
**Uppdatera saldon** förnyar hämtningen. Andra användares postningar pushas inte
automatiskt till vyn. Ett hämtningsfel visas som otillgängligt saldo, aldrig
som ett påhittat nollsaldo, och ändrar inte reglerna för att spara/bokföra.

## Läs-API

`GET /accounts/balances`

Query: `organizationId`, `fiscalYearId`, `date` (`YYYY-MM-DD`), `accountIds`
(kommaseparerade unika UUIDv4, 1–100 per anrop).

Svaret innehåller samma organisation/år/datum och
`accounts: [{ accountId, balance: "12000.25" }]`.

Session och `READ_BOOKKEEPING`-medlemskap krävs. Alla konton och räkenskapsåret
måste tillhöra organisationen. Även READ_ONLY får läsa; kalenderlås hindrar
inte läsning. Ogiltig/ofullständig IB ger rapportmotorns befintliga fel och
ett annat företags ID ger inget delresultat.

Hela årets IB valideras med den befintliga rapportmotorn. En grupperad
PostgreSQL-summering per batch väljer bara begärda konton, rätt organisation,
år, datum och POSTED-verifikationer. Läsning sker i RepeatableRead. Flera
batches är separata ögonblicksbilder, inte en gemensam snapshot över alla anrop.
Klienten deduplicerar konton och använder högst tre samtidiga batch-anrop.

Decimal med rapportmotorns precision används på servern. JSON-belopp är
strängar; klientens svenska formatering använder BigInt/öre, aldrig flyttal.
Inget schema, inga migrationsfiler eller bokförda poster ändras av funktionen.

## Tester

Golden-HTTP-fixturen kontrollerar IB, datumgränser, postningar/rättelse, utkast,
negativa kreditsaldon, riktiga nollor, stora exakta belopp, tenant-/årsgränser,
READ_ONLY och validering av begäran. Hook-/editortester kontrollerar sena svar,
abort, deduplicering/batchning, fel, uppdatering och kolumnplaceringen.
Browserregressioner täcker datum/konto/organisationsbyte och bevarad explicit
momsregistrering i den nya infällda sektionen.

### Lokal verifiering 2026-10-20

- Lint, typkontroll och produktionsbygge godkända.
- 340 enhets-/kontraktstester och 214 PostgreSQL-integrationstester godkända
  i en isolerad lokal testmiljö, utan ändring av ordinarie databaser.
- Den fulla webbläsarkörningen gav 47 godkända av 48 scenarier. BAS-listans
  test behövde en exakt textmatchning och väntan på rätt antal filtrerade
  rader; ingen BAS-produktionslogik ändrades för detta.
- Efter rättad testväntan och slutlig tabellbredd passerade samtliga sju
  omkörda scenarier: saldo, hela BAS-listan, explicit momsregistrering och
  arbetsytan vid 1440, 1024, 768 och 390 px. Skärmbilden vid 1440 px har
  granskats visuellt: Saldo och hela beloppen syns efter papperskorgen.

Ingen commit, push eller produktionspublicering ingår i denna verifiering.
