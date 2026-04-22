import { normalizeFeatureConfig } from "./feature-config.utils";

describe("normalizeFeatureConfig", () => {
  it("defaults itemIdFormat to current when the flag is missing", () => {
    const normalized = normalizeFeatureConfig({
      enableItemList: true,
    });

    expect(normalized).toMatchObject({
      enableItemList: true,
      itemIdFormat: "current",
    });
  });

  it("defaults player focus highlight to disabled when the flag is missing", () => {
    const normalized = normalizeFeatureConfig({
      enableItemList: true,
    });

    expect(normalized).toMatchObject({
      enableItemList: true,
      enablePlayerFocusHighlight: false,
    });
  });

  it("migrates legacy itemListMetadataColumns to metadataColumns", () => {
    const normalized = normalizeFeatureConfig({
      enableItemList: true,
      itemListMetadataColumns: ["colA", "colB"],
    });

    expect(normalized).toMatchObject({
      enableItemList: true,
      metadataColumns: {
        visible: ["colA", "colB"],
        order: ["colA", "colB"],
      },
    });
    expect(normalized).not.toHaveProperty("itemListMetadataColumns");
  });

  it("keeps canonical metadataColumns and strips legacy key", () => {
    const normalized = normalizeFeatureConfig({
      metadataColumns: {
        visible: ["visible-1"],
        order: ["order-1", "order-2"],
      },
      itemListMetadataColumns: ["legacy-1"],
    });

    expect(normalized).toMatchObject({
      metadataColumns: {
        visible: ["visible-1"],
        order: ["order-1", "order-2"],
      },
    });
    expect(normalized).not.toHaveProperty("itemListMetadataColumns");
  });

  it("fills missing metadataColumns order from visible list", () => {
    const normalized = normalizeFeatureConfig({
      metadataColumns: {
        visible: ["meta-1", "meta-2"],
      },
    });

    expect(normalized).toMatchObject({
      metadataColumns: {
        visible: ["meta-1", "meta-2"],
        order: ["meta-1", "meta-2"],
      },
    });
  });
});
