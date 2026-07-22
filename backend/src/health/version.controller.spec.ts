import { VersionController } from "./version.controller";

describe("VersionController", () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns release metadata from the environment", () => {
    process.env = {
      ...originalEnv,
      APP_VERSION: "0.2.0-rc.1",
      APP_COMMIT: "0123456789abcdef",
      APP_BUILT_AT: "2026-07-22T10:00:00Z",
    };

    expect(new VersionController().getVersion()).toEqual({
      version: "0.2.0-rc.1",
      commit: "0123456789abcdef",
      builtAt: "2026-07-22T10:00:00Z",
    });
  });

  it("uses explicit development defaults", () => {
    process.env = { ...originalEnv };
    delete process.env.APP_VERSION;
    delete process.env.APP_COMMIT;
    delete process.env.APP_BUILT_AT;

    expect(new VersionController().getVersion()).toEqual({
      version: "0.0.0-dev",
      commit: "local",
      builtAt: "unknown",
    });
  });
});
