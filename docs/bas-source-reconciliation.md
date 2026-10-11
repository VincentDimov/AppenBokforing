# BAS 2026 — full källavstämning, inte importgodkännande

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
2087 har olika namn i källan: **BLOCKED_EXTERNAL / SOURCE_CLARIFICATION_REQUIRED**.
Ingen sista-raden-vinner, rättning från föregående års kontoplan eller egen tolkning.
Alla 1285 förekomstnamn kan matcha mellan PDF och XLSX samtidigt som denna
interna källkonflikt hindrar ett entydigt manifest med 1282 namn.

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
detta resultat. Nu finns inget godkänt officiellt manifest att godkänna/importera.

## Rättigheter

[BAS erbjuder separat maskinläsbar data](https://www.bas.se/kontoplaner/kontoplanen-i-maskinlasbart-format/).
[Villkoren](https://www.bas.se/wp-content/uploads/2024/04/Allmanna-Villkor-atkomstnyckel.pdf),
särskilt 2.1 och 4.3–4.5, beskriver tillåten integration inom ett relevant avtal.
Detta är inte ett generellt förbud mot all kommersiell integration och inte
bevis för att just LedgerApp har sådant avtal. Rättigheter för den avsedda
användningen är **NOT_ESTABLISHED**. Ingen AI-bedömning markeras som juridiskt godkännande.
