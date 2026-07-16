import {
  projectSimpleItemListEntry,
  simpleItemListKey,
} from "./simple-item-list-projection";

describe("simple item list projection", () => {
  it("projects an index item with its backend-provided mean", () => {
    expect(
      projectSimpleItemListEntry(
        { id: "unit-1", name: "Aufgabe 1" },
        { id: "item-1", name: "Item 1", sourceVariable: "V1" },
        -0.25,
      ),
    ).toEqual({
      itemId: "unit-1_item-1",
      unitId: "unit-1",
      unitName: "Aufgabe 1",
      name: "Item 1",
      sourceVariable: "V1",
      meanTaskDifficulty: -0.25,
    });
  });

  it("keeps unprefixed ids and omits a missing mean", () => {
    expect(
      projectSimpleItemListEntry(
        { id: "unit-1" },
        { id: "item-1", useUnitAliasAsPrefix: false },
      ),
    ).toEqual({
      itemId: "item-1",
      unitId: "unit-1",
      unitName: "unit-1",
      name: undefined,
      sourceVariable: undefined,
    });
    expect(simpleItemListKey("unit-1", "item-1")).not.toBe(
      simpleItemListKey("unit-1-item", "1"),
    );
  });
});
