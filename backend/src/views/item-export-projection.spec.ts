import {
  getItemExportCell,
  ITEM_EXPORT_IDENTITY_COLUMNS,
  ITEM_EXPORT_IDENTITY_WITH_UUID_COLUMNS,
  ITEM_EXPORT_PARAMETER_COLUMNS,
  projectItemExportRow,
} from "./item-export-projection";

describe("item export projection", () => {
  it("defines Sub-ID and every shared parameter once for all serializers", () => {
    expect(ITEM_EXPORT_IDENTITY_COLUMNS.map((column) => column.header)).toEqual(
      ["Unit-ID", "Unit-Label", "Item-ID", "Sub-ID", "Zeilenschlüssel"],
    );
    expect(
      ITEM_EXPORT_IDENTITY_WITH_UUID_COLUMNS.map((column) => column.header),
    ).toEqual([
      "Unit-ID",
      "Unit-Label",
      "Item-ID",
      "Item-UUID",
      "Sub-ID",
      "Zeilenschlüssel",
    ]);
    expect(
      ITEM_EXPORT_PARAMETER_COLUMNS.map((column) => column.header),
    ).toEqual([
      "Empirische Itemschwierigkeit",
      "Infit",
      "Trennschärfe",
      "Lösungshäufigkeit",
      "Itemzeit (s)",
      "Stimuluszeit (s)",
      "Booklet",
      "Position im Booklet",
    ]);
  });

  it("projects item, personal and derived values into one typed row", () => {
    const projection = projectItemExportRow({
      rowKey: "uuid-1::A",
      item: {
        uuid: "uuid-1",
        rowKey: "uuid-1::A",
        subId: "A",
        itemId: "item-1",
        unitId: "unit-1",
        unitLabel: "Aufgabe 1",
        empiricalDifficulty: -0.25,
        infit: 1.05,
        discrimination: 0.4,
        solutionRate: 0.75,
        itemTimeSeconds: 20,
        stimulusTimeSeconds: 12,
        bookletOccurrences: [
          { booklet: "B1", position: 3 },
          { booklet: "B2", position: 8 },
        ],
      } as any,
      personalRow: {
        category: "II",
        tags: ["Prüfen"],
        note: "Notiz",
      },
      meanDifficultyByUnit: new Map([["unit-1", 0.5]]),
    });

    expect(projection).toEqual(
      expect.objectContaining({
        itemUuid: "uuid-1",
        subId: "A",
        rowKey: "uuid-1::A",
        category: "II",
        tags: ["Prüfen"],
        booklets: "B1 | B2",
        bookletPositions: "3 | 8",
        meanTaskDifficulty: 0.5,
      }),
    );
    expect(
      ITEM_EXPORT_IDENTITY_COLUMNS.map((column) =>
        getItemExportCell(projection, column),
      ),
    ).toEqual(["unit-1", "Aufgabe 1", "item-1", "A", "uuid-1::A"]);
  });

  it("keeps orphaned personal rows exportable by their stable row key", () => {
    expect(
      projectItemExportRow({
        rowKey: "removed-row",
        personalRow: { category: "III", note: "keep" },
      }),
    ).toEqual(
      expect.objectContaining({
        unitId: "",
        itemId: "",
        subId: null,
        rowKey: "removed-row",
        category: "III",
        note: "keep",
      }),
    );
  });
});
