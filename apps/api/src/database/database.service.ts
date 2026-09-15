import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient, prisma } from "@ledgerapp/db";

/**
 * Nest-owned lifecycle wrapper around the workspace Prisma singleton.
 * Database clients remain centralized in @ledgerapp/db.
 */
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  readonly prisma: PrismaClient = prisma;

  async onModuleInit(): Promise<void> {
    await this.prisma.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
