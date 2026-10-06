import * as engine from "@ledgerapp/sie";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { SieController } from "./sie.controller";
import { SieService } from "./sie.service";
import { DatabaseService } from "../database/database.service";
import { JournalEntriesAccessService } from "../journal-entries/journal-entries-access.service";
import { configureHttpApp } from "../http/app-setup";
import { JSON_BODY_MAX_BYTES, SIE_IMPORT_MAX_BYTES } from "./sie-input-boundary";

describe("SIE HTTP transport (real controller, guard, parser and preview; isolated auth/DB)", () => {
  let app: INestApplication;
  let service: SieService;
  const organizationId = "78a7b8ad-a4c6-4ab3-9f05-366ca03d2b84";
  const fiscalYear = "d0301fba-2f52-42db-918a-db49b025cf30";
  const database = { prisma: { $transaction: jest.fn(), fiscalYear: { findFirst: jest.fn() } } };
  const preview = '#SIETYP 4\n#RAR 0 20260101 20261231\n#KONTO 1930 "Bank"\n';
  beforeAll(async () => {
    const fixture = await Test.createTestingModule({
      controllers: [SieController],
      providers: [
        SieService,
        { provide: DatabaseService, useValue: database },
        {
          provide: JournalEntriesAccessService,
          useValue: {
            requireMembership: jest.fn().mockResolvedValue({ organizationId, role: "OWNER" })
          }
        }
      ]
    }).compile();
    app = fixture.createNestApplication({ logger: false });
    service = fixture.get(SieService);
    configureHttpApp(app);
    app.use((req: { auth?: { id: string } }, _res: unknown, next: () => void) => {
      req.auth = { id: fiscalYear };
      next();
    });
    await app.init();
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => app?.close());

  it("downloads literal UTF-8 text, never HTML, with a fixed injection-proof filename", async () => {
    const payload = '#FNAMN "<html>ÅÄÖ<script>alert(1)</script>\r\nX-Injected: yes\u0001"\n';
    jest.spyOn(service, "export").mockResolvedValue(payload);
    const result = await request(app.getHttpServer())
      .get("/exports/sie")
      .query({ organizationId, fiscalYear })
      .expect(200);
    expect(result.headers["content-type"]).toBe("text/plain; charset=utf-8");
    expect(result.headers["content-disposition"]).toBe('attachment; filename="ledgerapp.sie"');
    expect(result.headers["x-content-type-options"]).toBe("nosniff");
    expect(result.headers["x-injected"]).toBeUndefined();
    expect(result.text).toBe(payload);
    expect(Number(result.headers["content-length"])).toBe(Buffer.byteLength(payload, "utf8"));
  });
  it("retains normal default-preview behavior without database writes", async () => {
    const result = await request(app.getHttpServer())
      .post("/imports/sie")
      .send({ organizationId, content: preview })
      .expect(201);
    expect(result.body).toMatchObject({
      mode: "PREVIEW",
      accountsFound: 1,
      vouchersFound: 0,
      fiscalYear: { start: "2026-01-01", end: "2026-12-31" },
      validationErrors: []
    });
    expect(database.prisma.$transaction).not.toHaveBeenCalled();
  });
  it("accepts the decoded boundary even with worst-case JSON escaping", async () => {
    const content = "\u0000".repeat(SIE_IMPORT_MAX_BYTES);
    const wire = JSON.stringify({ organizationId, content });
    expect(Buffer.byteLength(wire)).toBeLessThan(JSON_BODY_MAX_BYTES);
    await request(app.getHttpServer())
      .post("/imports/sie")
      .set("Content-Type", "application/json")
      .send(wire)
      .expect(201);
  });
  it.each([false, true])(
    "rejects oversized content before parsing/DB, confirm=%s",
    async (confirm) => {
      const parse = jest.spyOn(engine, "parseSie4");
      await request(app.getHttpServer())
        .post("/imports/sie")
        .send({ organizationId, content: "å".repeat(SIE_IMPORT_MAX_BYTES / 2 + 1), confirm })
        .expect(413)
        .expect(({ body }) => expect(body.message).toContain("131072"));
      expect(parse).not.toHaveBeenCalled();
      expect(database.prisma.fiscalYear.findFirst).not.toHaveBeenCalled();
      expect(database.prisma.$transaction).not.toHaveBeenCalled();
    }
  );
  it("returns a useful JSON 413 when the entire wire envelope exceeds its cap", async () => {
    await request(app.getHttpServer())
      .post("/imports/sie")
      .send({ organizationId, content: "x".repeat(JSON_BODY_MAX_BYTES) })
      .expect(413)
      .expect(({ body }) => expect(body.message).toMatch(/too large/i));
  });
});
