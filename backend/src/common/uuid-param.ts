import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  Param,
  ParseUUIDPipe,
  PipeTransform,
} from "@nestjs/common";
import { isUUID } from "class-validator";
const UUID_ROUTE_PARAM_NAMES = new Set([
  "id",
  "acpId",
  "fileId",
  "snapshotId",
  "credentialId",
  "userId",
  "jobId",
  "tokenId",
  "collectionId",
]);

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

@Injectable()
export class UuidRouteParamsPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (
      metadata.type === "param" &&
      metadata.data &&
      UUID_ROUTE_PARAM_NAMES.has(metadata.data)
    ) {
      assertUuidParam(value, metadata.data);
    }
    return value;
  }
}
