import { ArgumentMetadata, BadRequestException } from "@nestjs/common";
import { UuidRouteParamsPipe, assertUuidParam } from "./uuid-param";

describe("UUID route parameter validation", () => {
  const validUuid = "11111111-1111-4111-8111-111111111111";

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

  it("validates UUID route parameters but preserves semantic identifiers", () => {
    const pipe = new UuidRouteParamsPipe();
    const acpMetadata: ArgumentMetadata = {
      type: "param",
      metatype: String,
      data: "acpId",
    };
    const itemMetadata: ArgumentMetadata = {
      type: "param",
      metatype: String,
      data: "itemId",
    };

    expect(pipe.transform(validUuid, acpMetadata)).toBe(validUuid);
    expect(() =>
      pipe.transform("__coding-box-connection-test__", acpMetadata),
    ).toThrow(BadRequestException);
    expect(pipe.transform("DE_ITEM_01", itemMetadata)).toBe("DE_ITEM_01");
  });
});
