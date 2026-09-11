import { BadRequestException } from "@nestjs/common";
import {
  AcpAccessConfig,
  AcpCredential,
  AcpUserRole,
} from "../database/entities";
import { ReviewController } from "./review.controller";

describe("ReviewController stale memberships", () => {
  it.each(["user", "credential"] as const)(
    "removes a deleted %s while saving config and preserves live members and groups",
    async (kind) => {
      const config = {
        id: "config",
        acpId: "acp",
        reviewConfigVersion: 1,
        reviewRevision: "0",
        featureConfig: { enableReview: true, commentVisibilityMode: "GROUP" },
        reviewGroups: [
          {
            id: "group",
            name: "Group",
            archived: false,
            members: [
              { kind, id: "deleted" },
              { kind, id: "live" },
            ],
          },
        ],
      };
      const manager = {
        findOne: jest.fn(async (entity, options) => {
          if (entity === AcpAccessConfig) return config;
          expect(entity).toBe(kind === "user" ? AcpUserRole : AcpCredential);
          return (options.where.userId || options.where.id) === "live"
            ? {}
            : null;
        }),
        find: jest.fn(async () => []),
        save: jest.fn(async (value) => value),
        transaction: async (fn: any): Promise<any> => fn(manager),
      };
      const controller = new ReviewController(
        { assert: jest.fn() } as any,
        {} as any,
        { manager, findOne: async () => config } as any,
      );
      const result = await controller.configure(
        "acp",
        {
          enableReview: false,
          visibilityMode: "GROUP",
          configVersion: 1,
          groups: config.reviewGroups.map((group) => ({
            ...group,
            name: "Renamed",
            archived: true,
          })),
        },
        {},
      );
      expect(result).toEqual({
        enableReview: false,
        visibilityMode: "GROUP",
        configVersion: 2,
        groups: [
          {
            id: "group",
            name: "Renamed",
            archived: true,
            members: [{ kind, id: "live" }],
          },
        ],
      });
      expect(config.reviewRevision).toBe("1");
      expect(manager.save).toHaveBeenCalledWith(config);
    },
  );

  it.each(["user", "credential"] as const)(
    "rejects newly assigned invalid %s identities even if another group contains them",
    async (kind) => {
      const config = {
        id: "config",
        reviewConfigVersion: 1,
        featureConfig: { commentVisibilityMode: "GROUP" },
        reviewGroups: [
          {
            id: "old-group",
            name: "Old",
            archived: false,
            members: [{ kind, id: "deleted" }],
          },
          { id: "new-group", name: "New", archived: false, members: [] },
        ],
      };
      const manager = {
        findOne: jest.fn(async (entity) =>
          entity === AcpAccessConfig ? config : null,
        ),
        save: jest.fn(),
        transaction: async (fn: any): Promise<any> => fn(manager),
      };
      const controller = new ReviewController(
        { assert: jest.fn() } as any,
        {} as any,
        { manager } as any,
      );
      await expect(
        controller.configure(
          "acp",
          {
            enableReview: true,
            visibilityMode: "GROUP",
            configVersion: 1,
            groups: config.reviewGroups.map((group) => ({
              ...group,
              members: [{ kind, id: "deleted" }],
            })),
          },
          {},
        ),
      ).rejects.toThrow(BadRequestException);
      expect(manager.save).not.toHaveBeenCalled();
    },
  );
});
