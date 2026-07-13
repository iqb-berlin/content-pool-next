import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import * as bcrypt from "bcryptjs";
import * as request from "supertest";
import { AcpItemPreference, User } from "../src/database/entities";
import { buildPatchPersonalItemPreferenceRowQuery } from "../src/views/personal-item-preferences.query";

if (!process.env.DB_HOST) process.env.DB_HOST = "localhost";
if (!process.env.DB_PORT) process.env.DB_PORT = "5433";
if (!process.env.DB_USERNAME) process.env.DB_USERNAME = "contentpool";
if (!process.env.DB_PASSWORD) process.env.DB_PASSWORD = "contentpool_dev";
if (!process.env.DB_DATABASE) process.env.DB_DATABASE = "contentpool";
if (!process.env.NODE_ENV) process.env.NODE_ENV = "test";
if (!process.env.DB_SYNCHRONIZE) process.env.DB_SYNCHRONIZE = "true";
if (!process.env.DB_RUN_MIGRATIONS) process.env.DB_RUN_MIGRATIONS = "false";

/**
 * E2E test for critical API scenarios.
 *
 * Prerequisites: a running PostgreSQL instance with the database configured
 * as per .env or environment variables.
 *
 * Run with: npm run test:e2e
 */
describe("ContentPool API (e2e)", () => {
  let app: INestApplication;
  let server: any;
  let authToken: string;
  let credentialToken: string;
  let credentialId: string;
  let itemPreferenceRepository: Repository<AcpItemPreference>;

  let acpId: string;
  let snapshotId: string;

  const uniqueSuffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const adminUsername = `e2e_admin_${uniqueSuffix}`;
  const testPackageId = `e2e-test-${uniqueSuffix}`;
  const credentialUsername = `cred_${uniqueSuffix}`;
  const credentialPassword = "StrongPass123!";

  const baseIndex = {
    packageId: testPackageId,
    version: "0.5.0",
    name: [{ lang: "de", value: "E2E ACP" }],
    description: [{ lang: "de", value: "E2E Description" }],
    status: "IN_DEVELOPMENT",
    assessmentParts: [
      {
        id: "part-1",
        units: [
          {
            id: "U1",
            name: "Unit 1",
            dependencies: [],
            items: [
              {
                id: "I1",
                name: "Item 1",
                sourceVariable: "var1",
              },
            ],
          },
        ],
        bookletModules: [
          {
            id: "M1",
            name: "Module 1",
            units: [{ id: "U1", order: 1 }],
          },
        ],
        instruments: [
          {
            id: "INST-1",
            name: "Instrument 1",
            testcenterBooklet: [
              {
                definitionId: "booklet.xml",
                modules: [{ moduleId: "M1" }],
              },
            ],
          },
        ],
      },
    ],
  };

  const featureConfig = {
    enableItemList: true,
    enableUnitView: true,
    enableSequenceNavigation: true,
    enableCommenting: true,
    commentTargets: ["UNIT", "ITEM", "TASK_SEQUENCE"],
  };

  jest.setTimeout(60000);

  beforeAll(async () => {
    const { AppModule } = await import("../src/app.module");
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.setGlobalPrefix("api");
    await app.init();
    server = app.getHttpServer();

    // Create an app-admin test user directly, then issue a valid JWT for stable e2e auth.
    const userRepo = moduleFixture.get<Repository<User>>(
      getRepositoryToken(User),
    );
    itemPreferenceRepository = moduleFixture.get<Repository<AcpItemPreference>>(
      getRepositoryToken(AcpItemPreference),
    );
    const jwtService = moduleFixture.get<JwtService>(JwtService);

    const adminUser = await userRepo.save(
      userRepo.create({
        username: adminUsername,
        passwordHash: await bcrypt.hash("TempPassword123!", 10),
        isAppAdmin: true,
      }),
    );

    authToken = jwtService.sign({
      sub: adminUser.id,
      username: adminUser.username,
      isAppAdmin: true,
      type: "user",
    });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it("creates ACP and baseline index", async () => {
    const createRes = await request(server)
      .post("/api/acp")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        packageId: testPackageId,
        name: "E2E ACP",
        description: "E2E Description",
      })
      .expect(201);

    acpId = createRes.body.id;
    expect(createRes.body.packageId).toBe(testPackageId);

    const accessConfigRes = await request(server)
      .get(`/api/acp/${acpId}/access`)
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);
    expect(accessConfigRes.body.accessModel).toBe("PRIVATE");

    await request(server)
      .put(`/api/acp/${acpId}/index`)
      .set("Authorization", `Bearer ${authToken}`)
      .send(baseIndex)
      .expect(200);
  });

  it("covers public access and core read-only views", async () => {
    await request(server)
      .put(`/api/acp/${acpId}/access`)
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        accessModel: "PUBLIC",
        featureConfig,
      })
      .expect(200);

    const publicList = await request(server).get("/api/view/acp").expect(200);
    expect(Array.isArray(publicList.body)).toBe(true);
    expect(publicList.body.some((entry: any) => entry.id === acpId)).toBe(true);

    const startRes = await request(server)
      .get(`/api/view/acp/${acpId}`)
      .expect(200);
    expect(startRes.body.id).toBe(acpId);

    const unitsRes = await request(server)
      .get(`/api/view/acp/${acpId}/units`)
      .expect(200);
    expect(unitsRes.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "U1" })]),
    );

    const itemsRes = await request(server)
      .get(`/api/view/acp/${acpId}/items`)
      .expect(200);
    expect(itemsRes.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ itemId: "U1_I1" })]),
    );

    const sequencesRes = await request(server)
      .get(`/api/view/acp/${acpId}/sequences`)
      .expect(200);
    expect(sequencesRes.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "M1" })]),
    );

    const sequenceRes = await request(server)
      .get(`/api/view/acp/${acpId}/sequences/M1`)
      .expect(200);
    expect(sequenceRes.body.units).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "U1" })]),
    );
  });

  it("covers credential access flow", async () => {
    const now = new Date();
    const validFrom = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const validUntil = new Date(
      now.getTime() + 24 * 60 * 60 * 1000,
    ).toISOString();

    await request(server)
      .put(`/api/acp/${acpId}/access`)
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        accessModel: "CREDENTIALS_LIST",
        validFrom,
        validUntil,
        featureConfig,
      })
      .expect(200);

    const credentialRes = await request(server)
      .post(`/api/acp/${acpId}/access/credentials/single`)
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        username: credentialUsername,
        password: credentialPassword,
      })
      .expect(201);
    credentialId = credentialRes.body.id;

    const loginRes = await request(server)
      .post("/api/auth/credential-login")
      .send({
        acpId,
        username: credentialUsername,
        password: credentialPassword,
      })
      .expect(201);

    credentialToken = loginRes.body.accessToken;
    expect(credentialToken).toBeDefined();

    await request(server)
      .get(`/api/view/acp/${acpId}`)
      .set("Authorization", `Bearer ${credentialToken}`)
      .expect(200);

    await request(server)
      .get(`/api/view/acp/${acpId}/items`)
      .set("Authorization", `Bearer ${credentialToken}`)
      .expect(200);
  });

  it("executes personal row insert, conflict update, and delete in PostgreSQL", async () => {
    const rowKey = "e2e-row-1";
    const query = buildPatchPersonalItemPreferenceRowQuery("credential_id");
    const executePatch = async (rowData: Record<string, unknown> | null) =>
      itemPreferenceRepository.query(query, [
        acpId,
        "item-explorer",
        null,
        credentialId,
        credentialUsername,
        JSON.stringify({
          ui: {},
          tags: {},
          rowData: rowData ? { [rowKey]: rowData } : {},
        }),
        rowData ? JSON.stringify(rowData) : null,
        rowKey,
        10_000,
      ]);

    const insertedRow = { category: "Offen", note: "erste Fassung" };
    await executePatch(insertedRow);

    let record = await itemPreferenceRepository.findOneByOrFail({
      acpId,
      viewId: "item-explorer",
      credentialId,
    });
    expect(record.preferences).toEqual({
      ui: {},
      tags: {},
      rowData: { [rowKey]: insertedRow },
    });

    const updatedRow = { category: "Erledigt", note: "zweite Fassung" };
    await executePatch(updatedRow);

    record = await itemPreferenceRepository.findOneByOrFail({
      acpId,
      viewId: "item-explorer",
      credentialId,
    });
    expect(record.preferences).toEqual({
      ui: {},
      tags: {},
      rowData: { [rowKey]: updatedRow },
    });

    await executePatch(null);

    record = await itemPreferenceRepository.findOneByOrFail({
      acpId,
      viewId: "item-explorer",
      credentialId,
    });
    expect(record.preferences).toEqual({ ui: {}, tags: {}, rowData: {} });
  });

  it("covers comment export", async () => {
    await request(server)
      .post(`/api/acp/${acpId}/comments`)
      .set("Authorization", `Bearer ${credentialToken}`)
      .send({
        targetType: "ITEM",
        targetId: "U1_I1",
        commentText: "E2E comment",
      })
      .expect(201);

    const exportJsonRes = await request(server)
      .get(`/api/acp/${acpId}/comments/export`)
      .set("Authorization", `Bearer ${credentialToken}`)
      .expect(200);

    expect(Array.isArray(exportJsonRes.body)).toBe(true);
    expect(exportJsonRes.body.length).toBeGreaterThanOrEqual(1);

    const exportXlsxRes = await request(server)
      .get(`/api/acp/${acpId}/comments/export.xlsx`)
      .set("Authorization", `Bearer ${credentialToken}`)
      .expect(200);

    expect(exportXlsxRes.header["content-type"]).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
  });

  it("covers snapshot restore scenario", async () => {
    const snapshotRes = await request(server)
      .post(`/api/acp/${acpId}/snapshots`)
      .set("Authorization", `Bearer ${authToken}`)
      .send({ changelog: "baseline" })
      .expect(201);

    snapshotId = snapshotRes.body.id;

    const modifiedIndex = {
      ...baseIndex,
      assessmentParts: [
        {
          ...baseIndex.assessmentParts[0],
          units: [
            {
              ...baseIndex.assessmentParts[0].units[0],
              name: "Unit 1 changed",
            },
          ],
        },
      ],
    };

    await request(server)
      .put(`/api/acp/${acpId}/index`)
      .set("Authorization", `Bearer ${authToken}`)
      .send(modifiedIndex)
      .expect(200);

    const changedIndexRes = await request(server)
      .get(`/api/acp/${acpId}/index`)
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);

    expect(changedIndexRes.body.assessmentParts[0].units[0].name).toBe(
      "Unit 1 changed",
    );

    await request(server)
      .post(`/api/acp/${acpId}/snapshots/${snapshotId}/restore`)
      .set("Authorization", `Bearer ${authToken}`)
      .expect(201);

    const restoredIndexRes = await request(server)
      .get(`/api/acp/${acpId}/index`)
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);

    expect(restoredIndexRes.body.assessmentParts[0].units[0].name).toBe(
      "Unit 1",
    );
  });
});
