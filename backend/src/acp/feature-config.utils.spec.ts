import { normalizeFeatureConfig } from "./feature-config.utils";

describe("normalizeFeatureConfig", () => {
  it("normalizes personal item working-data configuration", () => {
    expect(
      normalizeFeatureConfig({
        enablePersonalItemData: true,
        enableItemCollections: true,
        personalItemCategoryLabel: " Stufe ",
        personalItemCategoryValues: ["I", " I ", "II", ""],
        personalItemTagLabel: " Sichtung ",
        personalItemTags: [
          { label: "Prüfen", color: "#ABCDEF" },
          { label: "Prüfen", color: "#000000" },
          { label: "Offen", color: "invalid" },
        ],
      }),
    ).toMatchObject({
      enablePersonalItemData: true,
      enableItemCollections: true,
      personalItemCategoryLabel: "Stufe",
      personalItemCategoryValues: ["I", "II"],
      personalItemTagLabel: "Sichtung",
      personalItemTags: [
        { label: "Prüfen", color: "#abcdef" },
        { label: "Offen", color: "#3498db" },
      ],
    });
  });

  it("limits every personal item category value", () => {
    const longValue = "x".repeat(250);

    const normalized = normalizeFeatureConfig({
      personalItemCategoryValues: [longValue, `${"x".repeat(200)}duplicate`],
    });

    expect(normalized.personalItemCategoryValues).toEqual(["x".repeat(200)]);
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

  it("normalizes partial-credit labels", () => {
    const normalized = normalizeFeatureConfig({
      itemSubIdLabel: "  Kategorie  ",
      itemSubIdLabels: {
        " 1 ": "  teilweise richtig ",
        "2": "vollständig richtig",
        empty: "   ",
      },
    });

    expect(normalized).toMatchObject({
      itemSubIdLabel: "Kategorie",
      itemSubIdLabels: {
        "1": "teilweise richtig",
        "2": "vollständig richtig",
      },
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
