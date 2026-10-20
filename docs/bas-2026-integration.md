# BAS 2026 — integration och källgräns

Aktuell status 2026-10-20: **1 282 konton publicerade som standard i Neon** efter
uttryckligt användargodkännande av den kompletta kandidaten. Se
[publiceringsrapporten](bas-publication-2026-10-20.md) för källa, omfattning,
interna klassificeringar, historikbevarande och separat webbverifieringsstatus.
Nedanstående daterade blockerare beskriver tidigare tillstånd, inte dagens databas.

Status 2026-10-09: katalogarkitektur och verkliga bokföringsflöden är implementerade.
Release av den fullständiga officiella kontoplanen är **BLOCKED**, inte COMPLETE.
Ingen fullständig BAS-dataset har importerats eller lagts i Git/seed/produktionsassets.

Uppdatering FAS 37.1, 2026-10-11: se [full källavstämning](bas-source-reconciliation.md),
[ekonomisk klassificering](bas-account-classification.md) och
[aktuell releasegate](fas37-1-release-gate.md). Fulla förekomstnamn är nu
maskinellt korsmatchade; detta upphäver inte 2087-konflikten eller gransknings-/rättighetsgaten.

## Auktoritativa källor

Den begärda [officiella PDF:n](https://www.bas.se/wp-content/uploads/2026/04/BAS_kontoplan_2026_v2.pdf)
anger **BAS 2026 v1.1** på första sidan. `v2` i filnamnet är inte kontoplanens versionsnummer.
Alla 39 PDF-sidor har lästs maskinellt; första sidan har även inspekterats visuellt.
Den [officiella XLSX-utgåvan](https://www.bas.se/wp-content/uploads/2026/04/BAS_kontoplan_2026_v2.xlsx)
har lästs i sin helhet som kontrollkälla. Detta är inte en fullständig manuell
namn-, hierarki- eller redovisningsgranskning av samtliga rader.

PDF SHA-256: `efcfa2ea9dd40e824ed0a5b9bf98be286a0f723129874abc262df0a301a6bfd6`.
XLSX SHA-256: `a86b39937fab280d4e5db895c04c2af6e145695863d4845ff14eea5d0302328a`.
Källfilerna ligger separat från repositoryt i operatörens lokala granskningsmapp.

## Rättighetsgate

Fri PDF/XLS-nedladdning är inte bevis på rätt att integrera och kommersiellt
vidaredistribuera hela kontoplanen. BAS har en separat
[maskinläsbar produkt](https://www.bas.se/kontoplaner/kontoplanen-i-maskinlasbart-format/)
och [integrationsvillkor](https://www.bas.se/wp-content/uploads/2024/04/Allmanna-Villkor-atkomstnyckel.pdf).
Vid kontrollen 2026-10-09 var operatörens rättigheter för just denna SaaS och
avsedd distribution **NOT_ESTABLISHED**. Användarens senare uttryckliga
rättighetsattestering och publiceringsgodkännande dokumenteras i rapporten ovan;
de är inte en oberoende juridisk prövning.
En konvertering från PDF till JSON får inte användas för att kringgå villkoren.

Importeraren kräver en skyddad operatörsauktorisering, oberoende godkänd SHA-256,
licensreferens och klassificeringsgranskning. Attestationen är en teknisk spärr,
inte en automatisk juridisk prövning eller ersättning för licensbevis.

## Integrationskontrakt

Global, oföränderlig versionskatalog → företagets befintliga `Account` →
utkast/bokföring/mallar/IB/årsöverföring/SIE/rapporter. Företagskonton behåller
sin identitet och egna namn/momsinställningar. Global metadata ger ingen tenantåtkomst.

När en behörigen importerad version valts som global standard får nya företag
alla **bokföringsbara, obegränsade fyrsiffriga konton som slutar på 0** atomiskt.
Verkliga gruppkonton skiljs från huvudkonton; rubriker blir aldrig konton.
Samtliga underkonton och `#`-markerade huvudkonton är valfria. Aktivering av ett
huvudkonto aktiverar aldrig dess underkonton. Befintliga företag uppgraderas
genom en uttrycklig, idempotent provisioning-operation, inte vid en GET.

Utan godkänd katalog behålls tidigare lokal kontoplan och onboardingens lilla
egna startplan. UI redovisar att katalogen saknas; den påstår inte att en full BAS
eller färdig momsinställning finns. Befintliga data fortsätter att fungera.

K2 och NOT_CONFIGURED blockerar ny aktivering/bokföring på `#`-konton; K3 tillåter
uttryckligt val. Regelverksbyte med berörd aktiv/IB/bokförd historik kräver avstämning
och nekas utan historikomskrivning. K1 stöds inte av denna katalogintegration.

Se [modell/import](bas-account-catalog.md), [aktivering/API](bas-account-activation.md),
[källvalidering](bas-account-validation.md) och [full 37-punktsrapport/gate](fas37-release-gate.md).
Godkända tester är inte ett redovisnings-, skatte- eller regelgodkännande.
