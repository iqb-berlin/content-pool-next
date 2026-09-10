import { registerBooklets } from "./register-booklets";

describe("registerBooklets", () => {
  it.each([
    { id: "existing", label: "Upload", definitionId: "other.xml" },
    { id: "changed", label: "Upload", definitionId: "existing.xml" },
  ])(
    "preserves configured identities when an upload conflicts: %j",
    (upload) => {
      const parts = [
        {
          instruments: [
            {
              id: "manual",
              testcenterBooklet: [
                {
                  id: "existing",
                  name: "Manual",
                  definitionId: "existing.xml",
                  modules: ["m1"],
                },
              ],
            },
          ],
        },
      ];
      const original = JSON.stringify(parts);
      const warnings = new Set<string>();
      registerBooklets(parts, [upload], warnings);
      expect(JSON.stringify(parts)).toBe(original);
      expect([...warnings]).toEqual([
        expect.stringContaining("Booklet-ID-Konflikt"),
      ]);
    },
  );

  it("keeps the assessment part and custom settings of existing references", () => {
    const reference = { definitionId: "b.xml", name: "Custom", modules: ["m"] };
    const parts = [
      { instruments: [] },
      { instruments: [{ id: "custom", testcenterBooklet: [reference] }] },
    ];
    const warnings = new Set<string>();
    registerBooklets(
      parts,
      [{ id: "b", label: "XML", definitionId: "b.xml" }],
      warnings,
    );
    expect(parts[0].instruments).toEqual([]);
    expect(reference).toEqual({
      id: "b",
      definitionId: "b.xml",
      name: "Custom",
      modules: ["m"],
    });
    expect(warnings.size).toBe(0);
  });
});
