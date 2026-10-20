# BAS 2026 — full källavstämning, inte importgodkännande

Uppdatering 2026-10-20: den efterföljande kompletta kandidaten är uttryckligen
användargodkänd och publicerad. Se [publiceringsrapporten](bas-publication-2026-10-20.md).
Siffer-/gate-status nedan är den historiska källkontrollen, inte aktuell databasstatus.

Kontrollerad 2026-10-11 med officiell PDF **BAS 2026 v1.1**, 39 sidor,
och den officiella XLSX-utgåvan. Källor/hash finns i [integrationskontraktet](bas-2026-integration.md).
Filerna finns utanför Git. Ingen officiell hel kontoplan distribueras som fixture.

| Kontroll                                             |    Resultat |
| ---------------------------------------------------- | ----------: |
| PDF/XLSX-kontoförekomster                            | 1285 / 1285 |
| Unika fyrsiffriga nummer                             |        1282 |
| Gruppkonton, obegränsade/begränsade                  |      45 / 0 |
| Huvudkonton, obegränsade/begränsade                  |    417 / 10 |
| Underkonton, obegränsade/begränsade                  |    794 / 16 |
| Kompletta namn matchade mellan källornas förekomster | 1285 / 1285 |
| Saknade XLSX-namn                                    |           0 |
| Längsta namn                                         |  173 tecken |
| Extra dubblettförekomster                            |           3 |
| Godkända ekonomiska produktionsklassificeringar      |    0 / 1282 |
| Importerade officiella poster                        |           0 |

Matchningen använder NFC/whitespace, kolumn-/positionsavgränsade PDF-regioner
och endast koordinatbevisad radbrytning vid tryckt bindestreck. Tryckta bokstäver,
skiljetecken och svenska tecken raderas inte; originalets blankstegsvariant jämförs
också så att ett samordnat bindestreck inte feltolkas. Korta namn används inte
som ersättning för hela labeln. Exempelvis radbrutna 4075–4078 och randordet i
8220 kräver korrekt PDF-layout, inte en uppfunnen namnändring. Fyra helt
syntetiska layouttester körs utan officiella filer. Metoden är en dokumenterad
maskinell korsjämförelse, inte 1282 oberoende professionella namn-/semantikgodkännanden.

## Dubbletter

2120 och 2130 har samma fullständiga namn och markering i sina återkommande
källpositioner: **IDENTICAL_OCCURRENCES_SINGLE_IDENTITY**. De ska ge en rad per
nummer efter godkänd normalisering, aldrig dubbla saldon.
2087 har två namn i källan. Kontroll 2026-10-19 mot
[BAS egen förklaring](https://www.bas.se/2021/02/03/bokforingsboken-och-bokslutsboken-2021-fardigtryckta/)
visar att detta är avsiktlig användning för olika associationsformer:
bunden överkursfond i aktiebolag och insatsemission i ekonomiska föreningar.
Det är alltså inte belagt att källan är felaktig. Ingen sista-raden-vinner,
rättning från föregående års kontoplan eller uppfunnet sammanslaget namn används.
Den nuvarande katalogmodellen har ett namn per nummer. Beslutet om hur båda
källvarianterna ska representeras måste därför finnas i det granskade manifestet.
Alla 1285 förekomstnamn kan matcha PDF/XLSX utan att det tekniska namnvalet är godkänt.

## Hierarki

3211/3212/3231 finns i källan, men 3210/3230 gör inte det. Det befintliga
gruppkontot 3200 är en möjlig **uttryckligen granskad** parent. Modellen,
validatorn och samma-version-FK tillåter en verklig nollslutande parent inom
samma grupp; ingen schemaändring behövs. Unit-, PostgreSQL-, importer- och
restorefixtures testar denna struktur med egna syntetiska namn. Teknisk förmåga
är VERIFIED; officiellt parentbeslut väntar på redovisningsgranskning.

## Privat manifestavstämning

`python scripts/verify-bas-sources.py --pdf <PDF> --xlsx <XLSX> --manifest <privat-json>`
jämför alla nummer, fulla namn, dubbletter, K2-markeringar och källhash och
rapporterar saknade/extra poster. Ingen ekonomisk klassificering härleds från
detta resultat. Vid denna tidigare kontroll fanns inget godkänt manifest att importera.

## Rättigheter

[BAS erbjuder separat maskinläsbar data](https://www.bas.se/kontoplaner/kontoplanen-i-maskinlasbart-format/).
[Villkoren](https://www.bas.se/wp-content/uploads/2024/04/Allmanna-Villkor-atkomstnyckel.pdf),
särskilt 2.1 och 4.3–4.5, beskriver tillåten integration inom ett relevant avtal.
Detta är inte ett generellt förbud mot all kommersiell integration och inte
bevis för att just LedgerApp har sådant avtal. Rättigheter för den avsedda
användningen var **NOT_ESTABLISHED** vid den tidigare kontrollen. Användaren
bekräftade 2026-10-19 uttryckligen sin rätt att integrera och visa hela BAS 2026
i den publicerade LedgerApp-tjänsten. Detta dokumenteras som användarens
attestering, inte som en självständig juridisk prövning eller ett påhittat avtalsnummer.
Rättighetsattestering är separat från godkännande av ekonomiska klassificeringar.

## Reproducerbart privat granskningsunderlag, 2026-10-19

`scripts/prepare-bas-review.py` läser hela den lokala XLSX-filen utan att ändra
den eller ansluta till någon databas. Output tillåts bara under Git-ignorerade
`.local-artifacts/`, och existerande filer skrivs aldrig över. Inga källnamn
loggas. Verktyget behåller alla förekomster, båda kontokolumnerna, fullständiga
namn, cellpositioner, rubrikkontext och K2-markeringar. Identiska dubbletter får
en kontoidentitet men alla källpositioner. Namn-/markeringskonflikter bevaras,
inte sista-raden-vinner. Förslag till parents innehåller bara verkliga källkonton.

XLSX-rubrikerna omfattar ibland flera numeriska kontogrupper och saknar
klassrubriker. Saknade rubriknamn lämnas därför tomma för källgranskning, inte
ärvda från fel grupp. Ekonomisk typ, normalbalans, bokföringsbarhet och faktisk
parent lämnas uttryckligen ogranskade. En explicit `--rights-reference` kan
dokumentera en befintlig attestering, men godkänner aldrig klassificeringarna.
Underlaget är **REVIEW_REQUIRED_NOT_IMPORTABLE**, inte ett produktionsmanifest.
Den befintliga importörens samtliga spärrar är oförändrade.

Verifierad helfil: 1285 förekomster, 1282 unika konton, 45 gruppkonton,
427 huvudkonton och 810 underkonton. Detta är källinventering, inte godkända
ekonomiska klassificeringar och inte en genomförd katalogimport.
