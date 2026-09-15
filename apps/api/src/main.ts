import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

import { AppModule } from "./app.module";
import { configureHttpApp } from "./http/app-setup";

const DEFAULT_API_PORT = 4000;
function parsePort(rawPort: string | undefined): number {
  if (rawPort === undefined) {
    return DEFAULT_API_PORT;
  }

  const port = Number(rawPort);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("API_PORT must be an integer between 1 and 65535.");
  }

  return port;
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const port = parsePort(process.env.API_PORT);
  const host = process.env.API_HOST ?? "0.0.0.0";

  configureHttpApp(app);
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle("LedgerApp API")
    .setDescription("REST API reference for LedgerApp.")
    .setVersion("0.1.0")
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, swaggerConfig);

  SwaggerModule.setup("docs", app, documentFactory);

  await app.listen(port, host);

  Logger.log(`LedgerApp API is listening on http://${host}:${port}`, "Bootstrap");
}

void bootstrap().catch(() => {
  Logger.error("LedgerApp API could not start. Check non-secret configuration.", "Bootstrap");
  process.exitCode = 1;
});
