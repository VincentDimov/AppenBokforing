# BAS 2026: publicerad katalog, 2026-10-20

## Omfattning och godkännande

Den fullständiga **tillhandahållna PDF/XLSX-utgåvan BAS 2026 v1.1** är
installerad som standardkatalog i produktionsdatabasen. Den innehåller 1 282
unika konton, inte de 1 283 poster som beskrivs för BAS separata berikade
JSON-produkt. Vi har inte installerat eller återskapat den betalda JSON-produkten,
dess SRU-data eller dess stöd för normalbalans "Debet och kredit".

Användaren bekräftade användningsrätten 2026-10-19 och godkände 2026-10-20
uttryckligen den kompletta publiceringskandidaten, dess interna klassificeringar
och tillägg av saknade standardkonton. Detta är **användar-/operatörsgodkännande**,
inte en extern professionell attest, juridisk licensprövning eller ett påstående
om regulatorisk efterlevnad. Inget avtalsnummer har hittats på.

- Godkänd kandidat SHA-256:
  `39fd5786372f4b366c573bd89133df525df49bac463c03d057bbfdf0ed077203`.
- Slutligt manifest inklusive det efterföljande explicita godkännandet:
  `46c28c6c7579757720c011f4a6852d9323acdc9e8e971484d5652fdc298a3ad3`.
- Källfiler, full katalog och privata attestunderlag ligger utanför Git.
  PDF/XLSX-hashar finns i [källkontraktet](bas-2026-integration.md).

## Jämförelsen med den uppdaterade mappen

Åtta befintliga filer var byte-identiska med föregående 80-exempelsunderlag.
Tilläggen bestod av dokumentation och hämtnings-/paketeringsskript, inte ett
nytt färdiggranskat officiellt helkatalogmanifest. De tillhandahållna skripten
kördes inte. En separat, läsande AST-jämförelse gjordes mot referensen
`erp-mafia/accounted`, commit `1e4d781f590052f7162588688c17603f135683b7`.

- Referens: 1 286 nummer; officiell PDF/XLSX: 1 282. Inga officiella nummer saknades.
- Referensens extra 1249, 1259, 1269 och 4598 togs inte med.
- 12 namnskillnader och K2-skillnaden för 1081 löstes till förmån för förlagan.
- Referensens ekonomiska klassificeringar kopierades inte: 87 typ- och 84
  normalsideskillnader dokumenterades. Kontonamn, source-positioner och
  K2-markeringar kommer från den officiella förlagan; intern ekonomisk metadata
  kommer från LedgerApps separata regler och det explicita användargodkännandet.
- Ingen referenskod, beskrivningar eller SRU-data infördes i appen. Referensens
  AGPL-licens får inte förväxlas med användarens rättighetsattestering för BAS.

Separat godkända beslut: 2087 visas med AB-varianten "Bunden överkursfond";
båda källnamnen behålls i versionsunderlaget. 3211/3212/3231 använder verkliga
gruppkontot 3200 som parent. 8990/8999 har den uttryckliga interna
presentationskonventionen EXPENSE/DEBIT, inte en påstådd officiell BAS-attest.

## Genomförd databaspublicering

Neon-grenen `bas-validation-2026-10-20` användes först. Före produktion skapades
återställningsgrenen `pre-bas-backup-2026-10-20` utan egen compute.
Snapshot-API:ts kvot var redan fylld; återställningspunkten är en **databasgren**,
inte en skapad snapshot eller verifierad extern backup.

Den lokala Prisma-processen kunde inte ansluta från sin begränsade körmiljö.
Ingen anslutningshemlighet skrevs till Git, terminalargument eller konfigurationsfil.
Publiceringen genomfördes i stället via den autentiserade Neon-anslutningen,
utan att överföra databaslösenord. Detta var en uttryckligen godkänd engångsoperation,
inte en ny migrations-/startup-/seed-hook eller en ändrad normal importgate.

Samma hashkontrollerade manifest validerades med appens verkliga
`validateAuthorizedCatalog`. Samma transaktionsuppsättning kördes först på
testgrenen och därefter i produktion. Den använde rådgivande transaktionslås,
organisations-/kontolås, befintliga enum/FK/immutabilitets-/K2-triggers och
omedelbar kontroll av samtliga deferred constraints. Ingen trigger stängdes av.
Kontrollfel rullade tillbaka hela transaktionen. Befintlig katalogversion hade
avbrutit operationen i stället för att skrivas över.

| Kontroll                              | Testgren | Produktion |
| ------------------------------------- | -------: | ---------: |
| Katalogkonton                         |    1 282 |      1 282 |
| Standardaktiva i katalogen            |      462 |        462 |
| Grupp-/huvudkonton                    |      472 |        472 |
| Underkonton                           |      810 |        810 |
| K2-markerade                          |       26 |         26 |
| Kopplade befintliga organisationer    |        2 |          2 |
| Tillagda företagskonton               |      914 |        914 |
| Företagskonton efteråt                |      926 |        926 |
| Klassificeringskonflikter             |        0 |          0 |
| Skyddade befintliga rader oförändrade |    60/60 |      60/60 |

Varje företag fick 457 saknade standardkonton; fem standardkonton per företag
fanns redan. Alla tolv gamla företagskonton behöll ID, namn, ekonomisk typ,
normalsida, momsmetadata och aktiveringsstatus. Ingen gammal kontorad uppdaterades.
Den befintliga verifikationen och dess två rader, liksom gammal audit-historik,
bevarades rad-för-rad med databasberäknade fingeravtryck. Organisationerna ändrades
endast avseende katalogkoppling och uppdateringstid. Fyra nya audit-händelser
registrerades med systemoperatör, godkännandehash och provisioneringsantal;
ingen användare utgavs felaktigt för att vara aktör.

Produktionsversionens ID: `97d8464f-ad2e-4603-b034-9bc278e84b34`.
Efterföljande separat SELECT bekräftade standardversion, innehållshash,
1 282 konton, 462 standardaktiva, två organisationskopplingar och oförändrat
antal verifikationer/rader.

## Verifieringsgräns

Denna körning klarade 209 API-integrationstester i 23 sviter, 17 Python-tester
för källayout/förberedelse och 13 tester för klassificeringsförslag.
Syntetiska fixtures är inte officiella BAS-konton eller professionella attesteringar.

Den publicerade Konton-sidan stannade vid sessionsåterställning under den första
webbkontrollen. Backendens hälsoanrop och Vercels sessionsanrop gav timeout utan
HTTP-svar, medan Render rapporterade senaste deploy som `live` och inga nya
felloggar. **Databaspubliceringen är verifierad, men detta är inte ett godkänt
autentiserat produktions-UI-test.** Drift-/sessionskontrollen måste skiljas från
den genomförda katalogimporten; ingen omstart eller ny kod krävs för att databasen
ska innehålla katalogen.
