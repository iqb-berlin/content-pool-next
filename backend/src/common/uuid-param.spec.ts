import {
  BadRequestException,
  Controller,
  Get,
  INestApplication,
  Param,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as request from "supertest";
import { assertUuidParam, UuidParam } from "./uuid-param";

@Controller("uuid-test/:acpId")
class ExplicitUuidTestController {
  @Get("items/:itemId")
  read(
    @UuidParam("acpId") acpId: string,
    @Param("itemId") itemId: string,
  ): { acpId: string; itemId: string } {
    return { acpId, itemId };
  }
}

describe("UUID route parameter validation", () => {
  const validUuid = "11111111-1111-4111-8111-111111111111";
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ExplicitUuidTestController],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("accepts syntactically valid UUID values independent of version", () => {
    expect(() => assertUuidParam(validUuid, "ACP ID")).not.toThrow();
    expect(() =>
      assertUuidParam("21f7f8de-8051-5b89-8680-0195ef798b6a", "ACP ID"),
    ).not.toThrow();
  });

  it("rejects malformed UUID values with bad request", () => {
    expect(() =>
      assertUuidParam("__coding-box-connection-test__", "ACP ID"),
    ).toThrow(BadRequestException);
  });

  it("validates only explicitly decorated UUID parameters", async () => {
    await request(app.getHttpServer())
      .get(`/uuid-test/${validUuid}/items/DE_ITEM_01`)
      .expect(200)
      .expect({ acpId: validUuid, itemId: "DE_ITEM_01" });

    await request(app.getHttpServer())
      .get("/uuid-test/not-a-uuid/items/DE_ITEM_01")
      .expect(400);
  });
});
