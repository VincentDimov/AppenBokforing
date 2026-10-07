import { Controller, Get, Header, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { S3Client, HeadBucketCommand } from "@aws-sdk/client-s3";
import { Public } from "../auth/decorators/public.decorator";
import { DatabaseService } from "../database/database.service";
@Controller("ready")
export class ReadinessController {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService
  ) {}
  @Get()
  @Public()
  @Header("Cache-Control", "no-store")
  async ready() {
    const storage = new S3Client({
      endpoint: this.config.get<string>("S3_ENDPOINT"),
      region: this.config.get<string>("S3_REGION") ?? "eu-north-1",
      forcePathStyle: true,
      credentials: {
        accessKeyId: this.config.get<string>("S3_ACCESS_KEY_ID") ?? "",
        secretAccessKey: this.config.get<string>("S3_SECRET_ACCESS_KEY") ?? ""
      }
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.all([
          this.database.prisma.$queryRaw`SELECT 1`,
          storage.send(new HeadBucketCommand({ Bucket: this.config.get<string>("S3_BUCKET") }), {
            abortSignal: AbortSignal.timeout(2000)
          })
        ]),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("Readiness timeout")), 2500);
        })
      ]);
      return { status: "ready" };
    } catch {
      throw new ServiceUnavailableException({ status: "unavailable" });
    } finally {
      if (timer) clearTimeout(timer);
      storage.destroy();
    }
  }
}
