import { Controller, Get } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";

export type BuildVersionPayload = {
  version: string;
  commit: string;
  builtAt: string;
};

@ApiExcludeController()
@Controller("version")
export class VersionController {
  @Get()
  getVersion(): BuildVersionPayload {
    return {
      version: process.env.APP_VERSION || "0.0.0-dev",
      commit: process.env.APP_COMMIT || "local",
      builtAt: process.env.APP_BUILT_AT || "unknown",
    };
  }
}
