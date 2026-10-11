# FAS 37.1 — CI-rotorsaker

De två bekräftade CI-felen har reproducerats och korrigerats utan att
försvaga produktionsskydd eller ta bort redovisningsassertions.

- Browser: verklig GET 429 lämnade räkenskapsårsväljaren utan option.
  Fixen omfattar deterministisk testbudget, verklig TTL-väntan och explicit
  felåterhämtning i gränssnittet. Rate limiting är fortsatt aktiv.
- Upgrade: en förberedd SELECT-plan återanvändes efter extern DDL som ändrat
  resultattyp. Verktyget återansluter före jämförelsen; migrationerna är oförändrade.
- Sanitiserad diagnostik redovisar steg, felkoder och jämförelsehashar utan
  anslutningshemligheter eller privata ekonomiska rader.

[Fullständig rotorsaksanalys, reproduktion och regressionsevidens](ci-fas37-1-root-cause.md).
[Samlad releasegate och verifieringsrapport](fas37-1-release-gate.md).
