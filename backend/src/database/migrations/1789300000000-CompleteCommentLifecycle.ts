import { MigrationInterface, QueryRunner } from "typeorm";
import { readFile } from "fs/promises";
import { SaxesParser } from "saxes";

type LegacyComment = {
  id: string;
  acp_id: string;
  target_type: "UNIT" | "ITEM" | "TASK_SEQUENCE" | "BOOKLET" | "CODING";
  target_id: string;
  booklet_id: string | null;
  unit_id: string | null;
  item_id: string | null;
};

type TargetCatalog = {
  units: Map<string, Set<string>>;
  booklets: Set<string>;
  moduleOwners: Map<string, Set<string>>;
};

const list = (value: unknown): any[] => (Array.isArray(value) ? value : []);
const reference = (value: any): string =>
  typeof value === "string"
    ? value.trim()
    : String(value?.moduleId || value?.id || "").trim();

type FrozenXmlNode = {
  name: string;
  attributes: Record<string, string>;
  text: string;
  path: string;
  children: FrozenXmlNode[];
};

class FrozenBookletStructureError extends Error {}

/**
 * Immutable snapshot of the booklet validation contract used when this
 * migration was introduced. Keep it local so later navigation changes cannot
 * alter the result of a fresh database migration.
 */
const parseFrozenBookletId = (xml: string, source: string): string => {
  const stack: FrozenXmlNode[] = [];
  let root: FrozenXmlNode | undefined;
  const fail = (message: string): never => {
    throw new FrozenBookletStructureError(
      `${stack.at(-1)?.path || source}: ${message}`,
    );
  };
  const parser = new SaxesParser({ xmlns: false });
  parser.on("doctype", () => fail("Booklet-DTDs werden nicht unterstützt."));
  parser.on("error", (error) =>
    fail(`Ungültiges Booklet-XML: ${error.message}`),
  );
  parser.on("opentag", (tag) => {
    if (stack.length >= 64)
      fail("Booklet-Verschachtelung überschreitet 64 Ebenen.");
    const parent = stack.at(-1);
    const index =
      parent?.children.filter((child) => child.name === tag.name).length || 0;
    const node: FrozenXmlNode = {
      name: tag.name,
      attributes: tag.attributes,
      text: "",
      path: `${parent?.path || source}/${tag.name}[${index}]`,
      children: [],
    };
    if (parent) parent.children.push(node);
    else root = node;
    stack.push(node);
  });
  const appendText = (text: string) => {
    if (stack.length) stack[stack.length - 1].text += text;
  };
  parser.on("text", appendText);
  parser.on("cdata", appendText);
  parser.on("closetag", () => stack.pop());
  parser.write(xml).close();

  if (!root || root.name !== "Booklet") fail("Wurzelelement Booklet fehlt.");
  const booklet = root!;
  const metadata = booklet.children.find((node) => node.name === "Metadata");
  const id =
    metadata?.children.find((node) => node.name === "Id")?.text.trim() || "";
  if (!id) fail("Booklet-ID fehlt.");
  const units = booklet.children.find((node) => node.name === "Units");
  if (!units) fail("Booklet-Aufgabenfolge fehlt.");

  const blockIds = new Set<string>();
  const navigation = (container: FrozenXmlNode): void => {
    const markers: Array<{ id: string; childCount: number }> = [];
    const addEntry = () => {
      const parent = markers.at(-1);
      if (parent) parent.childCount += 1;
    };
    for (const node of container.children) {
      if (node.name === "Restrictions") continue;
      if (node.name === "ProgressStart" || node.name === "Testlet") {
        const blockId = node.attributes.id?.trim();
        if (!blockId || blockIds.has(blockId))
          fail("Block-ID fehlt oder ist doppelt.");
        blockIds.add(blockId);
        addEntry();
        if (node.name === "ProgressStart")
          markers.push({ id: blockId, childCount: 0 });
        else navigation(node);
      } else if (node.name === "ProgressEnd") {
        const open = markers.at(-1);
        if (!open || (node.attributes.id && node.attributes.id !== open.id))
          fail("Fortschrittsmarker ist nicht passend geöffnet.");
        if (!open!.childCount) fail("Leerer Fortschrittsblock.");
        markers.pop();
      } else if (node.name === "Unit") {
        if (!node.attributes.id?.trim()) fail("Unit-ID fehlt.");
        addEntry();
      } else {
        fail(`Unbekanntes Navigationselement: ${node.name}`);
      }
    }
    if (markers.length) fail("Fortschrittsblock wurde nicht geschlossen.");
  };
  navigation(units!);
  return id;
};

export class CompleteCommentLifecycle1789300000000 implements MigrationInterface {
  name = "CompleteCommentLifecycle1789300000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Recreate the enum instead of ADD VALUE so BOOKLET can be used by the
    // backfill in the same transactional migration on all supported Postgres versions.
    await queryRunner.query(
      `ALTER TYPE "comments_target_type_enum" RENAME TO "comments_target_type_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "comments_target_type_enum" AS ENUM ('BOOKLET', 'UNIT', 'ITEM', 'CODING', 'TASK_SEQUENCE')`,
    );
    await queryRunner.query(`
      ALTER TABLE "comments"
      ALTER COLUMN "target_type" TYPE "comments_target_type_enum"
      USING "target_type"::text::"comments_target_type_enum"
    `);
    await queryRunner.query(`DROP TYPE "comments_target_type_enum_old"`);
    await queryRunner.query(`
      ALTER TABLE "comments"
        ADD COLUMN IF NOT EXISTS "booklet_id" character varying,
        ADD COLUMN IF NOT EXISTS "legacy_read_only" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_comments_booklet_target"
      ON "comments" ("acp_id", "booklet_id")
    `);

    const acps: Array<{ id: string; acp_index: unknown }> =
      await queryRunner.query(`SELECT "id", "acp_index" FROM "acp"`);
    for (const acp of acps) {
      const comments: LegacyComment[] = await queryRunner.query(
        `SELECT "id", "acp_id", "target_type", "target_id", "booklet_id", "unit_id", "item_id"
           FROM "comments" WHERE "acp_id" = $1`,
        [acp.id],
      );
      if (!comments.length) continue;
      const definitions = await this.loadBookletDefinitions(
        queryRunner,
        acp.id,
        acp.acp_index,
      );
      const parsedItems = await this.loadItemTargets(queryRunner, acp.id);
      const targets = this.collectTargets(
        acp.acp_index,
        definitions,
        parsedItems,
      );
      for (const comment of comments) {
        const update = this.resolveLegacyComment(comment, targets);
        await queryRunner.query(
          `UPDATE "comments"
              SET "target_type" = $2,
                  "booklet_id" = $3,
                  "unit_id" = $4,
                  "item_id" = $5,
                  "legacy_read_only" = $6
            WHERE "id" = $1`,
          [
            comment.id,
            update.targetType,
            update.bookletId,
            update.unitId,
            update.itemId,
            update.legacyReadOnly,
          ],
        );
      }
    }

    // Keep existing configuration behavior while exposing the new canonical
    // booklet target wherever legacy task-sequence comments were enabled.
    await queryRunner.query(`
      UPDATE "acp_access_configs"
         SET "feature_config" = jsonb_set(
           "feature_config",
           '{commentTargets}',
           CASE
             WHEN ("feature_config"->'commentTargets') ? 'TASK_SEQUENCE'
              AND NOT (("feature_config"->'commentTargets') ? 'BOOKLET')
             THEN ("feature_config"->'commentTargets') || '["BOOKLET"]'::jsonb
             ELSE COALESCE("feature_config"->'commentTargets', '[]'::jsonb)
           END,
           true
         )
       WHERE jsonb_typeof("feature_config"->'commentTargets') = 'array'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Preserve every comment in the legacy schema. The previous backend has no
    // dedicated booklet or coding target, so use its closest compatible types.
    await queryRunner.query(`
      UPDATE "comments"
         SET "target_type" = 'TASK_SEQUENCE',
             "target_id" = COALESCE(NULLIF("booklet_id", ''), "target_id")
       WHERE "target_type" = 'BOOKLET'
    `);
    await queryRunner.query(`
      UPDATE "comments"
         SET "target_type" = 'ITEM'
       WHERE "target_type" = 'CODING'
    `);

    await queryRunner.query(
      `ALTER TYPE "comments_target_type_enum" RENAME TO "comments_target_type_enum_new"`,
    );
    await queryRunner.query(
      `CREATE TYPE "comments_target_type_enum" AS ENUM ('UNIT', 'ITEM', 'TASK_SEQUENCE')`,
    );
    await queryRunner.query(`
      ALTER TABLE "comments"
      ALTER COLUMN "target_type" TYPE "comments_target_type_enum"
      USING "target_type"::text::"comments_target_type_enum"
    `);
    await queryRunner.query(`DROP TYPE "comments_target_type_enum_new"`);

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_comments_booklet_target"`,
    );
    await queryRunner.query(`
      ALTER TABLE "comments"
        DROP COLUMN IF EXISTS "legacy_read_only",
        DROP COLUMN IF EXISTS "booklet_id"
    `);

    await queryRunner.query(`
      UPDATE "acp_access_configs"
         SET "feature_config" = jsonb_set(
           "feature_config",
           '{commentTargets}',
           COALESCE(
             (
               SELECT jsonb_agg(target)
                 FROM jsonb_array_elements("feature_config"->'commentTargets') target
                WHERE target <> '"BOOKLET"'::jsonb
             ),
             '[]'::jsonb
           ),
           true
         )
       WHERE jsonb_typeof("feature_config"->'commentTargets') = 'array'
         AND ("feature_config"->'commentTargets') ? 'TASK_SEQUENCE'
         AND ("feature_config"->'commentTargets') ? 'BOOKLET'
    `);
  }

  private collectTargets(
    rawIndex: unknown,
    definitions: Map<string, string> = new Map(),
    parsedItems: Array<{ unitId: string; itemId: string }> = [],
  ): TargetCatalog {
    const units = new Map<string, Set<string>>();
    const booklets = new Set<string>();
    const moduleOwners = new Map<string, Set<string>>();

    const assessmentParts = list((rawIndex as any)?.assessmentParts);
    const partUnits = assessmentParts.flatMap((part) => list(part?.units));
    const indexUnits = partUnits.length
      ? partUnits
      : list((rawIndex as any)?.units);
    for (const unit of indexUnits) {
      const unitId = String(unit?.id || "").trim();
      if (!unitId || units.has(unitId)) continue;
      units.set(
        unitId,
        new Set(
          list(unit?.items)
            .map((item) => String(item?.id || "").trim())
            .filter(Boolean),
        ),
      );
    }

    // Frozen runtime catalog alias handling: prefixed file IDs already
    // represented by index items must not become additional canonical items.
    const indexAliases = new Set<string>();
    for (const [unitId, items] of units) {
      for (const itemId of items) {
        indexAliases.add(JSON.stringify([unitId, itemId]));
        indexAliases.add(JSON.stringify([unitId, `${unitId}_${itemId}`]));
      }
    }
    for (const item of parsedItems) {
      const unitId = item.unitId.trim();
      const itemId = item.itemId.trim();
      if (
        !unitId ||
        !itemId ||
        indexAliases.has(JSON.stringify([unitId, itemId]))
      )
        continue;
      const items = units.get(unitId) || new Set<string>();
      items.add(itemId);
      units.set(unitId, items);
    }

    const addBooklet = (bookletId: string, moduleIds: string[]) => {
      if (!bookletId || booklets.has(bookletId)) return;
      booklets.add(bookletId);
      for (const moduleId of moduleIds) {
        if (!moduleId) continue;
        const owners = moduleOwners.get(moduleId) || new Set<string>();
        owners.add(bookletId);
        moduleOwners.set(moduleId, owners);
      }
    };

    for (const part of assessmentParts) {
      for (const instrument of list(part?.instruments)) {
        for (const booklet of list(instrument?.testcenterBooklet)) {
          const moduleIds = list(booklet?.modules).map(reference);
          const definitionId = String(booklet?.definitionId || "").trim();
          const xml = definitionId ? definitions.get(definitionId) : undefined;
          if (xml !== undefined) {
            try {
              const parsedId = parseFrozenBookletId(xml, definitionId);
              const indexId = String(booklet?.id || "").trim();
              if (indexId && indexId !== parsedId) continue;
              addBooklet(indexId || parsedId, moduleIds);
            } catch (error) {
              if (!(error instanceof FrozenBookletStructureError)) throw error;
            }
          } else if (moduleIds.length) {
            // A missing stable ID is the legacy navigation-only representation.
            addBooklet(String(booklet?.id || "").trim(), moduleIds);
          }
        }
      }
    }
    return { units, booklets, moduleOwners };
  }

  /** Frozen identity-only snapshot of ItemListParser and unit-file-parsing.
   * Future runtime parser changes must not alter this backfill. Fail closed on
   * unreadable sources rather than treating a partial catalog as unambiguous.
   */
  private async loadItemTargets(
    queryRunner: QueryRunner,
    acpId: string,
  ): Promise<Array<{ unitId: string; itemId: string }>> {
    const files: Array<{ original_name: string; file_path: string }> =
      await queryRunner.query(
        `SELECT "original_name", "file_path" FROM "acp_files" WHERE "acp_id" = $1`,
        [acpId],
      );
    const items: Array<{ unitId: string; itemId: string }> = [];
    for (const file of files) {
      const name = file.original_name.toLowerCase();
      if (
        !name.endsWith(".xml") ||
        name.startsWith("booklet") ||
        name.startsWith("testtaker")
      )
        continue;
      const xml = await readFile(file.file_path, "utf8");
      if (!xml.includes("<Unit")) continue;
      const unitId = xml.match(/<Id>([^<]+)<\/Id>/)?.[1]?.trim();
      if (!unitId) throw new Error(`Invalid unit ID in ${file.original_name}`);
      const metadataRef = xml
        .match(/<Reference>([^<]+)<\/Reference>/)?.[1]
        ?.trim();
      if (!metadataRef) continue;
      const metadataFile = files.find(
        (entry) =>
          entry.original_name === metadataRef ||
          entry.original_name === `${metadataRef}.json`,
      );
      if (!metadataFile)
        throw new Error(`Missing item metadata: ${metadataRef}`);
      const metadata = JSON.parse(
        await readFile(metadataFile.file_path, "utf8"),
      );
      const isRecord = (value: unknown): value is Record<string, any> =>
        value !== null && typeof value === "object" && !Array.isArray(value);
      const validProfile = (profile: unknown) =>
        isRecord(profile) &&
        (profile.entries === undefined ||
          (Array.isArray(profile.entries) && profile.entries.every(isRecord)));
      if (
        !isRecord(metadata) ||
        (metadata.profiles !== undefined &&
          !Array.isArray(metadata.profiles)) ||
        (metadata.items !== undefined && !Array.isArray(metadata.items))
      )
        throw new Error(`Invalid item metadata: ${metadataFile.original_name}`);
      for (const item of metadata.items || []) {
        if (
          !isRecord(item) ||
          typeof item.id !== "string" ||
          !item.id.trim() ||
          (item.profiles !== undefined &&
            (!Array.isArray(item.profiles) ||
              !item.profiles.every(validProfile)))
        )
          throw new Error(`Invalid item in ${metadataFile.original_name}`);
        items.push({ unitId, itemId: item.id.trim() });
      }
    }
    return items;
  }

  private async loadBookletDefinitions(
    queryRunner: QueryRunner,
    acpId: string,
    rawIndex: any,
  ): Promise<Map<string, string>> {
    const wanted = new Set<string>();
    for (const part of list(rawIndex?.assessmentParts)) {
      for (const instrument of list(part?.instruments)) {
        for (const booklet of list(instrument?.testcenterBooklet)) {
          const definitionId = String(booklet?.definitionId || "").trim();
          if (definitionId) wanted.add(definitionId);
        }
      }
    }
    if (!wanted.size) return new Map();

    const files: Array<{ original_name: string; file_path: string }> =
      await queryRunner.query(
        `SELECT "original_name", "file_path"
           FROM "acp_files"
          WHERE "acp_id" = $1`,
        [acpId],
      );
    const definitions = new Map<string, string>();
    for (const file of files) {
      if (!wanted.has(file.original_name)) continue;
      try {
        definitions.set(
          file.original_name,
          await readFile(file.file_path, "utf8"),
        );
      } catch {
        // Missing definitions remain visible through the manifest's legacy path.
      }
    }
    return definitions;
  }

  private resolveLegacyComment(comment: LegacyComment, targets: TargetCatalog) {
    const unchanged = {
      targetType: comment.target_type,
      bookletId: comment.booklet_id,
      unitId: comment.unit_id,
      itemId: comment.item_id,
      legacyReadOnly: false,
    };
    if (comment.target_type === "BOOKLET") {
      const bookletId = comment.booklet_id || comment.target_id;
      return {
        ...unchanged,
        bookletId,
        legacyReadOnly: !targets.booklets.has(bookletId),
      };
    }
    if (comment.target_type === "UNIT") {
      const unitId = comment.unit_id || comment.target_id;
      return {
        ...unchanged,
        unitId,
        legacyReadOnly: !targets.units.has(unitId),
      };
    }
    if (comment.target_type === "ITEM" || comment.target_type === "CODING") {
      if (comment.unit_id && comment.item_id) {
        return {
          ...unchanged,
          legacyReadOnly: !targets.units
            .get(comment.unit_id)
            ?.has(comment.item_id),
        };
      }
      const matches: Array<{ unitId: string; itemId: string }> = [];
      for (const [unitId, items] of targets.units) {
        for (const itemId of items) {
          if (
            comment.target_id === itemId ||
            comment.target_id === `${unitId}_${itemId}`
          ) {
            matches.push({ unitId, itemId });
          }
        }
      }
      return matches.length === 1
        ? {
            ...unchanged,
            unitId: matches[0].unitId,
            itemId: matches[0].itemId,
          }
        : { ...unchanged, legacyReadOnly: true };
    }
    const directBooklet = targets.booklets.has(comment.target_id)
      ? comment.target_id
      : undefined;
    const moduleBooklets = targets.moduleOwners.get(comment.target_id);
    const bookletId =
      directBooklet ||
      (moduleBooklets?.size === 1 ? [...moduleBooklets][0] : undefined);
    return bookletId
      ? {
          ...unchanged,
          targetType: "BOOKLET",
          bookletId,
        }
      : { ...unchanged, legacyReadOnly: true };
  }
}
