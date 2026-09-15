import {
  AccountType,
  BalanceSide,
  OrganizationMemberRole,
  Prisma,
  PrismaClient,
  VatCodeType
} from "@prisma/client";

if (process.env.NODE_ENV === "production") {
  throw new Error("The development seed must not run with NODE_ENV=production.");
}

const prisma = new PrismaClient();

const demoUser = {
  email: "demo@ledgerapp.local",
  displayName: "LedgerApp Demo"
};

const demoOrganization = {
  name: "Demo Bokföring AB",
  slug: "demo-bokforing-ab",
  organizationNumber: "559999-0001",
  defaultCurrency: "SEK"
};

const vatCodes = [
  {
    code: "MOMS25-UT",
    name: "Utgående moms 25 %",
    rate: new Prisma.Decimal("25.00"),
    type: VatCodeType.OUTPUT
  },
  {
    code: "MOMS25-IN",
    name: "Ingående moms 25 %",
    rate: new Prisma.Decimal("25.00"),
    type: VatCodeType.INPUT
  }
];

const chartOfAccounts = [
  {
    accountNumber: "1930",
    name: "Företagskonto / checkkonto / affärskonto",
    type: AccountType.ASSET,
    normalBalance: BalanceSide.DEBIT
  },
  {
    accountNumber: "2440",
    name: "Leverantörsskulder",
    type: AccountType.LIABILITY,
    normalBalance: BalanceSide.CREDIT
  },
  {
    accountNumber: "2611",
    name: "Utgående moms på försäljning inom Sverige, 25 %",
    type: AccountType.LIABILITY,
    normalBalance: BalanceSide.CREDIT,
    vatCode: "MOMS25-UT"
  },
  {
    accountNumber: "2641",
    name: "Debiterad ingående moms",
    type: AccountType.ASSET,
    normalBalance: BalanceSide.DEBIT,
    vatCode: "MOMS25-IN"
  },
  {
    accountNumber: "3001",
    name: "Försäljning inom Sverige, 25 %",
    type: AccountType.REVENUE,
    normalBalance: BalanceSide.CREDIT,
    vatCode: "MOMS25-UT"
  },
  {
    accountNumber: "4010",
    name: "Inköp av varor och material",
    type: AccountType.EXPENSE,
    normalBalance: BalanceSide.DEBIT
  },
  {
    accountNumber: "5410",
    name: "Förbrukningsinventarier",
    type: AccountType.EXPENSE,
    normalBalance: BalanceSide.DEBIT
  },
  {
    accountNumber: "6212",
    name: "Mobiltelefon",
    type: AccountType.EXPENSE,
    normalBalance: BalanceSide.DEBIT
  },
  {
    accountNumber: "6540",
    name: "IT-tjänster",
    type: AccountType.EXPENSE,
    normalBalance: BalanceSide.DEBIT
  },
  {
    accountNumber: "6990",
    name: "Övriga externa kostnader",
    type: AccountType.EXPENSE,
    normalBalance: BalanceSide.DEBIT
  }
];

function currentStockholmYear() {
  const yearPart = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Stockholm",
    year: "numeric"
  })
    .formatToParts(new Date())
    .find((part) => part.type === "year");

  if (!yearPart) {
    throw new Error("Could not determine the current Stockholm calendar year.");
  }

  return Number(yearPart.value);
}

function utcDate(year, monthIndex, day) {
  return new Date(Date.UTC(year, monthIndex, day));
}

async function seed() {
  const currentYear = currentStockholmYear();
  const fiscalYearStart = utcDate(currentYear, 0, 1);
  const fiscalYearEnd = utcDate(currentYear, 11, 31);

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { email: demoUser.email },
      update: {
        displayName: demoUser.displayName,
        isActive: true,
        passwordHash: null
      },
      create: {
        ...demoUser,
        // Authentication is intentionally outside Phase 2; no plaintext secret is seeded.
        passwordHash: null
      }
    });

    const organization = await tx.organization.upsert({
      where: { slug: demoOrganization.slug },
      update: {
        name: demoOrganization.name,
        organizationNumber: demoOrganization.organizationNumber,
        defaultCurrency: demoOrganization.defaultCurrency,
        isActive: true
      },
      create: demoOrganization
    });

    await tx.organizationMember.upsert({
      where: {
        organizationId_userId: {
          organizationId: organization.id,
          userId: user.id
        }
      },
      update: { role: OrganizationMemberRole.OWNER },
      create: {
        organizationId: organization.id,
        userId: user.id,
        role: OrganizationMemberRole.OWNER
      }
    });

    const fiscalYear = await tx.fiscalYear.upsert({
      where: {
        organizationId_startDate: {
          organizationId: organization.id,
          startDate: fiscalYearStart
        }
      },
      update: {
        name: String(currentYear),
        endDate: fiscalYearEnd,
        status: "OPEN",
        closedAt: null,
        closedById: null
      },
      create: {
        organizationId: organization.id,
        name: String(currentYear),
        startDate: fiscalYearStart,
        endDate: fiscalYearEnd
      }
    });

    for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
      const periodNumber = monthIndex + 1;
      const startDate = utcDate(currentYear, monthIndex, 1);
      const endDate = utcDate(currentYear, monthIndex + 1, 0);

      await tx.accountingPeriod.upsert({
        where: {
          organizationId_fiscalYearId_periodNumber: {
            organizationId: organization.id,
            fiscalYearId: fiscalYear.id,
            periodNumber
          }
        },
        update: { startDate, endDate, status: "OPEN", lockedAt: null, lockedById: null },
        create: {
          organizationId: organization.id,
          fiscalYearId: fiscalYear.id,
          periodNumber,
          startDate,
          endDate
        }
      });
    }

    await tx.voucherSeries.upsert({
      where: {
        organizationId_fiscalYearId_code: {
          organizationId: organization.id,
          fiscalYearId: fiscalYear.id,
          code: "A"
        }
      },
      update: { name: "Huvudserie", isActive: true },
      create: {
        organizationId: organization.id,
        fiscalYearId: fiscalYear.id,
        code: "A",
        name: "Huvudserie",
        nextVoucherNumber: 1
      }
    });

    const vatCodeIds = new Map();

    for (const vatCode of vatCodes) {
      const savedVatCode = await tx.vatCode.upsert({
        where: {
          organizationId_code: {
            organizationId: organization.id,
            code: vatCode.code
          }
        },
        update: {
          name: vatCode.name,
          rate: vatCode.rate,
          type: vatCode.type,
          isActive: true
        },
        create: { organizationId: organization.id, ...vatCode }
      });

      vatCodeIds.set(vatCode.code, savedVatCode.id);
    }

    for (const account of chartOfAccounts) {
      const { vatCode, ...accountData } = account;
      const vatCodeId = vatCode ? vatCodeIds.get(vatCode) : null;

      await tx.account.upsert({
        where: {
          organizationId_accountNumber: {
            organizationId: organization.id,
            accountNumber: account.accountNumber
          }
        },
        update: { ...accountData, vatCodeId, isActive: true },
        create: {
          organizationId: organization.id,
          ...accountData,
          vatCodeId
        }
      });
    }
  });

  console.info(
    "Seeded " +
      demoOrganization.name +
      " with " +
      chartOfAccounts.length +
      " BAS sample accounts for " +
      currentYear +
      "."
  );
}

try {
  await seed();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
