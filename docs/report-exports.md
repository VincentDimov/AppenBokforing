# FAS 33: verifikationsrapport och CSV

`/reports/voucher/:id` (även `/app/...`) återanvänder journal- och bilage-API:ernas resursbehörighet. Inga mutationer, destruktiva knappar eller inbäddade dokument. Belopp och summor kommer från serverns Decimal-kontrakt. Rättelsekedjan har länkar åt båda håll.

Nya bokföringar fryser konto-ID, nummer och namn i `JournalLine.accountSnapshot`, på databasnivå för samtliga postningsvägar. Rättelser kopierar originalets snapshot. Befintlig immutable-line-trigger skyddar snapshot. Ingen historisk backfill: äldre rader förblir NULL, namnet skyddas mot framtida ändring och rapporten visar begränsningen. Projektnamn och kostnadsställen återanvänder FAS 29-snapshots. Företagsuppgifter och samlade rapporters kontorubriker är aktuella registeruppgifter; generell P0-07-historik är därför inte helt löst.

Huvudbok, saldobalans, resultat-, balans- och momsrapport använder ett gemensamt CSV-kontrakt. UTF-8 BOM, semikolon, CRLF och korrekt citering. Text med formelprefixer (även efter whitespace) skyddas med apostrof; separat validerade numeriska Decimal-strängar behåller negativa tecken och precision. Aldrig Number/parseFloat för pengar. Exporten avser senast laddad rapport och dess faktiska filter, inte osparade formulärändringar. Organisation, organisationsnummer, år, intervall, dimensioner och genereringstid ingår. Momsens anomalier och adaptervarningar exporteras också.

Minnesgränser: högst 20 000 rader i huvudbok/moms, 10 000 konton/IB och 30 000 CSV-rader. Servern hämtar gräns + 1 och avbryter med `REPORT_TOO_LARGE`; ingen trunkerad rapport presenteras som komplett. Inga nya obegränsade exportfrågor. Streaming för ännu större urval är framtida arbete.

A4-stilmall döljer navigation, knappar och filter, upprepar tabellhuvuden och håller totalsrader samman. PDF stöds genom webbläsarens utskrift; ingen binär PDF-generator påstås finnas. READ_ONLY kan läsa/exportera men får inga skrivbehörigheter.
