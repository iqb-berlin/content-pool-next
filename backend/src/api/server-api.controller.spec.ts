import { ServerApiController } from './server-api.controller';

describe('ServerApiController', () => {
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
      listAcps: jest.fn().mockResolvedValue([{ id: 'acp-1' }]),
      getAcpTransferData: jest.fn().mockResolvedValue({ id: 'acp-1', files: [] }),
      getAcpIndex: jest.fn().mockResolvedValue({ version: '0.5.0' }),
      updateAcpIndex: jest.fn().mockResolvedValue({ operation: 'updated' }),
      listFiles: jest.fn().mockResolvedValue([{ id: 'file-1' }]),
      getFile: jest.fn().mockResolvedValue({ id: 'file-1' }),
      downloadFile: jest.fn().mockResolvedValue({
        file: { originalName: 'unit.xml', fileType: 'text/xml' },
        buffer: Buffer.from('<xml/>'),
      }),
      uploadFiles: jest.fn().mockResolvedValue({ uploaded: 1 }),
      replaceCodingSchemeFiles: jest.fn().mockResolvedValue({ replacedFiles: [] }),
      receiveAcp: jest.fn().mockResolvedValue({ operation: 'created' }),
    };

    serverApiAuditService = {
      list: jest.fn().mockResolvedValue([{ id: 'log-1' }]),
    };

    controller = new ServerApiController(serverApiService as any, serverApiAuditService as any);
  });

  it('delegates ACP list/read/export/index operations to the service', async () => {
    await expect(controller.listAcps()).resolves.toEqual([{ id: 'acp-1' }]);
    await expect(controller.getAcp('acp-1')).resolves.toEqual({ id: 'acp-1', files: [] });
    await expect(controller.exportAcp('acp-1')).resolves.toEqual({ id: 'acp-1', files: [] });
    await expect(controller.getAcpIndex('acp-1')).resolves.toEqual({ version: '0.5.0' });

    expect(serverApiService.listAcps).toHaveBeenCalled();
    expect(serverApiService.getAcpTransferData).toHaveBeenNthCalledWith(1, 'acp-1');
    expect(serverApiService.getAcpTransferData).toHaveBeenNthCalledWith(2, 'acp-1');
    expect(serverApiService.getAcpIndex).toHaveBeenCalledWith('acp-1');
  });

  it('updates ACP index using strategy and optimistic timestamp', async () => {
    const result = await controller.updateAcpIndex(
      'acp-1',
      { acpIndex: { a: 1 }, expectedUpdatedAt: '2026-01-01T00:00:00.000Z' } as any,
      'merge',
    );

    expect(result).toEqual({ operation: 'updated' });
    expect(serverApiService.updateAcpIndex).toHaveBeenCalledWith(
      'acp-1',
      { a: 1 },
      'merge',
      '2026-01-01T00:00:00.000Z',
    );
  });

  it('delegates file listing/reading/uploading', async () => {
    const files = await controller.listFiles('acp-1');
    const oneFile = await controller.getFile('acp-1', 'file-1');

    const uploadResult = await controller.uploadFiles(
      'acp-1',
      [{ originalname: 'a.xml' } as Express.Multer.File],
      'overwrite',
    );

    expect(files).toEqual([{ id: 'file-1' }]);
    expect(oneFile).toEqual({ id: 'file-1' });
    expect(uploadResult).toEqual({ uploaded: 1 });

    expect(serverApiService.listFiles).toHaveBeenCalledWith('acp-1');
    expect(serverApiService.getFile).toHaveBeenCalledWith('acp-1', 'file-1');
    expect(serverApiService.uploadFiles).toHaveBeenCalledWith(
      'acp-1',
      [{ originalname: 'a.xml' }],
      'overwrite',
    );
  });

  it('streams downloaded files via response headers and buffer', async () => {
    const res = {
      setHeader: jest.fn(),
      send: jest.fn(),
    };

    await controller.downloadFile('acp-1', 'file-1', res as any);

    expect(serverApiService.downloadFile).toHaveBeenCalledWith('acp-1', 'file-1');
    expect(res.setHeader).toHaveBeenNthCalledWith(
      1,
      'Content-Disposition',
      'attachment; filename="unit.xml"',
    );
    expect(res.setHeader).toHaveBeenNthCalledWith(2, 'Content-Type', 'text/xml');
    expect(res.send).toHaveBeenCalledWith(Buffer.from('<xml/>'));
  });

  it('replaces coding scheme files with source client id from request', async () => {
    const result = await controller.replaceCodingSchemes(
      'acp-1',
      [{ originalname: 'test.vocs' } as Express.Multer.File],
      { changelog: 'new scheme', expectedUpdatedAt: '2026-01-01T00:00:00.000Z' } as any,
      { serverApiClient: { id: 'sync-client' } },
    );

    expect(result).toEqual({ replacedFiles: [] });
    expect(serverApiService.replaceCodingSchemeFiles).toHaveBeenCalledWith(
      'acp-1',
      [{ originalname: 'test.vocs' }],
      {
        changelog: 'new scheme',
        expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
        sourceClientId: 'sync-client',
      },
    );
  });

  it('delegates import endpoints and passes conflict strategy through', async () => {
    const payload = {
      packageId: 'pkg-1',
      name: 'ACP',
      acpIndex: { version: '0.5.0' },
    } as any;

    const importResult = await controller.importAcp(payload, 'merge');
    const legacyResult = await controller.receiveAcp(payload, 'overwrite');

    expect(importResult).toEqual({ operation: 'created' });
    expect(legacyResult).toEqual({ operation: 'created' });
    expect(serverApiService.receiveAcp).toHaveBeenNthCalledWith(1, payload, 'merge');
    expect(serverApiService.receiveAcp).toHaveBeenNthCalledWith(2, payload, 'overwrite');
  });

  it('uses parsed audit limit and defaults to 100 for invalid values', async () => {
    await expect(controller.getAuditLogs('50', 'acp.read', 'client-1')).resolves.toEqual([
      { id: 'log-1' },
    ]);
    await expect(controller.getAuditLogs('NaN', undefined, undefined)).resolves.toEqual([
      { id: 'log-1' },
    ]);

    expect(serverApiAuditService.list).toHaveBeenNthCalledWith(1, 50, 'acp.read', 'client-1');
    expect(serverApiAuditService.list).toHaveBeenNthCalledWith(2, 100, undefined, undefined);
  });
});
