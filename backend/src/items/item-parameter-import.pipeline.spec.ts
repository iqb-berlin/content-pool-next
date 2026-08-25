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
        "uuid-1": {
          empiricalDifficulty: 0.4,
          infit: 1.05,
          textComplexity: "hoch",
        },
      },
    });

    expect(result.nextItemProperties).toEqual({
      "uuid-1": { infit: 1.05, textComplexity: "hoch" },
    });
  });

  it("imports text_complexity as text, including numeric-looking content", () => {
    const result = pipeline.execute({
      fileBuffer: Buffer.from("item;text_complexity\nI1;3.5"),
      items,
      itemProperties: {},
    });

    expect(result.nextItemProperties).toEqual({
      "uuid-1": { textComplexity: "3.5" },
    });
    expect(typeof result.nextItemProperties["uuid-1"].textComplexity).toBe(
      "string",
    );
    expect(result.successes).toEqual([
      expect.objectContaining({ fields: ["text_complexity"] }),
    ]);
  });

  it("clears text_complexity only when the imported column is explicitly empty", () => {
    const result = pipeline.execute({
      fileBuffer: Buffer.from("item;text_complexity\nI1;"),
      items,
      itemProperties: {
        "uuid-1": { textComplexity: "hoch", infit: 1.05 },
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

  it("requires confirmation before ignoring a booklet column without position", () => {
    const request: ItemParameterImportRequest = {
      fileBuffer: Buffer.from("item;est;booklet\nI1;0.5;B1"),
      items,
      itemProperties: {
        "uuid-1": {
          empiricalDifficulty: 0.2,
          bookletOccurrences: [{ booklet: "OLD", position: 4 }],
        },
      },
    };

    const preview = pipeline.execute(request);
    expect(preview.requiresConfirmation).toBe(true);
    expect(preview.warnings).toEqual([
      expect.objectContaining({ code: "BOOKLET_OCCURRENCES_SKIPPED" }),
    ]);
    expect(preview.nextItemProperties).toEqual({
      "uuid-1": {
        empiricalDifficulty: 0.5,
        bookletOccurrences: [{ booklet: "OLD", position: 4 }],
      },
    });

    const confirmed = pipeline.execute({ ...request, confirmWarnings: true });
    expect(confirmed.requiresConfirmation).toBe(false);
    expect(confirmed.nextItemProperties).toEqual(preview.nextItemProperties);
  });

  it("preserves booklet occurrences when text_complexity has no complete occurrence pair", () => {
    const result = pipeline.execute({
      fileBuffer: Buffer.from(
        "item;text_complexity;booklet;position\nI1;hoch;;",
      ),
      items,
      itemProperties: {
        "uuid-1": {
          textComplexity: "niedrig",
          bookletOccurrences: [{ booklet: "OLD", position: 4 }],
        },
      },
      confirmWarnings: true,
    });

    expect(result.warnings).toEqual([
      expect.objectContaining({ code: "BOOKLET_OCCURRENCES_SKIPPED" }),
    ]);
    expect(result.nextItemProperties).toEqual({
      "uuid-1": {
        textComplexity: "hoch",
        bookletOccurrences: [{ booklet: "OLD", position: 4 }],
      },
    });
  });

  it.each([
    ["booklet", "item;booklet;est\nI1;B1;0.5"],
    ["position", "item;position;est\nI1;4;0.5"],
  ])(
    "does not infer the reserved %s column as a legacy Sub-ID",
    (_header, csv) => {
      const result = pipeline.execute({
        fileBuffer: Buffer.from(csv),
        items,
        itemProperties: {
          "uuid-1": {
            empiricalDifficulty: 0.2,
            bookletOccurrences: [{ booklet: "OLD", position: 4 }],
          },
        },
        requireEmpiricalDifficulty: true,
        confirmWarnings: true,
      });

      expect(result.nextItemProperties).toEqual({
        "uuid-1": {
          empiricalDifficulty: 0.5,
          bookletOccurrences: [{ booklet: "OLD", position: 4 }],
        },
      });
      expect(result.successes).toEqual([
        expect.objectContaining({
          rowKey: "uuid-1",
          affectedRowKeys: ["uuid-1"],
          subId: undefined,
          value: 0.5,
        }),
      ]);
    },
  );

  it("skips all booklet occurrences when complete and incomplete rows are mixed", () => {
    const result = pipeline.execute({
      fileBuffer: Buffer.from(
        "item;est;booklet;position\nI1;0.5;B1;1\nI1;0.5;B2;",
      ),
      items,
      itemProperties: {
        "uuid-1": {
          bookletOccurrences: [{ booklet: "OLD", position: 4 }],
        },
      },
      confirmWarnings: true,
    });

    expect(result.failed).toEqual([]);
    expect(result.requiresConfirmation).toBe(false);
    expect(result.nextItemProperties).toEqual({
      "uuid-1": {
        empiricalDifficulty: 0.5,
        bookletOccurrences: [{ booklet: "OLD", position: 4 }],
      },
    });
    expect(result.successes).toEqual([
      expect.objectContaining({ fields: ["est"] }),
    ]);
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

  it("rejects conflicting text_complexity values for grouped rows", () => {
    expect(() =>
      pipeline.execute({
        fileBuffer: Buffer.from(
          "item;text_complexity;booklet;position\nI1;hoch;B1;1\nI1;niedrig;B2;2",
        ),
        items,
        itemProperties: {},
      }),
    ).toThrow(BadRequestException);
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

    expect(keepMutations).toHaveLength(7);
    expect(keepMutations.every((mutation) => !("targetKeys" in mutation))).toBe(
      true,
    );
    expect(plan.mutations).toHaveLength(manyItems.length + 7);
  });
});
