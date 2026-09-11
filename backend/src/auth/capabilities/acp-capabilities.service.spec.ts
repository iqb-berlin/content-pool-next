import { AcpCapabilitiesService } from "./acp-capabilities.service";
import { ACP_CAPABILITIES } from "./acp-capabilities";

describe("ACP capability matrix", () => {
  for (const type of ["oidc", "credential"]) {
    for (let mask = 0; mask < 16; mask++) {
      const grants = ACP_CAPABILITIES.filter((_, i) => mask & (1 << i));
      it(`${type}: ${grants.join(",") || "none"}`, async () => {
        const credentials = {
          findOne: jest.fn().mockResolvedValue({
            capabilities: grants,
            accessConfig: { acpId: "a", accessModel: "CREDENTIALS_LIST" },
          }),
        };
        const roles = {
          findOne: jest
            .fn()
            .mockResolvedValue({ role: "READ_ONLY", capabilities: grants }),
        };
        const configs = {
          findOne: jest.fn().mockResolvedValue({ accessModel: "PRIVATE" }),
        };
        const service = new AcpCapabilitiesService(
          credentials as any,
          roles as any,
          configs as any,
        );
        for (const capability of ACP_CAPABILITIES) {
          const req = {
            params: { acpId: "a" },
            user: { type, sub: "u", acpId: "a" },
          };
          const expected =
            grants.includes(capability) ||
            (capability === "item-explorer:view" &&
              grants.includes("item-explorer:edit"));
          if (expected)
            await expect(
              service.assert(req, capability, true),
            ).resolves.toBeUndefined();
          else
            await expect(
              service.assert(req, capability, true),
            ).rejects.toThrow();
        }
      });
    }
  }
  it("revokes grants immediately without replacing tokens", async () => {
    const roles = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce({ capabilities: ["review:participate"] })
        .mockResolvedValue({ capabilities: [] }),
    };
    const service = new AcpCapabilitiesService(
      {} as any,
      roles as any,
      {} as any,
    );
    const req = { params: { acpId: "a" }, user: { type: "oidc", sub: "u" } };
    await expect(
      service.assert(req, "review:participate"),
    ).resolves.toBeUndefined();
    await expect(service.assert(req, "review:participate")).rejects.toThrow();
  });
  it("does not give administrators implicit participation", async () => {
    const service = new AcpCapabilitiesService(
      {} as any,
      { findOne: async () => null } as any,
      {} as any,
    );
    const req = {
      params: { acpId: "a" },
      user: { type: "oidc", sub: "u", isAppAdmin: true },
    };
    await expect(service.assert(req, "review:manage")).resolves.toBeUndefined();
    await expect(service.assert(req, "review:participate")).rejects.toThrow();
  });
  it("retains public reading without public editing or reviewing", async () => {
    const service = new AcpCapabilitiesService(
      {} as any,
      {} as any,
      {
        findOne: async () => ({ accessModel: "PUBLIC", featureConfig: {} }),
      } as any,
    );
    const req = { params: { acpId: "a" } };
    await expect(
      service.assert(req, "item-explorer:view", true),
    ).resolves.toBeUndefined();
    await expect(
      service.assert(req, "item-explorer:edit", true),
    ).rejects.toThrow();
    await expect(
      service.assert(req, "review:participate", true),
    ).rejects.toThrow();
  });
  it("rejects deleted and cross-ACP credentials", async () => {
    const credentials = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValue({ accessConfig: { acpId: "other" } }),
    };
    const service = new AcpCapabilitiesService(
      credentials as any,
      {} as any,
      {} as any,
    );
    const req = {
      params: { acpId: "a" },
      user: { type: "credential", sub: "u", acpId: "a" },
    };
    await expect(service.resolve(req)).rejects.toThrow();
    await expect(service.resolve(req)).rejects.toThrow();
  });
  it("retains public fallback with a credential token for another ACP", async () => {
    const service = new AcpCapabilitiesService(
      {} as any,
      {} as any,
      {
        findOne: async () => ({ accessModel: "PUBLIC", featureConfig: {} }),
      } as any,
    );
    const req = {
      params: { acpId: "public" },
      acpAccessLevel: "PUBLIC",
      user: { type: "credential", sub: "c", acpId: "other" },
    };
    await expect(
      service.assert(req, "item-explorer:view", true),
    ).resolves.toBeUndefined();
    await expect(service.assert(req, "review:participate")).rejects.toThrow();
  });
});
