# BAS 2026 v1.1 — faktisk källvalidering

Kontrollerat 2026-10-11 med `scripts/verify-bas-sources.py`, PDF + officiell XLSX.
Fulla källfiler/kontonamn hålls utanför repositoryt. Se
[källor, hash och rättighetsgräns](bas-2026-integration.md).

| Observation                                      |           Antal/resultat |
| ------------------------------------------------ | -----------------------: |
| PDF-sidor lästa                                  |                    39/39 |
| Kontoförekomster i PDF / XLSX                    |              1285 / 1285 |
| Unika fyrsiffriga kontonummer                    |                     1282 |
| Obegränsade gruppkonton / begränsade gruppkonton |                   45 / 0 |
| Obegränsade huvudkonton / begränsade huvudkonton |                 417 / 10 |
| Obegränsade underkonton / begränsade underkonton |                 794 / 16 |
| Alla huvudkonton / alla underkonton              |                427 / 810 |
| Obegränsade nollslutande kandidater              |                      462 |
| Extra dubblettförekomster                        |                        3 |
| Saknade namn i XLSX                              |                        0 |
| Längsta XLSX-namn                                |               173 tecken |
| Godkända ekonomiska produktionsklassificeringar  |                   0/1282 |
| Officiella produktionsposter importerade         |                        0 |
| Avvisade produktionsimportposter                 | 0 — ingen import försökt |

462 är **kandidater från källstrukturen**, inte ett påstående om 462 faktiskt
granskade, bokföringsbara eller aktiverade standardkonton. Alla klassificeringar,
bookable-fält och normalbalanser väntar på redovisningsgranskning.

## Verifierat och inte verifierat

Förekomstmängderna och `#`-markeringarna är exakt lika mellan PDF och XLSX;
inga saknade eller extra fyrsiffriga förekomster i jämförelsen. Bekräftade
källreferenser: 1010 som begränsat huvudkonto, 1011 som begränsat underkonto,
1020:s exakta kortnamn, 1028 under 1020 samt 6200/6210/6211 som grupp/huvud/under.
Fulla förekomstnamn matchar nu **1285/1285**, även radbrutna etiketter; se
[metod, begränsningar och resolution](bas-source-reconciliation.md). Detta är
inte en professionell ekonomisk/bookable-granskning eller en entydig
namnresolution för det internt motstridiga numret 2087.

Identifierade dubbla nummer: **2087, 2120, 2130**. 2087 har motstridiga officiella
namn i källan och kräver auktoritativ resolution, inte “sista raden vinner”.
2120/2130 har identiska namn/markörer och normaliseras till en identitet per nummer.
För **3211, 3212, 3231** saknas motsvarande sifferhärlett huvudkonto 3210/3230.
Välj en faktiskt befintlig, granskad parent inom samma grupp/version eller stoppa
importen. Uppfinn aldrig det saknade huvudkontot.
3200 finns och kan uttryckligen väljas efter granskning; modellen tillåter detta
redan och syntetiska tester verifierar det utan påhittade 3210/3230.

Importvalidatorn vägrar ofullständigt manifest, olösta namn/klassificeringar/dubbletter,
fel markerade/icke-fyrsiffriga nummer, saknade/ogiltiga parents, fel typer eller
ogranskad licens. Godkänd SHA gäller exakt manifestets bytes; källans hash lagras
separat. Attestationen ersätter inte operatörens materiella granskningsbevis.

## Reproduktion

Kör Python med pdfplumber/openpyxl:

```text
python scripts/verify-bas-sources.py --pdf <operatörens-officiella-PDF> --xlsx <operatörens-officiella-XLSX>
```

Skriptet läser enbart källor och skriver en sammanfattning — ingen produktionskontoplan.
Syntetiska fixture-kataloger testar bokföringsflöden och importer utan att påstå sig
vara den fulla officiella BAS-datan. Rättighetsstatus NOT_ESTABLISHED och
klassificeringsstatus NOT_COMPLETED håller hela BAS-releasegaten **BLOCKED**.
