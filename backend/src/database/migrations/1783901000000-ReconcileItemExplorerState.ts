import { isDeepStrictEqual } from "node:util";
import { MigrationInterface, QueryRunner } from "typeorm";

type JsonObject = Record<string, unknown>;

interface DivergedExplorerStateRow {
  id: string;
  publishedState: JsonObject;
  draftState: JsonObject;
  itemProperties: JsonObject;
}

const missing = Symbol("missing");

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asJsonObject(value: unknown): JsonObject {
  return isJsonObject(value) ? value : {};
}

function hasOwn(source: JsonObject, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(source, key);
}

function extractTags(itemProperties: JsonObject): JsonObject {
  const tags: JsonObject = {};

  for (const [rawItemKey, rawProperties] of Object.entries(itemProperties)) {
    const itemKey = rawItemKey.trim();
    if (!itemKey || !isJsonObject(rawProperties)) {
      continue;
    }

    const rawTags = rawProperties.tags;
    if (!Array.isArray(rawTags)) {
      continue;
    }

    const normalizedTags = Array.from(
      new Set(
        rawTags
          .map((value) => String(value || "").trim())
          .filter((value) => value.length > 0),
      ),
    );
    if (normalizedTags.length > 0 || itemKey.includes("::")) {
      tags[itemKey] = normalizedTags;
    }
  }

  return tags;
}

function applyTagsToItemProperties(
  itemProperties: JsonObject,
  tags: JsonObject,
): JsonObject {
  const nextItemProperties: JsonObject = {};

  for (const [itemKey, rawProperties] of Object.entries(itemProperties)) {
    if (!isJsonObject(rawProperties)) {
      continue;
    }
    const nextProperties = { ...rawProperties };
    delete nextProperties.tags;
    if (Object.keys(nextProperties).length > 0) {
      nextItemProperties[itemKey] = nextProperties;
    }
  }

  for (const [itemKey, rawTags] of Object.entries(tags)) {
    if (!Array.isArray(rawTags)) {
      continue;
    }
    nextItemProperties[itemKey] = {
      ...asJsonObject(nextItemProperties[itemKey]),
      tags: rawTags,
    };
  }

  return nextItemProperties;
}

function rebaseObject(
  base: JsonObject,
  draft: JsonObject,
  published: JsonObject,
): JsonObject {
  const result: JsonObject = {};
  const keys = new Set([
    ...Object.keys(base),
    ...Object.keys(draft),
    ...Object.keys(published),
  ]);

  for (const key of keys) {
    const baseValue = hasOwn(base, key) ? base[key] : missing;
    const draftValue = hasOwn(draft, key) ? draft[key] : missing;
    const publishedValue = hasOwn(published, key) ? published[key] : missing;

    if (isDeepStrictEqual(draftValue, baseValue)) {
      if (publishedValue !== missing) {
        result[key] = publishedValue;
      }
      continue;
    }

    if (draftValue === missing) {
      continue;
    }

    if (
      isJsonObject(draftValue) &&
      isJsonObject(publishedValue) &&
      (baseValue === missing || isJsonObject(baseValue))
    ) {
      result[key] = rebaseObject(
        baseValue === missing ? {} : baseValue,
        draftValue,
        publishedValue,
      );
      continue;
    }

    result[key] = draftValue;
  }

  return result;
}

/**
 * Before direct item-property writes were unified with Item Explorer state,
 * explorer snapshots could lag behind the ACP domain record. Reconcile the
 * published snapshot and rebase pending draft changes field by field so that
 * neither newer domain data nor intentional draft edits are lost.
 */
export class ReconcileItemExplorerState1783901000000 implements MigrationInterface {
  name = "ReconcileItemExplorerState1783901000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(`
      SELECT
        state."id" AS "id",
        state."published_state" AS "publishedState",
        state."draft_state" AS "draftState",
        acp."item_properties" AS "itemProperties"
      FROM "acp_item_explorer_state" state
      INNER JOIN "acp" acp ON acp."id" = state."acp_id"
    `)) as DivergedExplorerStateRow[] | undefined;

    for (const row of rows || []) {
      const publishedState = asJsonObject(row.publishedState);
      const draftState = asJsonObject(row.draftState);
      const previousItemProperties = asJsonObject(
        publishedState.itemProperties,
      );
      const draftItemProperties = asJsonObject(draftState.itemProperties);
      const currentItemProperties = asJsonObject(row.itemProperties);
      const previousTags = asJsonObject(publishedState.tags);
      const draftTags = asJsonObject(draftState.tags);
      const currentTags = extractTags(currentItemProperties);
      const rebasedDraftTags = rebaseObject(
        previousTags,
        draftTags,
        currentTags,
      );
      const rebasedDraftItemProperties = rebaseObject(
        previousItemProperties,
        draftItemProperties,
        currentItemProperties,
      );
      const nextDraftItemProperties = isDeepStrictEqual(
        rebasedDraftTags,
        currentTags,
      )
        ? rebasedDraftItemProperties
        : applyTagsToItemProperties(
            rebasedDraftItemProperties,
            rebasedDraftTags,
          );

      const nextPublishedState = {
        ...publishedState,
        tags: currentTags,
        itemProperties: currentItemProperties,
      };
      const nextDraftState = {
        ...draftState,
        tags: rebasedDraftTags,
        itemProperties: nextDraftItemProperties,
      };
      if (
        isDeepStrictEqual(nextPublishedState, publishedState) &&
        isDeepStrictEqual(nextDraftState, draftState)
      ) {
        continue;
      }
      const status = isDeepStrictEqual(nextDraftState, nextPublishedState)
        ? "CLEAN"
        : "DIRTY";

      await queryRunner.query(
        `
          UPDATE "acp_item_explorer_state"
          SET
            "published_state" = $1::jsonb,
            "draft_state" = $2::jsonb,
            "status" = $3,
            "version" = "version" + 1,
            "published_version" = "published_version" + 1,
            "updated_at" = CURRENT_TIMESTAMP
          WHERE "id" = $4
        `,
        [
          JSON.stringify(nextPublishedState),
          JSON.stringify(nextDraftState),
          status,
          row.id,
        ],
      );
    }
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // The superseded snapshots cannot be reconstructed after reconciliation.
  }
}
