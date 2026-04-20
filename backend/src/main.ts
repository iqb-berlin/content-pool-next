import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const isProduction = process.env.NODE_ENV === "production";

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS
  const corsOrigins = (process.env.CORS_ORIGIN || "http://localhost:4200")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins.length === 1 ? corsOrigins[0] : corsOrigins,
    credentials: true,
  });

  // API prefix
  app.setGlobalPrefix("api");

  // Swagger documentation (disabled in production by default)
  const swaggerEnabled =
    (
      process.env.SWAGGER_ENABLED || (!isProduction ? "true" : "false")
    ).toLowerCase() === "true";

  if (swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle("IQB ContentPool API")
      .setDescription("API for managing Assessment Content Packages")
      .setVersion("0.1.0")
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("api/docs", app, document);
  }

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`ContentPool API running on port ${port}`);
}
bootstrap();
