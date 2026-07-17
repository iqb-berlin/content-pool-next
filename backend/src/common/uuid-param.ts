import { BadRequestException, Param, ParseUUIDPipe } from "@nestjs/common";
import { isUUID } from "class-validator";

export const UuidParam = (name: string): ParameterDecorator =>
  Param(name, new ParseUUIDPipe());

export function assertUuidParam(
  value: unknown,
  name: string,
): asserts value is string {
  if (typeof value !== "string" || !isUUID(value)) {
    throw new BadRequestException(`${name} must be a valid UUID`);
  }
}
