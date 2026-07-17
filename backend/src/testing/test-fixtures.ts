import { Acp, AcpFile } from "../database/entities";
import {
  AuthenticatedServerApiClient,
  AuthenticatedServerApiRequest,
} from "../api/server-api.types";

export const TEST_UUIDS = {
  acp: "11111111-1111-4111-8111-111111111111",
  otherAcp: "22222222-2222-4222-8222-222222222222",
  file: "33333333-3333-4333-8333-333333333333",
  otherFile: "44444444-4444-4444-8444-444444444444",
  unknownAcp: "99999999-9999-4999-8999-999999999999",
} as const;

export function createAcpFixture(overrides: Partial<Acp> = {}): Acp {
  return {
    id: TEST_UUIDS.acp,
    packageId: "pkg-1",
    name: "Test ACP",
    description: "Test fixture",
    acpIndex: {},
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  } as Acp;
}

export function createAcpFileFixture(
  overrides: Partial<AcpFile> = {},
): AcpFile {
  return {
    id: TEST_UUIDS.file,
    acpId: TEST_UUIDS.acp,
    filePath: "/uploads/test/file.json",
    originalName: "file.json",
    fileType: "application/json",
    fileSize: 2,
    checksum: "fixture-checksum",
    uploadedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  } as AcpFile;
}

export function createServerApiRequest(
  overrides: Partial<AuthenticatedServerApiClient> = {},
): AuthenticatedServerApiRequest {
  return {
    serverApiClient: {
      id: "test-client",
      scopes: [],
      allowedAcpIds: null,
      ...overrides,
    },
  } as AuthenticatedServerApiRequest;
}
