# FAS 34: verklig dashboard

`GET /dashboard?organizationId=...&fiscalYear=...&fromDate=...&toDate=...` använder befintlig autentisering, medlemskontroll och READ_BOOKKEEPING. Inga nya skrivbehörigheter. Ett RepeatableRead-anrop ger konsekventa KPI:er, momsstatus, årsdiagram och senaste verifikationer. Validerad helårs-IB återanvänds; ogiltig IB ger tydligt fel.

Resultaträkningens gruppering finns i `income-groups.ts`. Både rapporten och månadsdiagrammet använder denna motor, metadata-klassificering och Decimal. Period/YTD summeras i PostgreSQL med groupBy; diagrammet använder en date_trunc-aggregation per konto/månad. Ingen journalradshämtning för inkomstsummorna och inga N+1-kontofrågor. Moms återanvänder befintlig radbaserad anomalimotor och svensk adapter, med högst 20 000 rader. Anomalier och varningar visas; inga regulatoriska compliance-påståenden.

KPI: intäkter (kredit minus debet på REVENUE), kostnader (debet minus kredit på EXPENSE), resultat = intäkter minus kostnader. Moms: in/ut/netto enligt momsrapporten. Utkast- och POSTED-antal är periodens verkliga verifikationer. Endast POSTED bidrar till pengar; bokförda rättelser ingår med sina tecken. Inga fejkade kund-/leverantörsfakturor, procentändringar eller bankkort: tillförlitlig bankkontoklassificering saknas.

Periodval: hela valda året, aktuell/föregående kalendermånad klippt mot året, eget validerat intervall. Period utanför året ger ingen påhittad data. Diagrammet visar tydligt hela räkenskapsåret, inklusive nollmånader; max 24 kalendermånader. Staplarnas geometriska bredd normaliseras med BigInt; alla belopp visas oförändrade serversträngar. Negativa staplar färgmarkeras och tabellen visar tecken.

Organisationsnyckel nollställer allt UI-state. AbortController och response-key (organisation/år/datum) stoppar sena svar vid byte. READ_ONLY/MEMBER ser inga mutation-snabbval. Fel, tomt företag och saknade IB är avsiktliga states. Inga produktionsvägar importerar dashboard-fixturer/mockvärden. Lokala enhets-, PG- och browsertester är inte verifiering av en cloud-deployment.
