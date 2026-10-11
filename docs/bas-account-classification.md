# BAS — strukturell och ekonomisk metadata ska hållas isär

`GROUP_ACCOUNT`, `MAIN_ACCOUNT`, `SUBACCOUNT` beskriver nummer/hierarki.
De bestämmer inte ASSET/LIABILITY/EQUITY/REVENUE/EXPENSE, normalbalans,
rapportgrupp, moms eller bokföringsbarhet. En gruppkonto-rad kan vara ett
riktigt bokföringskonto; klass-/grupprubriker utan fyrsiffrigt nummer är inte det.

Varje auktoriserad produktionspost måste granskas för:

- fullständigt namn och nummer mot källposition/version;
- `type` och `normalBalance`, inklusive kontra-/avskrivningskonton;
- `isBookable`, K2-markering och faktisk befintlig parent i samma version/grupp;
- dokumenterad `classificationReference` och övergripande granskningsreferens;
- koppling till saldo-/resultatrapportens befintliga metadata, utan autogissad VAT.

Särskilt klass 2 kan innehålla eget kapital och skulder; klass 8 kan innehålla
såväl intäkter som kostnader. En kreditsida gör inte automatiskt en tillgång
till en skuld eller intäkt. Carry-forward söker uttrycklig EQUITY-metadata.
Historiska kontoidentiteter, snapshots och bokförda belopp får aldrig skrivas om
för att få katalogens klassificering att stämma.

## Granskningsstatus

**0/1282 officiella ekonomiska klassificeringar och bokföringsbarhetsbeslut är
oberoende professionellt godkända.** Namnkorsjämförelsen är inte sådant godkännande.
Operatören behöver ett separat granskat manifest, konfliktbeslut för 2087,
parentbeslut och rättighetsbevis, sedan oberoende godkänd SHA-256. Nuvarande
releasegate för officiell data förblir BLOCKED_EXTERNAL, inte COMPLETE.

## Syntetisk regression

`scripts/synthetic-bas-catalog.cjs` är 1310 helt egna fixtureposter, inte BAS.
Fixtures täcker klasser 1–8, EQUITY/LIABILITY i samma sifferklass, blandad
REVENUE/EXPENSE i klass 8, ASSET med CREDIT, långa svenska namn, grupp-parent,
begränsade huvud-/underkonton och icke-bokföringsbara rader. Fixtureförväntningar
är testdefinitioner, aldrig professionellt godkännande av officiella konton.
Import/HTTP/UI/restore kontrollerar att explicit metadata bevaras exakt.
