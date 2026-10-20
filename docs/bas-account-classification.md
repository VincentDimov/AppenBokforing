# BAS — strukturell och ekonomisk metadata ska hållas isär

Aktuell status 2026-10-20: den kompletta kandidaten med 1 282 konton är
uttryckligen användargodkänd och publicerad. Se
[publiceringsrapporten](bas-publication-2026-10-20.md). Förslagsverktyget nedan
förblir avsiktligt icke godkännandegrundande; det separata godkännandet omfattar
även 2087, parents och den interna 8990/8999-konventionen. Extern professionell
attest eller regulatorisk efterlevnad påstås fortfarande inte.

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

## Klassificeringsförslag efter användarens klasstabell, 2026-10-19

`scripts/bas-classification-proposals.cjs` läser en privat förberedelsefil från
`prepare-bas-review.py` och skriver en **ny**, privat förslagsfil. Ingen databas
ansluts. Befintliga ekonomiska värden, parentbeslut eller reviewbeslut får inte
skrivas över. Skriptet används inte av API/startup, seed eller migrationskedjan.

Basindelningen kommer från användarens uttryckliga klasstabell och
[BAS grundschema](https://www.bas.se/kontoplaner/kontoplanens-uppbyggnad-och-anvandning/).
Klassrubriker hämtade från användarens tabell är egna visningsrubriker, inte ett
påstående om att XLSX innehåller dessa rubriker. För en saknad grupprubrik föreslås
det verkliga gruppkontots namn. Originalnamn, namnvarianter och källpositioner ändras inte.

Förslagsreglerna ligger centralt, separat från redovisningsmotorn:

- Klass 1: ASSET/DEBIT, med CREDIT för uttryckliga ackumulerade av-/nedskrivningar
  och nedskrivningskonton. Osäkra fordringar är inte automatiskt ett värderegleringskonto.
- Klass 2: grupp 20 EQUITY, övriga grupper LIABILITY. Normalsida CREDIT med
  DEBIT-förslag för egna uttag/egna aktier och ingående moms i grupp 264.
- Klass 3: REVENUE/CREDIT med rabattundantag. Klasser 4–7: EXPENSE/DEBIT med
  motsvarande uttryckliga rabattundantag. Ingen godtycklig momskod sätts.
- Klass 8: uttryckliga inkomst-/kostnadsord skiljs åt. Finansiella nedskrivningar
  föreslås som EXPENSE/DEBIT, återföringar som EXPENSE/CREDIT. Dessa klassificeras
  inte som tillgångar bara för att de avser värdepapper.
- För nettoresultat/värdeförändringar i grupper 80–83 föreslås en **uttrycklig
  presentationskonvention** REVENUE/CREDIT. Motsvarande nettofinansieringskostnader,
  bokslutsdispositioner och skatter föreslås som EXPENSE/DEBIT. Ett negativt belopp
  byter inte kontotyp eller skriver om historik. Detta är ett förslag som måste
  godkännas, inte en generell regel utfärdad av BAS eller extern redovisningsgranskare.
- Fyra siffror i källans kontokolumner ger ett förslag till bokföringsbarhet.
  Klass-/grupprubriker utan fyrsiffrigt nummer blir aldrig konton. Ett riktigt
  gruppkonto behandlas inte automatiskt som en obokföringsbar rubrik.

Helkörning: 1282 unika konton, **1280 med föreslagen ekonomisk typ och normalsida**.
8990/8999 lämnas utan ekonomisk typ. Resultatöverföring får inte godtyckligt
klassificeras som EQUITY eller vanlig REVENUE/EXPENSE enbart för att validera en
enum: påverkan på resultat-, balans- och årsöverföringsberäkningarna måste lösas.
Namnbeslutet för 2087 och grupp-parentförslagen för 3211/3212/3231 är separat flaggade.
2087:s ekonomiska förslag kan vara entydigt även när namnvalet återstår; vid olika
ekonomisk innebörd mellan namnvarianter lämnas typen däremot öppen.

Utdata är `CLASSIFICATION_PROPOSALS_NOT_IMPORTABLE`, med varje rad
`PROPOSED_NOT_APPROVED`. `allSourceEntriesReviewed=false`, samtliga 1282
klassificeringar kvarstår som icke godkända och ingen approved SHA genereras.
Godkänd användningsrätt följer med från det uttryckliga underlaget men gör inte
maskinella klassificeringsförslag oberoende granskade. Produktionsimportörens
spärrar är oförändrade. Detta är inte en genomförd BAS-import eller ett påstående
om regelöverensstämmelse.

Exempel för operatören (privata filer ligger utanför Git):

```powershell
node scripts/bas-classification-proposals.cjs .local-artifacts/source-review/bas-20261019-attested-review.json .local-artifacts/source-review/bas-proposals-new.json
node --test tests/bas-classification-proposals.test.cjs
```

## Oberoende granskningsstatus före kandidatgodkännandet

**0/1282 officiella ekonomiska klassificeringar och bokföringsbarhetsbeslut är
oberoende professionellt godkända i det tillgängliga maskinella underlaget.**
Användarens tidigare generella granskningsbekräftelse dokumenteras separat;
den dåvarande filen saknade alla ekonomiska värden. De efterföljande maskinella
förslagen markeras inte retroaktivt som redan granskade av användaren.
Namnkorsjämförelsen är inte heller sådant godkännande.
Vid denna tidigare kontroll behövdes ett separat godkänt manifest, konfliktbeslut
för 2087, parentbeslut och godkänd SHA-256. Den efterföljande användarattesteringen
har nu skett separat och får inte beskrivas som ett retroaktivt professionellt
godkännande av de tidigare förslagen.

## Syntetisk regression

`scripts/synthetic-bas-catalog.cjs` är 1310 helt egna fixtureposter, inte BAS.
Fixtures täcker klasser 1–8, EQUITY/LIABILITY i samma sifferklass, blandad
REVENUE/EXPENSE i klass 8, ASSET med CREDIT, långa svenska namn, grupp-parent,
begränsade huvud-/underkonton och icke-bokföringsbara rader. Fixtureförväntningar
är testdefinitioner, aldrig professionellt godkännande av officiella konton.
Import/HTTP/UI/restore kontrollerar att explicit metadata bevaras exakt.
