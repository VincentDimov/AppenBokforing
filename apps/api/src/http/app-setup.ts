import { ValidationPipe, type INestApplication } from "@nestjs/common";
import cookieParser from "cookie-parser";
import helmet from "helmet";

const DEFAULT_DEVELOPMENT_CORS_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"];

function getCorsOrigins(): string[] | false {
  const configuredOrigins = (process.env.CORS_ORIGIN ?? process.env.WEB_ORIGIN)
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (configuredOrigins?.length) {
    return configuredOrigins;
  }

  return process.env.NODE_ENV === "production" ? false : DEFAULT_DEVELOPMENT_CORS_ORIGINS;
}

/** Applies the HTTP security, cookie, CORS and validation baseline to every app instance. */
export function configureHttpApp(app: INestApplication): void {
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    credentials: true,
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    origin: getCorsOrigins()
  });
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: false
      },
      validationError: {
        target: false,
        value: false
      },
      whitelist: true
    })
  );
}
