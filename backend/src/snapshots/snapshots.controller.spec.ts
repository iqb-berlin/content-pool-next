import { SnapshotsController } from "./snapshots.controller";

describe("SnapshotsController", () => {
  let controller: SnapshotsController;
  let snapshotsService: any;

  beforeEach(() => {
    snapshotsService = {
      findByAcp: jest.fn().mockResolvedValue([{ id: "s-1" }]),
      findByIdInAcp: jest.fn().mockResolvedValue({ id: "s-1", acpId: "acp-1" }),
      create: jest.fn().mockResolvedValue({ id: "s-2", versionNumber: 2 }),
      restore: jest.fn().mockResolvedValue({ id: "acp-1", version: 2 }),
      diff: jest.fn().mockResolvedValue({ changed: ["unit-1"] }),
      diffWithCurrent: jest.fn().mockResolvedValue({ changed: ["unit-2"] }),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    controller = new SnapshotsController(snapshotsService);
  });

  it("lists snapshots by ACP", async () => {
    await expect(controller.findAll("acp-1")).resolves.toEqual([{ id: "s-1" }]);
    expect(snapshotsService.findByAcp).toHaveBeenCalledWith("acp-1");
  });

  it("gets one snapshot in ACP scope", async () => {
    await expect(controller.findOne("acp-1", "s-1")).resolves.toEqual({
      id: "s-1",
      acpId: "acp-1",
    });
    expect(snapshotsService.findByIdInAcp).toHaveBeenCalledWith("acp-1", "s-1");
  });

  it("creates snapshot with changelog", async () => {
    await expect(
      controller.create("acp-1", { changelog: "Release candidate" } as any),
    ).resolves.toEqual({
      id: "s-2",
      versionNumber: 2,
    });
    expect(snapshotsService.create).toHaveBeenCalledWith(
      "acp-1",
      "Release candidate",
    );
  });

  it("restores snapshot after ACP-scoped lookup", async () => {
    await expect(controller.restore("acp-1", "s-1")).resolves.toEqual({
      id: "acp-1",
      version: 2,
    });
    expect(snapshotsService.findByIdInAcp).toHaveBeenCalledWith("acp-1", "s-1");
    expect(snapshotsService.restore).toHaveBeenCalledWith("s-1");
  });

  it("returns snapshot diff after lookup", async () => {
    await expect(controller.diff("acp-1", "s-1")).resolves.toEqual({
      changed: ["unit-1"],
    });
    expect(snapshotsService.diff).toHaveBeenCalledWith("s-1");
  });

  it("returns snapshot diff against current state after lookup", async () => {
    await expect(controller.diffWithCurrent("acp-1", "s-1")).resolves.toEqual({
      changed: ["unit-2"],
    });
    expect(snapshotsService.diffWithCurrent).toHaveBeenCalledWith("s-1");
  });

  it("deletes snapshot after lookup and returns success message", async () => {
    await expect(controller.delete("acp-1", "s-1")).resolves.toEqual({
      message: "Snapshot deleted successfully",
    });
    expect(snapshotsService.findByIdInAcp).toHaveBeenCalledWith("acp-1", "s-1");
    expect(snapshotsService.delete).toHaveBeenCalledWith("s-1");
  });
});
