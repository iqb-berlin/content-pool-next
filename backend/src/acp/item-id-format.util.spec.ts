import {
  normalizeItemIdFormat,
  parseItemIdStructure,
  parseItemIdStructureFromCandidates,
} from "./item-id-format.util";

describe("item-id-format.util", () => {
  it("defaults unknown item id formats to current", () => {
    expect(normalizeItemIdFormat(undefined)).toBe("current");
    expect(normalizeItemIdFormat("other")).toBe("current");
  });

  it("parses the current item id format into structured sections", () => {
    expect(parseItemIdStructure("GHB00101a", "current")).toEqual({
      format: "current",
      subjectCode: "G",
      subjectLabel: "Deutsch Sekundar",
      competenceAreaCode: "H",
      competenceAreaLabel: "Hörverstehen / Zuhören",
      projectPoolCode: "B",
      projectPoolLabel: "BiStaTest / BT",
      taskNumber: "001",
      itemNumber: "01",
      variableIndicator: "A",
    });
  });

  it("parses the legacy item id format into structured sections", () => {
    expect(parseItemIdStructure("D1AB05", "legacy")).toEqual({
      format: "legacy",
      subjectCode: "D",
      subjectLabel: "Deutsch",
      competenceAreaCode: "1",
      competenceAreaLabel: "Zuhören",
      authorInitials: "AB",
      itemNumber: "05",
    });
  });

  it.each([
    ["D1AB05", "1", "Zuhören"],
    ["D2AB05", "2", "Orthografie"],
    ["D3AB05", "3", "Lesen"],
    ["D5AB05", "5", "Sprachgebrauch"],
  ])(
    "maps the German pilot item id %s to competence area %s (%s)",
    (itemId, competenceAreaCode, competenceAreaLabel) => {
      expect(parseItemIdStructure(itemId, "legacy")).toEqual(
        expect.objectContaining({
          subjectCode: "D",
          competenceAreaCode,
          competenceAreaLabel,
        }),
      );
    },
  );

  it("recognizes BKT as a project/pool in the current format", () => {
    expect(parseItemIdStructure("GXT00203", "current")).toEqual(
      expect.objectContaining({
        projectPoolCode: "T",
        projectPoolLabel: "BKT",
      }),
    );
  });

  it("selects a matching legacy candidate from a candidate list", () => {
    expect(
      parseItemIdStructureFromCandidates(
        ["Player 03", "D1_AUF0203", "uuid-1"],
        "legacy",
      ),
    ).toEqual({
      format: "legacy",
      subjectCode: "D",
      subjectLabel: "Deutsch",
      competenceAreaCode: "1",
      competenceAreaLabel: "Zuhören",
      authorInitials: "AU",
      itemNumber: "03",
    });
  });

  it("accepts non-German legacy ids without confusing player aliases for item ids", () => {
    expect(
      parseItemIdStructureFromCandidates(
        ["Player 01", "M1_CK1401", "uuid-1"],
        "legacy",
      ),
    ).toEqual({
      format: "legacy",
      subjectCode: "M",
      subjectLabel: "Mathematik",
      competenceAreaCode: "1",
      competenceAreaLabel: "1",
      authorInitials: "CK",
      itemNumber: "01",
    });
  });
});
