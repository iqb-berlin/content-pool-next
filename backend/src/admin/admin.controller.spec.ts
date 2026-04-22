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
      uploadGeoGebraBundle: jest.fn().mockResolvedValue({
        geoGebraBundle: { sourceFileName: "bundle.zip" },
      }),
      deleteGeoGebraBundle: jest
        .fn()
        .mockResolvedValue({ geoGebraBundle: null }),
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

  it("uploads a GeoGebra bundle", async () => {
    const file = {
      originalname: "GeoGebra.itcr.zip",
    } as Express.Multer.File;

    await expect(controller.uploadGeoGebraBundle(file)).resolves.toEqual({
      geoGebraBundle: { sourceFileName: "bundle.zip" },
    });
    expect(adminService.uploadGeoGebraBundle).toHaveBeenCalledWith(file);
  });

  it("deletes the GeoGebra bundle", async () => {
    await expect(controller.deleteGeoGebraBundle()).resolves.toEqual({
      geoGebraBundle: null,
    });
    expect(adminService.deleteGeoGebraBundle).toHaveBeenCalledTimes(1);
  });
});
