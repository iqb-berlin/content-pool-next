import { CompleteCommentLifecycle1789300000000 } from "../migrations/1789300000000-CompleteCommentLifecycle";
import { join } from "path";

describe("CompleteCommentLifecycle migration", () => {
  const migration = new CompleteCommentLifecycle1789300000000() as any;
  const base = {
    id: "comment-1",
    acp_id: "acp-1",
    booklet_id: null,
    unit_id: null,
    item_id: null,
  };
  const targets = migration.collectTargets({
    assessmentParts: [
      {
        units: [
          { id: "unit-1", items: [{ id: "item-1" }] },
          { id: "unit_1", items: [{ id: "item-1" }] },
        ],
        instruments: [
          {
            testcenterBooklet: [
              { id: "booklet-1", modules: ["module-1", "shared"] },
              { id: "booklet-2", modules: ["shared"] },
            ],
          },
        ],
      },
    ],
  });

  it("maps stable unit and unique booklet targets", () => {
    expect(
      migration.resolveLegacyComment(
        { ...base, target_type: "UNIT", target_id: "unit-1" },
        targets,
      ),
    ).toMatchObject({ unitId: "unit-1", legacyReadOnly: false });
    expect(
      migration.resolveLegacyComment(
        {
          ...base,
          target_type: "TASK_SEQUENCE",
          target_id: "module-1",
        },
        targets,
      ),
    ).toMatchObject({
      targetType: "BOOKLET",
      bookletId: "booklet-1",
      legacyReadOnly: false,
    });
    expect(
      migration.resolveLegacyComment(
        {
          ...base,
          target_type: "ITEM",
          target_id: "legacy-value",
          unit_id: "unit-1",
          item_id: "item-from-unit-file",
        },
        targets,
      ),
    ).toMatchObject({
      unitId: "unit-1",
      itemId: "item-from-unit-file",
      legacyReadOnly: false,
    });
    expect(
      migration.resolveLegacyComment(
        {
          ...base,
          target_type: "ITEM",
          target_id: "unit-1_item-1",
        },
        targets,
      ),
    ).toMatchObject({
      unitId: "unit-1",
      itemId: "item-1",
      legacyReadOnly: false,
    });
  });

  it("uses top-level units when assessment parts contain no units", () => {
    const topLevelTargets = migration.collectTargets({
      units: [{ id: "top-unit", items: [{ id: "top-item" }] }],
      assessmentParts: [
        {
          bookletModules: [],
          instruments: [],
        },
      ],
    });

    expect(
      migration.resolveLegacyComment(
        { ...base, target_type: "UNIT", target_id: "top-unit" },
        topLevelTargets,
      ),
    ).toMatchObject({ unitId: "top-unit", legacyReadOnly: false });
    expect(
      migration.resolveLegacyComment(
        {
          ...base,
          target_type: "ITEM",
          target_id: "top-unit_top-item",
        },
        topLevelTargets,
      ),
    ).toMatchObject({
      unitId: "top-unit",
      itemId: "top-item",
      legacyReadOnly: false,
    });
  });

  it("maps a unique module to the canonical booklet ID from XML", () => {
    const xml = `
      <Booklet>
        <Metadata><Id>xml-booklet</Id><Label>XML Booklet</Label></Metadata>
        <Units><Unit id="unit-1" /></Units>
      </Booklet>
    `;
    const xmlTargets = migration.collectTargets(
      {
        units: [{ id: "unit-1" }],
        assessmentParts: [
          {
            instruments: [
              {
                testcenterBooklet: [
                  {
                    definitionId: "booklet.xml",
                    modules: ["module-from-index"],
                  },
                ],
              },
            ],
          },
        ],
      },
      new Map([["booklet.xml", xml]]),
    );

    expect(
      migration.resolveLegacyComment(
        {
          ...base,
          target_type: "TASK_SEQUENCE",
          target_id: "module-from-index",
        },
        xmlTargets,
      ),
    ).toMatchObject({
      targetType: "BOOKLET",
      bookletId: "xml-booklet",
      legacyReadOnly: false,
    });
  });

  it("loads referenced booklet definitions from the ACP file catalog", async () => {
    const queryRunner = {
      query: jest.fn().mockResolvedValue([
        {
          original_name: "review.xml",
          file_path: join(
            __dirname,
            "../../review/fixtures/review-booklet.xml",
          ),
        },
        {
          original_name: "unreferenced.xml",
          file_path: "/does/not/exist.xml",
        },
      ]),
    };

    const definitions = await migration.loadBookletDefinitions(
      queryRunner,
      "acp-1",
      {
        assessmentParts: [
          {
            instruments: [
              {
                testcenterBooklet: [{ definitionId: "review.xml" }],
              },
            ],
          },
        ],
      },
    );

    expect(definitions.get("review.xml")).toContain("<Id>review-1</Id>");
    expect(definitions.has("unreferenced.xml")).toBe(false);
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM "acp_files"'),
      ["acp-1"],
    );
  });

  it("reverts new targets to their closest legacy representation", async () => {
    const queryRunner = { query: jest.fn().mockResolvedValue(undefined) };

    await migration.down(queryRunner);

    const queries = queryRunner.query.mock.calls.map(([query]) => query);
    expect(queries).toHaveLength(9);
    expect(queries[0]).toContain(`"target_type" = 'TASK_SEQUENCE'`);
    expect(queries[0]).toContain(`WHERE "target_type" = 'BOOKLET'`);
    expect(queries[1]).toContain(`"target_type" = 'ITEM'`);
    expect(queries[1]).toContain(`WHERE "target_type" = 'CODING'`);
    expect(queries[3]).toContain(`('UNIT', 'ITEM', 'TASK_SEQUENCE')`);
    expect(queries[6]).toContain(`DROP INDEX IF EXISTS`);
    expect(queries[7]).toContain(`DROP COLUMN IF EXISTS "booklet_id"`);
    expect(queries[8]).toContain(`target <> '"BOOKLET"'::jsonb`);
  });

  it("keeps ambiguous or missing legacy targets read-only", () => {
    expect(
      migration.resolveLegacyComment(
        {
          ...base,
          target_type: "TASK_SEQUENCE",
          target_id: "shared",
        },
        targets,
      ),
    ).toMatchObject({
      targetType: "TASK_SEQUENCE",
      bookletId: null,
      legacyReadOnly: true,
    });
    expect(
      migration.resolveLegacyComment(
        { ...base, target_type: "ITEM", target_id: "item-1" },
        targets,
      ),
    ).toMatchObject({ legacyReadOnly: true });
    expect(
      migration.resolveLegacyComment(
        {
          ...base,
          target_type: "ITEM",
          target_id: "unit-1_missing-item",
        },
        targets,
      ),
    ).toMatchObject({
      unitId: null,
      itemId: null,
      legacyReadOnly: true,
    });
  });
});
