import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { AcpItemPreference } from "../database/entities";
import { StablePreferenceIdentity } from "../item-preferences/preference-identity";
import { ItemCollectionState } from "./item-collection.models";

const COLLECTION_VIEW_ID = "item-explorer";

@Injectable()
export class ItemCollectionStore {
  constructor(
    @InjectRepository(AcpItemPreference)
    private readonly itemPreferenceRepository: Repository<AcpItemPreference>,
  ) {}

  async readPreferences(
    acpId: string,
    identity: StablePreferenceIdentity,
  ): Promise<Record<string, unknown> | null> {
    const record = await this.itemPreferenceRepository.findOne({
      where: this.getIdentityWhere(acpId, identity),
    });
    return record?.preferences || null;
  }

  async mutate(
    acpId: string,
    identity: StablePreferenceIdentity,
    createIfMissing: boolean,
    mutation: (preferences: Record<string, unknown>) => ItemCollectionState,
  ): Promise<ItemCollectionState> {
    return this.itemPreferenceRepository.manager.transaction(
      async (manager) => {
        if (createIfMissing) {
          await this.insertIfMissing(manager, acpId, identity);
        }

        const repository = manager.getRepository(AcpItemPreference);
        const record = await repository.findOne({
          where: this.getIdentityWhere(acpId, identity),
          lock: { mode: "pessimistic_write" },
        });
        if (!record) throw new NotFoundException("Item collection not found");

        const preferences = this.isRecord(record.preferences)
          ? { ...record.preferences }
          : {};
        const state = mutation(preferences);
        await manager.query(
          `
            UPDATE "acp_item_preferences"
            SET "preferences" = jsonb_set(
                  jsonb_set(
                    CASE
                      WHEN jsonb_typeof("preferences") = 'object'
                        THEN "preferences"
                      ELSE '{}'::jsonb
                    END,
                    '{collections}',
                    $2::jsonb,
                    true
                  ),
                  '{activeCollectionId}',
                  $3::jsonb,
                  true
                ),
                "credential_username" = CASE
                  WHEN $4::varchar IS NOT NULL THEN $4::varchar
                  ELSE "credential_username"
                END,
                "updated_at" = now()
            WHERE "id" = $1
          `,
          [
            record.id,
            JSON.stringify(state.collections),
            JSON.stringify(state.activeCollectionId),
            identity.kind === "credential"
              ? identity.credentialUsername || null
              : null,
          ],
        );
        return state;
      },
    );
  }

  private async insertIfMissing(
    manager: EntityManager,
    acpId: string,
    identity: StablePreferenceIdentity,
  ): Promise<void> {
    const identityColumn =
      identity.kind === "user" ? "user_id" : "credential_id";
    const identityPredicate = `"${identityColumn}" IS NOT NULL`;
    await manager.query(
      `
        INSERT INTO "acp_item_preferences" (
          "id", "acp_id", "view_id", "user_id", "credential_id",
          "credential_username", "preferences", "created_at", "updated_at"
        )
        VALUES (
          uuid_generate_v4(), $1, '${COLLECTION_VIEW_ID}', $2, $3, $4,
          '{"ui":{},"tags":{},"rowData":{}}'::jsonb, now(), now()
        )
        ON CONFLICT ("acp_id", "view_id", "${identityColumn}")
          WHERE ${identityPredicate}
        DO NOTHING
      `,
      [
        acpId,
        identity.kind === "user" ? identity.userId : null,
        identity.kind === "credential" ? identity.credentialId : null,
        identity.kind === "credential"
          ? identity.credentialUsername || null
          : null,
      ],
    );
  }

  private getIdentityWhere(
    acpId: string,
    identity: StablePreferenceIdentity,
  ): {
    acpId: string;
    viewId: string;
    userId?: string;
    credentialId?: string;
  } {
    return {
      acpId,
      viewId: COLLECTION_VIEW_ID,
      ...(identity.kind === "user"
        ? { userId: identity.userId }
        : { credentialId: identity.credentialId }),
    };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }
}
