import { AdminController } from "./admin.controller";

describe("AdminController", () => {
  let controller: AdminController;
  let adminService: any;

  beforeEach(() => {
    adminService = {
      getSettings: jest
        .fn()
        .mockResolvedValue({ language: "de", logoUrl: "/logo.svg" }),
      updateSettings: jest
        .fn()
        .mockResolvedValue({ language: "en", logoUrl: "/logo.svg" }),
    };

    controller = new AdminController(adminService);
  });

  it("returns settings", async () => {
    await expect(controller.getSettings()).resolves.toEqual({
      language: "de",
      logoUrl: "/logo.svg",
    });
    expect(adminService.getSettings).toHaveBeenCalledTimes(1);
  });

  it("updates settings", async () => {
    const payload = { language: "en" };

    await expect(controller.updateSettings(payload)).resolves.toEqual({
      language: "en",
      logoUrl: "/logo.svg",
    });
    expect(adminService.updateSettings).toHaveBeenCalledWith(payload);
  });
});
