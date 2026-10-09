# Företagskonton, aktivering och bokföringsbarhet

## API och roller

Alla katalogrutter återanvänder kontocontrollerns membership guard och validerade DTO:er.
Global referensdata läses endast i ett behörigt företagskontext; inga privata konton
från andra företag exponeras. Företagsadministratör är inte global plattformsadmin.

| Endpoint                                                    | Tillåten åtgärd                                   |
| ----------------------------------------------------------- | ------------------------------------------------- |
| GET /accounts/catalog?organizationId=…                      | Läsa katalog/aktiva/tillgängliga/egna, paginerat  |
| POST /accounts/catalog/activation-preview                   | Granska 1–100 unika katalog-UUID                  |
| POST /accounts/catalog/activate                             | Bekräftad atomisk aktivering/återaktivering       |
| POST /accounts/catalog/provision                            | Lägg till saknade standardkonton i företaget      |
| POST /accounts/catalog/framework                            | OWNER/ADMIN, företagsnamn som bekräftelse         |
| GET /accounts?organizationId=…&activeOnly=true&q=…&limit=30 | Typahead: aktiva, behöriga konton                 |
| PATCH /accounts/:id                                         | Namn/beskrivning/momskod/aktiv; inga fria DB-fält |

READ_BOOKKEEPING styr läsning; MANAGE_ACCOUNTS ger OWNER/ADMIN/ACCOUNTANT aktivering.
MEMBER/READ_ONLY får inte skapa/aktivera/avaktivera. Regelverk kräver UPDATE_ORGANIZATION.
Query-typer och enumroller definieras centralt. Existerande get/create/update-rutter
behålls. DELETE införs inte; ett konto med historik får aldrig raderas.

## Provisioning och aktivering

Organisationen låses FOR UPDATE vid provisioning/aktivering; unika kontonummer
ger ytterligare skydd mot samtidiga dubbletter. Nyföretag provisioneras i befintlig
organisation/onboarding-transaktion, även via plattformsadmins företagskapande.
För gamla företag behålls ID, eget namn, momskod, typ/normalbalans och medvetet
aktiv/inaktivt val. Endast saknade standardkonton skapas. Typ-/normalbalanskonflikter
rapporteras; äldre egna konton etiketteras inte retroaktivt som BAS-proveniens.

Preview returnerar selected/alreadyActive/canAdd/notAllowed och orsaker för varje
vald post. Confirmation revaliderar samma urval i DB-transaktionen — preview är inte
en säkerhetsbiljett. Blandat otillåtet urval ger inget delresultat. Kompatibelt befintligt
eget konto återaktiveras med samma ID och metadata. Konflikter kräver granskning.
Varje ny aktivering och standardprovisionering har immutable audit med actor/requestId.

K2/NOT_CONFIGURED blockerar `#`; K3 tillåter explicit aktivering. Backend samt DB:s
`bas_account_eligible` kontrollerar även manuella nummer utan provenance, så att
en egen kopia av ett begränsat nummer inte kringgår spärren. SQL-triggers och lås
skyddar journalrader, POSTED-övergång, mallreferenser, IB och regelverksbyte.

Avaktivering tar bort kontot från nyval och hindrar bokföring av äldre utkast/mallar
tills kontot återaktiverats. Historiska rapporter/IB/identiteter/snapshots lämnas kvar.
Exakt rättelse av en historisk post får behålla ett senare avaktiverat konto enligt
tidigare strikt inverteringskontrakt; detta ger inte fria nya bokföringsvärden.

## UI

Konton/Kontoplan behåller FAS 35-designsystemet: fyra flikar, verkliga counts,
sökning, klass/grupp/kategori/status/K2-filter, A–Ö/Ö–A/nummersortering, sidstorlek 50,
listvy och expanderbar gruppvy med parents. Gruppvy gäller den laddade sidan, inte
en påhittad fullständig trädlista. Namn visas utan tyst trunkering. Inga data laddas
för alla valfria konton i varje verifikationsrad.

Individuellt “Lägg till” och multiselect öppnar verklig preview-dialog; konton skapas
först efter bekräftelsen. K-regelverksdialog kräver företagsnamnet. Rollstyrda åtgärder,
debouncerad aktiv typeahead, serverpagination, AbortController och företagsnycklad
state skyddar tangentbordsarbete och företagsskifte. Ingen automatisk quick-add via
enbart inmatat kontonummer. Kontoredigering visar avaktiveringens konsekvenser.

## Bokföringsflöden

Utkast/postning/mallar/IB/årsöverföring använder samma eligibility och låser relevanta
konton/organisation under mutation. Carry-forward-resultat väljs efter typen EQUITY,
inte en gissad kontonummerprefixregel. Rapporter inkluderar korrekt tidigare bokföring
även om kontot senare avaktiverats; globala katalogrubriker duplicerar inte belopp.
Momsregler förblir i befintlig centralkonfiguration, ingen kontonummerbaserad auto-moms.

SIE-preview visar EXISTING/ACTIVATE_BAS/AVAILABLE_BAS/CREATE_CUSTOM/CONFLICT.
Endast faktiskt använda BAS-konton aktiveras och kräver extra
`acknowledgeAccountActivations=true`, utöver preview-token och explicit importconfirm.
Oförenliga K2-/typfall och oklar klass-8-metadata nekas. Samma kontoöversyn upprepas i
importtransaktionen med kalender-, fingerprint- och concurrency-skydd. Export
använder fortfarande företagets verkliga bokföring, inte den globala katalogen.
