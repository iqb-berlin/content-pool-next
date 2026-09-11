import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { DataSource } from "typeorm";
import * as request from "supertest";
import {
  Acp,
  AcpAccessConfig,
  AcpUserRole,
  AcpCredential,
  User,
  Comment,
} from "../src/database/entities";
import { ReviewVisibilityGroups1789400000000 } from "../src/database/migrations/1789400000000-ReviewVisibilityGroups";
import { ReviewManifestService } from "../src/review/review-manifest.service";
import { UnitParserService } from "../src/files/unit-parser.service";

describe("Review visibility, groups and synchronization API", () => {
  jest.setTimeout(60000);
  let app: INestApplication, db: DataSource, server: any;
  let acpId: string, configId: string, config: any;
  let manager: string;
  const actors: { token: string; id: string; kind: "user" | "credential" }[] =
    [];
  const headers = (token: string) => ({ Authorization: `Bearer ${token}` });
  const api = () => `/api/acp/${acpId}/review/comments`;
  const configApi = () => `/api/view/acp/${acpId}/review/config`;
  const item = { targetType: "ITEM", unitId: "U", itemId: "I" };
  async function saveConfig(changes: any = {}) {
    const response = await request(server)
      .put(configApi())
      .set(headers(manager))
      .send({ ...config, ...changes })
      .expect(200);
    config = response.body;
    return config;
  }
  beforeAll(async () => {
    if (
      process.env.NODE_ENV !== "test" ||
      !process.env.DB_DATABASE?.includes("e2e")
    )
      throw new Error("Isolated e2e database required");
    const { AppModule } = await import("../src/app.module");
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ReviewManifestService)
      .useValue({
        getManifest: async () => ({
          booklets: [{ id: "B", name: "Booklet", units: [] }],
          units: [{ id: "U", items: [{ id: "I" }] }],
          issues: [],
        }),
      })
      .overrideProvider(UnitParserService)
      .useValue({
        getItemListFromFiles: async () => ({
          items: [{ unitId: "U", itemId: "I" }],
          codingSchemes: { U: {} },
        }),
      })
      .compile();
    app = module.createNestApplication();
    app.useLogger(["error"]);
    app.setGlobalPrefix("api");
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    server = app.getHttpServer();
    db = app.get(DataSource);
    // Exercise the actual migration in a separate schema, including pre-existing rows.
    const runner = db.createQueryRunner();
    await runner.connect();
    const schema = `review_migration_${Date.now()}`;
    try {
      await runner.query(`CREATE SCHEMA "${schema}"`);
      await runner.query(`SET search_path TO "${schema}"`);
      await runner.query(
        `CREATE TABLE acp_access_configs (acp_id uuid PRIMARY KEY, feature_config jsonb NOT NULL DEFAULT '{}')`,
      );
      await runner.query(
        `CREATE TABLE comments (id uuid PRIMARY KEY, acp_id uuid, comment_text text)`,
      );
      await runner.query(
        `INSERT INTO acp_access_configs VALUES ('10000000-0000-4000-8000-000000000001', '{"enableReview":false,"commentVisibilityMode":"PRIVATE"}')`,
      );
      await runner.query(
        `INSERT INTO comments VALUES ('10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'Preserved')`,
      );
      const migration = new ReviewVisibilityGroups1789400000000();
      await migration.up(runner);
      expect(
        (await runner.query(`SELECT comment_text, group_id FROM comments`))[0],
      ).toEqual({ comment_text: "Preserved", group_id: null });
      expect(
        (
          await runner.query(
            `SELECT review_groups, review_config_version, review_revision, feature_config FROM acp_access_configs`,
          )
        )[0],
      ).toMatchObject({
        review_groups: [],
        review_config_version: 1,
        review_revision: "0",
        feature_config: {
          enableReview: false,
          commentVisibilityMode: "PRIVATE",
        },
      });
      await runner.startTransaction();
      await runner.query(`UPDATE comments SET comment_text = 'Rolled back'`);
      expect(
        (
          await runner.query(`SELECT review_revision FROM acp_access_configs`)
        )[0].review_revision,
      ).toBe("1");
      await runner.rollbackTransaction();
      expect(
        (
          await runner.query(`SELECT review_revision FROM acp_access_configs`)
        )[0].review_revision,
      ).toBe("0");
      await migration.down(runner);
      expect(
        (await runner.query(`SELECT comment_text FROM comments`))[0]
          .comment_text,
      ).toBe("Preserved");
    } finally {
      await runner.query(`SET search_path TO public`);
      await runner.query(`DROP SCHEMA "${schema}" CASCADE`);
      await runner.release();
    }
    const triggerRunner = db.createQueryRunner();
    try {
      await new ReviewVisibilityGroups1789400000000().installRevisionTrigger(
        triggerRunner,
      );
    } finally {
      await triggerRunner.release();
    }
    const acp = await db.getRepository(Acp).save({
      packageId: `review-${Date.now()}`,
      name: "Review groups",
      acpIndex: { units: [{ id: "U", items: [{ id: "I" }] }] },
    });
    acpId = acp.id;
    const row = await db.getRepository(AcpAccessConfig).save({
      acpId,
      accessModel: "CREDENTIALS_LIST" as any,
      featureConfig: {
        enableReview: true,
        enableCommenting: true,
        commentTargets: ["BOOKLET", "UNIT", "ITEM", "CODING"],
        commentVisibilityMode: "PRIVATE",
      },
    });
    configId = row.id;
    const jwt = app.get(JwtService);
    for (let i = 0; i < 5; i++) {
      const isCredential = i === 2 || i === 3;
      if (isCredential) {
        const credential = await db.getRepository(AcpCredential).save({
          accessConfigId: configId,
          username: `review-${i}`,
          passwordHash: "unused",
          capabilities: ["review:participate"],
        });
        actors.push({
          id: credential.id,
          kind: "credential",
          token: jwt.sign({
            sub: credential.id,
            username: credential.username,
            type: "credential",
            acpId,
          }),
        });
      } else {
        const user = await db
          .getRepository(User)
          .save({ username: `review-${i}-${Date.now()}`, isAppAdmin: i === 4 });
        await db.getRepository(AcpUserRole).save({
          acpId,
          userId: user.id,
          role: i === 4 ? ("ACP_MANAGER" as any) : ("READ_ONLY" as any),
          capabilities:
            i === 4
              ? ["review:manage", "review:participate"]
              : ["review:participate"],
        });
        actors.push({
          id: user.id,
          kind: "user",
          token: jwt.sign({
            sub: user.id,
            username: user.username,
            type: "oidc",
            authType: "oidc",
          }),
        });
      }
    }
    manager = actors[4].token;
    config = (
      await request(server).get(configApi()).set(headers(manager)).expect(200)
    ).body;
  });
  afterAll(async () => {
    if (app) await app.close();
  });

  it("requires confirmation, preserves comments and rejects stale configuration", async () => {
    for (const actor of actors.slice(0, 4))
      await request(server)
        .post(api())
        .set(headers(actor.token))
        .send({ ...item, commentText: `private-${actor.kind}-${actor.id}` })
        .expect(201);
    for (const actor of actors.slice(0, 4)) {
      const snapshot = await request(server)
        .get(api())
        .query(item)
        .set(headers(actor.token))
        .expect(200);
      expect(snapshot.body.comments).toHaveLength(1);
    }
    const before = await db.getRepository(Comment).find({ where: { acpId } });
    await request(server)
      .put(configApi())
      .set(headers(manager))
      .send({ ...config, visibilityMode: "SHARED" })
      .expect(400);
    const stale = { ...config };
    await saveConfig({
      visibilityMode: "SHARED",
      confirmExistingComments: true,
    });
    await request(server)
      .put(configApi())
      .set(headers(manager))
      .send(stale)
      .expect(409);
    for (const actor of actors.slice(0, 4))
      expect(
        (
          await request(server)
            .get(api())
            .query(item)
            .set(headers(actor.token))
            .expect(200)
        ).body.comments,
      ).toHaveLength(4);
    expect(await db.getRepository(Comment).find({ where: { acpId } })).toEqual(
      before,
    );
    await saveConfig({ visibilityMode: "PRIVATE" });
  });

  it("creates ACP-specific groups independently of grants", async () => {
    await saveConfig({
      visibilityMode: "GROUP",
      groups: [
        {
          name: "A",
          archived: false,
          members: [actors[0], actors[2]].map(({ id, kind }) => ({ id, kind })),
        },
        {
          name: "B",
          archived: false,
          members: [actors[1], actors[3]].map(({ id, kind }) => ({ id, kind })),
        },
      ],
    });
    for (const actor of actors.slice(0, 4)) {
      await request(server)
        .get(configApi())
        .set(headers(actor.token))
        .expect(403);
      await request(server)
        .put(configApi())
        .set(headers(actor.token))
        .send(config)
        .expect(403);
    }
  });

  it("cannot bypass sharing confirmation through general ACP feature settings", async () => {
    const current = await request(server)
      .get(`/api/acp/${acpId}/access`)
      .set(headers(manager))
      .expect(200);
    expect(current.body).not.toHaveProperty("reviewRevision");
    expect(current.body).not.toHaveProperty("reviewGroups");
    const result = await request(server)
      .put(`/api/acp/${acpId}/access`)
      .set(headers(manager))
      .send({
        accessModel: "CREDENTIALS_LIST",
        allowRegistered: false,
        validFrom: new Date().toISOString(),
        validUntil: new Date(Date.now() + 86400000).toISOString(),
        featureConfig: {
          ...current.body.featureConfig,
          commentVisibilityMode: "SHARED",
          enableReview: false,
          ungroupedVisibilityMode: "SHARED",
        },
      })
      .expect(200);
    expect(result.body.featureConfig).toMatchObject({
      commentVisibilityMode: "GROUP",
      enableReview: true,
      ungroupedVisibilityMode: "PRIVATE",
    });
    const memberList = await request(server)
      .get(`/api/view/acp/${acpId}/review/members`)
      .set(headers(manager))
      .expect(200);
    expect(memberList.body).toHaveLength(5);
    expect(JSON.stringify(memberList.body)).not.toContain("passwordHash");
    const concurrent = await Promise.all(
      [1, 2].map(() =>
        request(server).put(configApi()).set(headers(manager)).send(config),
      ),
    );
    expect(concurrent.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    config = concurrent.find((response) => response.status === 200)!.body;
  });

  for (const target of [
    item,
    { targetType: "UNIT", unitId: "U" },
    { targetType: "BOOKLET", bookletId: "B" },
    { targetType: "CODING", unitId: "U", itemId: "I" },
  ]) {
    it(`isolates ${target.targetType} contents, mutations, replies, counts and revisions for users and credentials`, async () => {
      const root = (
        await request(server)
          .post(api())
          .set(headers(actors[0].token))
          .send({ ...target, commentText: `A-${target.targetType}` })
          .expect(201)
      ).body;
      expect(root.groupId).toBe(config.groups[0].id);
      const aSnapshot = await request(server)
        .get(api())
        .query(target)
        .set(headers(actors[2].token))
        .expect(200);
      expect(
        aSnapshot.body.comments.some((entry: any) => entry.id === root.id),
      ).toBe(true);
      const counts = await request(server)
        .get(`${api()}/counts`)
        .set(headers(actors[0].token))
        .expect(200);
      const foreign = (
        await request(server)
          .post(api())
          .set(headers(actors[1].token))
          .send({ ...target, commentText: `B-secret-${target.targetType}` })
          .expect(201)
      ).body;
      await request(server)
        .get(api())
        .query(target)
        .set(headers(actors[2].token))
        .set("If-None-Match", aSnapshot.headers.etag)
        .expect(304);
      expect(
        (
          await request(server)
            .get(`${api()}/counts`)
            .set(headers(actors[0].token))
            .expect(200)
        ).body,
      ).toEqual(counts.body);
      for (const actor of [actors[0], actors[2]]) {
        const snapshot = await request(server)
          .get(api())
          .query(target)
          .set(headers(actor.token))
          .expect(200);
        expect(JSON.stringify(snapshot.body)).not.toContain(foreign.id);
        expect(JSON.stringify(snapshot.body)).not.toContain("B-secret");
        expect(JSON.stringify(snapshot.body)).not.toContain(
          config.groups[1].id,
        );
        await request(server)
          .post(api())
          .set(headers(actor.token))
          .send({
            ...target,
            parentCommentId: foreign.id,
            commentText: "hidden",
          })
          .expect(404);
        await request(server)
          .patch(`${api()}/${foreign.id}`)
          .set(headers(actor.token))
          .send({ commentText: "hidden", version: 1 })
          .expect(404);
        await request(server)
          .delete(`${api()}/${foreign.id}?version=1`)
          .set(headers(actor.token))
          .expect(404);
      }
      const reply = (
        await request(server)
          .post(api())
          .set(headers(actors[2].token))
          .send({ ...target, parentCommentId: root.id, commentText: "A reply" })
          .expect(201)
      ).body;
      expect(reply.groupId).toBe(root.groupId);
      await request(server)
        .post(api())
        .set(headers(manager))
        .send({
          ...target,
          parentCommentId: root.id,
          groupId: foreign.groupId,
          commentText: "wrong scope",
        })
        .expect(400);
      await request(server)
        .patch(`${api()}/${root.id}`)
        .set(headers(actors[2].token))
        .send({ commentText: "foreign edit", version: 1 })
        .expect(403);
      await request(server)
        .patch(`${api()}/${root.id}`)
        .set(headers(actors[0].token))
        .send({ commentText: "A changed", version: 1 })
        .expect(200);
      await request(server)
        .patch(`${api()}/${root.id}`)
        .set(headers(actors[0].token))
        .send({ commentText: "stale", version: 1 })
        .expect(409);
      await request(server)
        .delete(`${api()}/${reply.id}?version=1`)
        .set(headers(actors[2].token))
        .expect(200);
      expect(
        (
          await request(server)
            .get(api())
            .query(target)
            .set(headers(manager))
            .expect(200)
        ).body.comments.some((entry: any) => entry.id === foreign.id),
      ).toBe(true);
    });
  }

  it("filters visible exports and old own endpoints after membership changes", async () => {
    const ExcelJS = await import("exceljs");
    const readExport = async (token: string, path: string) => {
      const result = await request(server)
        .get(path)
        .set(headers(token))
        .buffer(true)
        .parse((res, done) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => done(null, Buffer.concat(chunks)));
        })
        .expect(200);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(result.body);
      return JSON.stringify(workbook.worksheets[0].getSheetValues());
    };
    const participant = await readExport(
      actors[0].token,
      `${api()}/export/visible.xlsx`,
    );
    expect(participant).toContain(config.groups[0].id);
    expect(participant).not.toContain("B-secret");
    const all = await readExport(manager, `${api()}/export/all.xlsx`);
    expect(all).toContain(config.groups[0].id);
    expect(all).toContain(config.groups[1].id);
    expect(all).toContain("B-secret");
    const before = await db.getRepository(Comment).find({ where: { acpId } });
    await saveConfig({
      groups: config.groups.map((group: any, index: number) => ({
        ...group,
        members:
          index === 0 ? [] : [...group.members, ...config.groups[0].members],
      })),
    });
    for (const actor of [actors[0], actors[2]]) {
      const own = (
        await request(server)
          .get(`/api/acp/${acpId}/comments/mine`)
          .set(headers(actor.token))
          .expect(200)
      ).body;
      expect(
        own.every(
          (comment: any) =>
            !comment.groupId || comment.groupId === config.groups[1].id,
        ),
      ).toBe(true);
      for (const old of before.filter(
        (comment) => comment.groupId === config.groups[0].id,
      ))
        await request(server)
          .patch(`${api()}/${old.id}`)
          .set(headers(actor.token))
          .send({ commentText: "old", version: old.version })
          .expect(404);
      expect(
        await readExport(actor.token, `${api()}/export/mine.xlsx`),
      ).not.toContain(config.groups[0].id);
    }
    expect(await db.getRepository(Comment).find({ where: { acpId } })).toEqual(
      before,
    );
    const runner = db.createQueryRunner();
    try {
      await expect(
        new ReviewVisibilityGroups1789400000000().down(runner),
      ).rejects.toThrow("rollback would lose visibility boundaries");
    } finally {
      await runner.release();
    }
  });

  it("requires an explicit manager group and handles multiple memberships and archive", async () => {
    await request(server)
      .post(api())
      .set(headers(manager))
      .send({ ...item, commentText: "ambiguous" })
      .expect(400);
    await saveConfig({
      groups: config.groups.map((group: any) => ({
        ...group,
        members: [...group.members, { kind: actors[0].kind, id: actors[0].id }],
      })),
    });
    await request(server)
      .post(api())
      .set(headers(actors[0].token))
      .send({ ...item, commentText: "ambiguous" })
      .expect(400);
    await request(server)
      .post(api())
      .set(headers(actors[0].token))
      .send({ ...item, groupId: config.groups[0].id, commentText: "selected" })
      .expect(201);
    await saveConfig({
      groups: config.groups.map((group: any, index: number) => ({
        ...group,
        archived: index === 0,
      })),
    });
    await request(server)
      .post(api())
      .set(headers(actors[0].token))
      .send({ ...item, groupId: config.groups[0].id, commentText: "archived" })
      .expect(400);
    const visible = (
      await request(server)
        .get(api())
        .query(item)
        .set(headers(actors[0].token))
        .expect(200)
    ).body;
    expect(
      visible.comments.every(
        (comment: any) => comment.groupId !== config.groups[0].id,
      ),
    ).toBe(true);
    expect(visible.groups).toHaveLength(1);
  });

  it("keeps disabled reviews accessible to management only and persists transactional revisions", async () => {
    expect(
      Number(
        (
          await db
            .getRepository(AcpAccessConfig)
            .findOneByOrFail({ id: configId })
        ).reviewRevision,
      ),
    ).toBeGreaterThan(10);
    await saveConfig({ enableReview: false });
    for (const actor of actors.slice(0, 4)) {
      await request(server)
        .get(api())
        .query(item)
        .set(headers(actor.token))
        .expect(403);
      await request(server)
        .get(`${api()}/visible`)
        .set(headers(actor.token))
        .expect(403);
      await request(server)
        .get(`${api()}/export/mine.csv`)
        .set(headers(actor.token))
        .expect(403);
    }
    await request(server)
      .get(api())
      .query(item)
      .set(headers(manager))
      .expect(200);
    await request(server)
      .get(`/api/view/acp/${acpId}/review`)
      .set(headers(manager))
      .expect(200);
  });
});
