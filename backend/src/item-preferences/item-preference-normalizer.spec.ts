import {
  normalizeItemPreferenceRowData,
  normalizeItemPreferences,
} from "./item-preference-normalizer";

describe("item preference normalizer", () => {
  it("normalizes all persisted preference sections", () => {
    expect(
      normalizeItemPreferences({
        ui: { filter: "keep" },
        tags: { item: [" A ", "A", ""] },
        rowData: {
          " row-1 ": {
            category: " II ",
            tags: [" Prüfen ", "Prüfen", ""],
            note: "Erste Zeile\r\nZweite Zeile",
            ignored: "value",
          },
        },
      }),
    ).toEqual({
      ui: { filter: "keep" },
      tags: { item: ["A"] },
      rowData: {
        "row-1": {
          category: "II",
          tags: ["Prüfen"],
          note: "Erste Zeile\nZweite Zeile",
        },
      },
    });
  });

  it("limits personal tags and rejects malformed rows", () => {
    const tags = Array.from({ length: 60 }, (_, index) => `tag-${index}`);
    const normalized = normalizeItemPreferenceRowData({
      valid: { tags },
      invalid: "not-an-object",
      " ": { note: "ignored" },
    });

    expect(normalized.valid.tags).toHaveLength(50);
    expect(normalized).not.toHaveProperty("invalid");
  });
});
