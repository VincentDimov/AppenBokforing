# FAS 37.1 — CI-rotorsaker och reproduktion

Granskad 2026-10-11. Bas: `cc68bcf48c260654a0187f5a887bf585a93bea82`.
Tidigare bekräftad [failing run 37957362260](https://github.com/VincentDimov/AppenBokforing/actions/runs/37957362260):
verify SUCCESS, browser-e2e FAILURE, recovery-runtime-gate FAILURE. Ingen test skippas.

## Browser → API → PostgreSQL → årsväljare

`selectOption` hittade själva Räkenskapsår-selecten men saknade efterfrågat option.
På den snabbare CI-maskinen tömdes det gemensamma, verkliga GET-budgetfönstret
innan rapporttestet. Efter timeouten passerade senare rapporttester när fönstret
hade löpt ut. Lokal omodifierad svit passerade 45 tester; detta var inte rotorsaksbevis.
Ny browserreproduktion tömmer verkliga `/api/fiscal-years` till 429 och visar exakt
det tomma alternativfallet. Den väntar det verkliga 60-sekundersfönstret, gör en
uttrycklig läsretry och verifierar korrekt år samt byte till annan tenant.

Åtgärd: en budgetkontroll före varje browserfall reserverar GET-utrymme; endast
den avsiktliga TTL-väntan utökar just det fallets tidsbudget. Limiter, auth, cookies,
tenantguards, finansiella assertions och `retries: 0` är oförändrade. Rapportens
felstate inaktiverar selecten och erbjuder **Läs räkenskapsår igen**. En knapp ligger
inte längre inuti selectens label. Inga automatiska skriv-/bokföringsretries.

## Migration → anslutning → historisk jämförelse

En ny disposable databas reproducerade `P2010`, SQLSTATE `0A000`, efter att
framåtmigrationerna hade lyckats: PostgreSQLs cached plan kunde inte ändra
resultattyp. Uppgraderingsverktyget hade förberett SELECT med `accounts.name`
som varchar, låtit en separat Prisma CLI ändra det till TEXT och återanvänt
samma anslutning/plan för efterjämförelsen. Det var verifieringsverktygets
anslutningslivscykel, inte korrupt bokföring eller en misslyckad migration.

Åtgärd: disconnect/connect efter extern DDL, före exakt jämförelse av gamla
kolumner. Inga migrationer skrivs om, inga migrationschecksummor ändras,
ingen `db push`, reset eller historikreparation. Alla tidigare publika tabeller
inspekteras dynamiskt, inklusive tomma tabeller. Fixtures fyller även sessioner,
bilagor, SIE-historik, mallar, IB, lås och audit, inte bara konton/verifikationer.

`verify-upgrade-matrix.cjs` skapar separata nya databaser för migrationerna
14/18/19/23/24/25 och deployar till 25. Alla gamla kolumner och rader måste vara
identiska; snapshots, lås och skrivskydd kontrolleras därefter. Senaste körningen:
sex PASS, 26 ursprungsrader per fixture, 19 fyllda modeller, 20–29 bevarade tabeller.

## Sanitiserad diagnostik

`safe-diagnostics.cjs` rapporterar steg, felkod, SQLSTATE, migration,
constraint, cached-plan-kategori och jämförelsehashar. URL:er, secrets,
JWT/headerdata och råa SQL-parametrar/personrader skrivs inte ut.
Fyra riktade Node-tester verifierar kontraktet. Migrationsfelet kan nu
lokaliseras utan att ersättas av enbart ett generiskt fel eller röja kunddata.

Remote-resultat för ny kod redovisas separat i [releasegaten](fas37-1-release-gate.md).
Den gamla failing runen ändras inte och räknas inte som grön.
