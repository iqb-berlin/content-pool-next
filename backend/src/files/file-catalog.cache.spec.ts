import type { Repository } from "typeorm";
import { AcpFile } from "../database/entities";
import { FileCatalogCache } from "./file-catalog.cache";

describe("FileCatalogCache", () => {
  it("invalidates only entries belonging to the requested ACP", async () => {
    const fileRepository = {
      query: jest.fn(async (_sql: string, [acpId]: [string]) => [
        { count: "1", hash: `${acpId}-revision` },
      ]),
      find: jest.fn(
        async ({ where: { acpId } }: { where: { acpId: string } }) => [
          {
            id: `${acpId}-file`,
            acpId,
            originalName: `${acpId}.xml`,
            filePath: `/tmp/${acpId}.xml`,
          },
        ],
      ),
    } as unknown as Repository<AcpFile>;
    const cache = new FileCatalogCache(fileRepository);

    await expect(cache.get("acp-1")).resolves.toEqual(
      expect.objectContaining({ cacheStatus: "miss" }),
    );
    await expect(cache.get("acp-2")).resolves.toEqual(
      expect.objectContaining({ cacheStatus: "miss" }),
    );
    await expect(cache.get("acp-1")).resolves.toEqual(
      expect.objectContaining({ cacheStatus: "hit" }),
    );
    await expect(cache.get("acp-2")).resolves.toEqual(
      expect.objectContaining({ cacheStatus: "hit" }),
    );

    cache.invalidate("acp-1");

    await expect(cache.get("acp-1")).resolves.toEqual(
      expect.objectContaining({ cacheStatus: "miss" }),
    );
    await expect(cache.get("acp-2")).resolves.toEqual(
      expect.objectContaining({ cacheStatus: "hit" }),
    );
    expect(fileRepository.find).toHaveBeenCalledTimes(3);
  });
});
