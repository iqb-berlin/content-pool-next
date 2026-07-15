import { BadRequestException } from "@nestjs/common";
import {
  ItemParameterImportPipeline,
  ItemParameterImportRequest,
} from "./item-parameter-import.pipeline";

describe("ItemParameterImportPipeline", () => {
  const pipeline = new ItemParameterImportPipeline();
  const items = [
    {
      uuid: "uuid-1",
      itemId: "I-1",
      unitId: "U-1",
      unitLabel: "Aufgabe 1",
    },
    {
      uuid: "uuid-2",
      itemId: "I-2",
      unitId: "U-1",
      unitLabel: "Aufgabe 1",
    },
  ] as ItemParameterImportRequest["items"];

  it("plans explicit row, item and unit mutations before applying them", () => {
    const request: ItemParameterImportRequest = {
      fileBuffer: Buffer.from(
        "item;sub_id;est;item_time_s;stimulus_time_s\nI1;A;0,25;20;12",
      ),
      items,
      itemProperties: {
        "uuid-1": { tags: ["keep"], stimulusTimeSeconds: 5 },
        "uuid-1::A": {
          itemUuid: "uuid-1",
          subId: "A",
          itemTimeSeconds: 3,
          stimulusTimeSeconds: 5,
        },
        "uuid-2": { stimulusTimeSeconds: 5 },
      },
    };

    const plan = pipeline.buildPlan(request);
    expect(plan.mutations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "set",
          scope: "row",
          property: "empiricalDifficulty",
          targetKeys: ["uuid-1::A"],
        }),
        expect.objectContaining({
          action: "set",
          scope: "item",
          property: "itemTimeSeconds",
          targetKeys: ["uuid-1"],
        }),
        expect.objectContaining({
          action: "set",
          scope: "unit",
          property: "stimulusTimeSeconds",
          targetKeys: ["uuid-2"],
        }),
        expect.objectContaining({
          action: "keep",
          scope: "row",
          property: "infit",
        }),
      ]),
    );
    expect(
      plan.mutations
        .filter((mutation) => mutation.action === "keep")
        .every((mutation) => !("targetKeys" in mutation)),
    ).toBe(true);
    expect(plan.mutations).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: "row",
          property: "itemTimeSeconds",
        }),
      ]),
    );
    expect(plan.mutations).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: "row",
          property: "stimulusTimeSeconds",
        }),
      ]),
    );

    expect(pipeline.applyPlan(request.itemProperties, plan)).toEqual({
      "uuid-1": {
        tags: ["keep"],
        itemTimeSeconds: 20,
        stimulusTimeSeconds: 12,
      },
      "uuid-1::A": {
        itemUuid: "uuid-1",
        subId: "A",
        empiricalDifficulty: 0.25,
      },
      "uuid-2": { stimulusTimeSeconds: 12 },
    });
  });

  it("distinguishes an absent column from an explicitly empty value", () => {
    const result = pipeline.execute({
      fileBuffer: Buffer.from("item;est\nI1;"),
      items,
      itemProperties: {
        "uuid-1": { empiricalDifficulty: 0.4, infit: 1.05 },
      },
    });

    expect(result.nextItemProperties).toEqual({
      "uuid-1": { infit: 1.05 },
    });
  });

  it("parses BOM, quoted Sub-IDs, decimal commas and grouped booklet rows", () => {
    const result = pipeline.execute({
      fileBuffer: Buffer.from(
        '\uFEFFitem;sub_id;infit;booklet;position\nI1;"A;1";1,05;B2;8\nI1;"A;1";1.05;B1;3',
      ),
      items,
      itemProperties: {},
    });

    expect(result.nextItemProperties).toEqual({
      "uuid-1::A%3B1": {
        itemUuid: "uuid-1",
        subId: "A;1",
        infit: 1.05,
        bookletOccurrences: [
          { booklet: "B1", position: 3 },
          { booklet: "B2", position: 8 },
        ],
      },
    });
  });

  it("rejects structural conflicts without mutating the source properties", () => {
    const itemProperties = { "uuid-1": { infit: 0.9 } };

    expect(() =>
      pipeline.execute({
        fileBuffer: Buffer.from(
          "item;infit;booklet;position\nI1;1.0;B1;1\nI1;1.1;B2;2",
        ),
        items,
        itemProperties,
      }),
    ).toThrow(BadRequestException);
    expect(itemProperties).toEqual({ "uuid-1": { infit: 0.9 } });
  });

  it("fans a standard row out to existing partial-credit rows without deleting them", () => {
    const result = pipeline.execute({
      fileBuffer: Buffer.from("item;est\nI1;0.5"),
      items,
      itemProperties: {
        "uuid-1": { empiricalDifficulty: 0.1, tags: ["base"] },
        "uuid-1::A": {
          itemUuid: "uuid-1",
          subId: "A",
          empiricalDifficulty: 0.2,
          tags: ["partial"],
        },
        "uuid-1::B": {
          itemUuid: "uuid-1",
          subId: "B",
          empiricalDifficulty: 0.8,
        },
      },
      requireEmpiricalDifficulty: true,
    });

    expect(result.nextItemProperties).toEqual({
      "uuid-1": { tags: ["base"] },
      "uuid-1::A": {
        itemUuid: "uuid-1",
        subId: "A",
        empiricalDifficulty: 0.5,
        tags: ["partial"],
      },
      "uuid-1::B": {
        itemUuid: "uuid-1",
        subId: "B",
        empiricalDifficulty: 0.5,
      },
    });
  });

  it("keeps the mutation plan linear for many items in one unit", () => {
    const manyItems = Array.from({ length: 500 }, (_, index) => ({
      uuid: `uuid-${index}`,
      itemId: `I-${index}`,
      unitId: "U-large",
      unitLabel: "Große Aufgabe",
    })) as ItemParameterImportRequest["items"];
    const csvRows = manyItems.map((item) => `${item.itemId};0.5`);

    const plan = pipeline.buildPlan({
      fileBuffer: Buffer.from(["item;est", ...csvRows].join("\n")),
      items: manyItems,
      itemProperties: {},
    });
    const keepMutations = plan.mutations.filter(
      (mutation) => mutation.action === "keep",
    );

    expect(keepMutations).toHaveLength(6);
    expect(keepMutations.every((mutation) => !("targetKeys" in mutation))).toBe(
      true,
    );
    expect(plan.mutations).toHaveLength(manyItems.length + 6);
  });
});
