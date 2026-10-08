import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { FiscalYearsModule } from "./fiscal-years.module";
import { FiscalYearsService } from "./fiscal-years.service";
import { DatabaseService } from "../database/database.service";
import { configureHttpApp } from "../http/app-setup";

describe("fiscal calendar HTTP authorization and confirmation", () => {
  let app: INestApplication;
  let role = "OWNER";
  const organizationId = "78a7b8ad-a4c6-4ab3-9f05-366ca03d2b84";
  const id = "d0301fba-2f52-42db-918a-db49b025cf30";
  const setPeriodStatus = jest.fn().mockResolvedValue({ status: "LOCKED" });
  beforeAll(async () => {
    const fixture = await Test.createTestingModule({ imports: [FiscalYearsModule] })
      .overrideProvider(DatabaseService)
      .useValue({
        prisma: {
          organizationMember: {
            findFirst: jest.fn(async (query) =>
              query.where.organizationId === organizationId &&
              query.where.organization.isActive === true
                ? { id, organizationId, role }
                : null
            )
          }
        }
      })
      .overrideProvider(FiscalYearsService)
      .useValue({ setPeriodStatus, close: jest.fn(), list: jest.fn().mockResolvedValue([]) })
      .compile();
    app = fixture.createNestApplication();
    configureHttpApp(app);
    app.use((req: { auth?: { id: string } }, _res: unknown, next: () => void) => {
      req.auth = { id };
      next();
    });
    await app.init();
  });
  afterAll(async () => app?.close());
  beforeEach(() => {
    role = "OWNER";
    setPeriodStatus.mockClear();
  });
  it("rejects absent/false confirmation on POST, including unlock and close", async () => {
    for (const path of [
      `accounting-periods/${id}/lock`,
      `accounting-periods/${id}/unlock`,
      `fiscal-years/${id}/close`
    ]) {
      await request(app.getHttpServer()).post(`/${path}`).send({ organizationId }).expect(400);
      await request(app.getHttpServer())
        .post(`/${path}`)
        .send({ organizationId, confirm: false })
        .expect(400);
    }
    expect(setPeriodStatus).not.toHaveBeenCalled();
  });
  it("permits viewing but denies READ_ONLY writes and foreign organization requests", async () => {
    role = "READ_ONLY";
    await request(app.getHttpServer()).get("/fiscal-years").query({ organizationId }).expect(200);
    await request(app.getHttpServer())
      .post(`/accounting-periods/${id}/lock`)
      .send({ organizationId, confirm: true })
      .expect(403);
    role = "OWNER";
    await request(app.getHttpServer())
      .post(`/accounting-periods/${id}/lock`)
      .send({ organizationId: id, confirm: true })
      .expect(404);
    expect(setPeriodStatus).not.toHaveBeenCalled();
  });
  it("allows accountants to lock but not close years", async () => {
    role = "ACCOUNTANT";
    await request(app.getHttpServer())
      .post(`/accounting-periods/${id}/lock`)
      .send({ organizationId, confirm: true })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/fiscal-years/${id}/close`)
      .send({ organizationId, confirm: true })
      .expect(403);
    expect(setPeriodStatus).toHaveBeenCalledWith(
      organizationId,
      id,
      id,
      true,
      expect.stringMatching(/^[a-f0-9-]{36}$/)
    );
  });
});
