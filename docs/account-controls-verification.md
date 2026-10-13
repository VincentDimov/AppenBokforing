# Kontoplanens aktivering och katalogstatus — 2026-10-13

Produktionens skrivskyddade kontroll visade 0 katalogversioner, 0 standardversioner,
0 katalogposter och 0 företag bundna till en BAS-version. Onboarding använder därför
den befintliga lilla egna startkontoplanen. Detta är ett datainnehållsproblem,
inte något som en schemamigrering eller ny deployment kan fylla automatiskt.

## Ändring

- Öppna hela installerade BAS-katalogen som standard, med serverpaging.
- Utan katalog: visa alla företagskonton, även inaktiva, utan BAS-påstående.
- Aktivera/avaktivera direkt i tabellen, alltid med explicit bekräftelse.
- Behåll tenant-/rollkontroller, K2/K3-eligibility, preview och immutable audit.
- Radera inte konton eller bokföringshistorik och ändra inte äldre migrationer.

## Källunderlag och kvarvarande importkrav

De privata PDF-/XLSX-filerna finns under `.local-artifacts/source-review/` och
har samma SHA-256 som [tidigare källavstämning](bas-2026-integration.md).
Det finns inget godkänt normaliserat importmanifest i källmappen.
Den dokumenterade konflikten för 2087, ekonomisk klassificering/bokföringsbarhet
och rättighetsattestering får inte markeras godkända bara för att UI-tester passerar.
Full officiell BAS-import är därför inte utförd som del av denna UI-ändring.

Importeraren och dess skyddade hash-/granskningskrav är oförändrade. Råa källfiler,
fulla BAS-fixtures, licenser och credentials publiceras inte i Git eller frontend.

## Verifiering

Regressioner omfattar hela katalogen som startvy, saknad-katalog-fallback,
bekräftelse/avbryt, egen återaktivering, skrivskyddade roller och tenant-isolation.
Det verkliga browserflödet avaktiverar och återaktiverar ett syntetiskt BAS-konto
med bokförd historik och jämför kontoidentitet, metadata och journalrader exakt.
Fullskaliga browserfixtures är 1310 egna syntetiska poster, aldrig officiell BAS.

Lint, typecheck och 318 unit/schema-tester: PASS. PostgreSQL-integration:
23 sviter, 209 tester PASS i separat loopback-testdatabas. Inga tester muterar
normala lokala företag eller produktionens konton/bokföring.

Full Chromium-svit: 47/47 PASS, inklusive verklig statusdialog → API → PostgreSQL,
tenantbyte, syntetisk fullstor katalog och historikbevarande återaktivering.
API- och Next.js-produktionsbyggen PASS. Advisory-gate PASS med 0 rapporterade
sårbarheter. Inga säkerhetsgränser eller granskningskrav har lättats.
