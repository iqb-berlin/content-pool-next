import { registerAs } from "@nestjs/config";

export default registerAs("app", () => ({
  port: parseInt(process.env.PORT || "3000", 10),
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:4200",
  jwtSecret: process.env.JWT_SECRET || "dev-secret-change-in-production",
  jwtExpiration: process.env.JWT_EXPIRATION || "24h",
  fileStoragePath: process.env.FILE_STORAGE_PATH || "./uploads",
  nodeEnv: process.env.NODE_ENV || "development",
}));
