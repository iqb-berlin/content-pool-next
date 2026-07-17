import { ServerApiController } from "./server-api.controller";
import { SERVER_API_SCOPES_KEY } from "./server-api-scopes.decorator";
import { createServerApiRequest, TEST_UUIDS } from "../testing/test-fixtures";

describe("ServerApiController", () => {
  let controller: ServerApiController;
  let serverApiService: {
    listAcps: jest.Mock;
    getAcpTransferData: jest.Mock;
    getAcpIndex: jest.Mock;
    updateAcpIndex: jest.Mock;
    listFiles: jest.Mock;
    getFile: jest.Mock;
    downloadFile: jest.Mock;
    uploadFiles: jest.Mock;
    replaceCodingSchemeFiles: jest.Mock;
    receiveAcp: jest.Mock;
  };
  let serverApiAuditService: { list: jest.Mock };

  beforeEach(() => {
    serverApiService = {
      listAcps: jest.fn().mockResolvedValue([{ id: "acp-1" }]),
      getAcpTransferData: jest
        .fn()
        .mockResolvedValue({ id: "acp-1", files: [] }),
      getAcpIndex: jest.fn().mockResolvedValue({ version: "0.5.0" }),
      updateAcpIndex: jest.fn().mockResolvedValue({ operation: "updated" }),
      listFiles: jest.fn().mockResolvedValue([{ id: "file-1" }]),
      getFile: jest.fn().mockResolvedValue({ id: "file-1" }),
      downloadFile: jest.fn().mockResolvedValue({
        file: { originalName: "unit.xml", fileType: "text/xml" },
        buffer: Buffer.from("<xml/>"),
      }),
      uploadFiles: jest.fn().mockResolvedValue({ uploaded: 1 }),
      replaceCodingSchemeFiles: jest
        .fn()
        .mockResolvedValue({ replacedFiles: [] }),
      receiveAcp: jest.fn().mockResolvedValue({ operation: "created" }),
    };

    serverApiAuditService = {
      list: jest.fn().mockResolvedValue([{ id: "log-1" }]),
    };

    controller = new ServerApiController(
      serverApiService as any,
      serverApiAuditService as any,
    );
  });

  it("delegates ACP list/read/export/index operations to the service", async () => {
    await expect(controller.listAcps()).resolves.toEqual([{ id: "acp-1" }]);
    await expect(controller.getAcp("acp-1")).resolves.toEqual({
      id: "acp-1",
      files: [],
    });
    await expect(controller.exportAcp("acp-1")).resolves.toEqual({
      id: "acp-1",
      files: [],
    });
    await expect(controller.getAcpIndex("acp-1")).resolves.toEqual({
      version: "0.5.0",
    });

    expect(serverApiService.listAcps).toHaveBeenCalled();
    expect(serverApiService.getAcpTransferData).toHaveBeenNthCalledWith(
      1,
      "acp-1",
      undefined,
    );
    expect(serverApiService.getAcpTransferData).toHaveBeenNthCalledWith(
      2,
      "acp-1",
      undefined,
    );
    expect(serverApiService.getAcpIndex).toHaveBeenCalledWith(
      "acp-1",
      undefined,
    );
  });

  it("reports authenticated token scopes without requiring an ACP", () => {
    expect(
      Reflect.getMetadata(SERVER_API_SCOPES_KEY, controller.getCapabilities),
    ).toEqual([]);
    expect(
      controller.getCapabilities(
        createServerApiRequest({
          id: "coding-box",
          scopes: ["acp.read", "files.read"],
          allowedAcpIds: [TEST_UUIDS.acp],
        }),
      ),
    ).toEqual({
      clientId: "coding-box",
      scopes: ["acp.read", "files.read"],
      capabilities: {
        "acp.read": true,
        "transfer.read": false,
        "transfer.write": false,
        "index.read": false,
        "index.write": false,
        "files.read": true,
        "files.write": false,
        "audit.read": false,
      },
      allowedAcpIds: [TEST_UUIDS.acp],
    });
  });

  it("updates ACP index using strategy and optimistic timestamp", async () => {
    const result = await controller.updateAcpIndex(
      "acp-1",
      {
        acpIndex: { a: 1 },
        expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
      } as any,
      "merge",
    );

    expect(result).toEqual({ operation: "updated" });
    expect(serverApiService.updateAcpIndex).toHaveBeenCalledWith(
      "acp-1",
      { a: 1 },
      "merge",
      "2026-01-01T00:00:00.000Z",
      undefined,
    );
  });

  it("delegates file listing/reading/uploading", async () => {
    const files = await controller.listFiles("acp-1");
    const oneFile = await controller.getFile("acp-1", "file-1");

    const uploadResult = await controller.uploadFiles(
      "acp-1",
      [{ originalname: "a.xml" } as Express.Multer.File],
      "overwrite",
    );

    expect(files).toEqual([{ id: "file-1" }]);
    expect(oneFile).toEqual({ id: "file-1" });
    expect(uploadResult).toEqual({ uploaded: 1 });

    expect(serverApiService.listFiles).toHaveBeenCalledWith("acp-1", undefined);
    expect(serverApiService.getFile).toHaveBeenCalledWith(
      "acp-1",
      "file-1",
      undefined,
    );
    expect(serverApiService.uploadFiles).toHaveBeenCalledWith(
      "acp-1",
      [{ originalname: "a.xml" }],
      "overwrite",
      undefined,
    );
  });

  it("streams downloaded files via response headers and buffer", async () => {
    const res = {
      setHeader: jest.fn(),
      send: jest.fn(),
    };

    await controller.downloadFile("acp-1", "file-1", res as any);

    expect(serverApiService.downloadFile).toHaveBeenCalledWith(
      "acp-1",
      "file-1",
      undefined,
    );
    expect(res.setHeader).toHaveBeenNthCalledWith(
      1,
      "Content-Disposition",
      'attachment; filename="unit.xml"',
    );
    expect(res.setHeader).toHaveBeenNthCalledWith(
      2,
      "Content-Type",
      "text/xml",
    );
    expect(res.send).toHaveBeenCalledWith(Buffer.from("<xml/>"));
  });

  it("replaces coding scheme files with source client id from request", async () => {
    const result = await controller.replaceCodingSchemes(
      "acp-1",
      [{ originalname: "test.vocs" } as Express.Multer.File],
      {
        changelog: "new scheme",
        expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
      } as any,
      createServerApiRequest({ id: "sync-client" }),
    );

    expect(result).toEqual({ replacedFiles: [] });
    expect(serverApiService.replaceCodingSchemeFiles).toHaveBeenCalledWith(
      "acp-1",
      [{ originalname: "test.vocs" }],
      {
        changelog: "new scheme",
        expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
        sourceClientId: "sync-client",
      },
      null,
    );
  });

  it("delegates import endpoints and passes conflict strategy through", async () => {
    const payload = {
      packageId: "pkg-1",
      name: "ACP",
      acpIndex: { version: "0.5.0" },
    } as any;

    const importResult = await controller.importAcp(payload, "merge");
    const legacyResult = await controller.receiveAcp(payload, "overwrite");

    expect(importResult).toEqual({ operation: "created" });
    expect(legacyResult).toEqual({ operation: "created" });
    expect(serverApiService.receiveAcp).toHaveBeenNthCalledWith(
      1,
      payload,
      "merge",
      undefined,
    );
    expect(serverApiService.receiveAcp).toHaveBeenNthCalledWith(
      2,
      payload,
      "overwrite",
      undefined,
    );
  });

  it("uses parsed audit limit and defaults to 100 for invalid values", async () => {
    await expect(
      controller.getAuditLogs(
        "50",
        "acp.read",
        "client-1",
        createServerApiRequest({ allowedAcpIds: [TEST_UUIDS.acp] }),
      ),
    ).resolves.toEqual([{ id: "log-1" }]);
    await expect(
      controller.getAuditLogs("NaN", undefined, undefined),
    ).resolves.toEqual([{ id: "log-1" }]);

    expect(serverApiAuditService.list).toHaveBeenNthCalledWith(
      1,
      50,
      "acp.read",
      "client-1",
      [TEST_UUIDS.acp],
    );
    expect(serverApiAuditService.list).toHaveBeenNthCalledWith(
      2,
      100,
      undefined,
      undefined,
      undefined,
    );
  });
});
