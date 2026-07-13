export type PreferenceIdentityColumn = "user_id" | "credential_id";

export function buildPatchPersonalItemPreferenceRowQuery(
  identityColumn: PreferenceIdentityColumn,
): string {
  const identityPredicate =
    identityColumn === "user_id"
      ? '"user_id" IS NOT NULL'
      : '"credential_id" IS NOT NULL';

  return `
    INSERT INTO "acp_item_preferences" (
      "id", "acp_id", "view_id", "user_id", "credential_id",
      "credential_username", "preferences", "created_at", "updated_at"
    )
    VALUES (
      uuid_generate_v4(), $1, $2, $3, $4, $5, $6::jsonb, now(), now()
    )
    ON CONFLICT ("acp_id", "view_id", "${identityColumn}")
      WHERE ${identityPredicate}
    DO UPDATE SET
      "preferences" = jsonb_set(
        COALESCE("acp_item_preferences"."preferences", '{}'::jsonb),
        '{rowData}',
        CASE
          WHEN $7::jsonb IS NULL THEN
            CASE
              WHEN jsonb_typeof("acp_item_preferences"."preferences"->'rowData') = 'object'
                THEN ("acp_item_preferences"."preferences"->'rowData') - $8::text
              ELSE '{}'::jsonb
            END
          ELSE
            CASE
              WHEN jsonb_typeof("acp_item_preferences"."preferences"->'rowData') = 'object'
                THEN "acp_item_preferences"."preferences"->'rowData'
              ELSE '{}'::jsonb
            END || jsonb_build_object($8::text, $7::jsonb)
        END,
        true
      ),
      "credential_username" = CASE
        WHEN EXCLUDED."credential_id" IS NOT NULL
          THEN EXCLUDED."credential_username"
        ELSE "acp_item_preferences"."credential_username"
      END,
      "updated_at" = now()
    WHERE $7::jsonb IS NULL
      OR (
        CASE
          WHEN jsonb_typeof("acp_item_preferences"."preferences"->'rowData') = 'object'
            THEN "acp_item_preferences"."preferences"->'rowData'
          ELSE '{}'::jsonb
        END
      ) ? $8::text
      OR (
        SELECT count(*)
        FROM jsonb_object_keys(
          CASE
            WHEN jsonb_typeof("acp_item_preferences"."preferences"->'rowData') = 'object'
              THEN "acp_item_preferences"."preferences"->'rowData'
            ELSE '{}'::jsonb
          END
        )
      ) < $9
    RETURNING 1 AS "updated"
  `;
}
