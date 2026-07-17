import { NestFactory } from "@nestjs/core";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { DataSource } from "typeorm";
import * as bcrypt from "bcryptjs";
import { AppModule } from "../../src/app.module";
import {
  AccessModel,
  Acp,
  AcpAccessConfig,
  AcpCredential,
  AcpFile,
  AcpItemExplorerState,
  AcpRole,
  AcpUserRole,
  User,
} from "../../src/database/entities";

const ACP_ID = "10000000-0000-4000-8000-000000000001";
const MANAGER_ID = "10000000-0000-4000-8000-000000000002";
const MANAGER_USERNAME = "e2e-manager";
const MANAGER_PASSWORD = "Manager-E2E-123!";
const CREDENTIAL_USERNAME = "e2e-reviewer";
const CREDENTIAL_PASSWORD = "Reviewer-E2E-123!";

async function seed(): Promise<void> {
  const database = process.env.DB_DATABASE || "";
  if (
    process.env.NODE_ENV !== "test" ||
    !database.toLowerCase().includes("e2e")
  ) {
    throw new Error(
      "Browser E2E fixtures require NODE_ENV=test and a DB_DATABASE containing 'e2e'.",
    );
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  try {
    const dataSource = app.get(DataSource);
    await dataSource.synchronize(true);

    const itemProperties = {
      "item-uuid-1": { empiricalDifficulty: -0.5 },
      "item-uuid-2": { empiricalDifficulty: 0.5 },
    };
    const acp = await dataSource.getRepository(Acp).save(
      dataSource.getRepository(Acp).create({
        id: ACP_ID,
        packageId: "browser-e2e-package",
        name: "Browser E2E ACP",
        description: "Isolated Playwright fixture",
        acpIndex: {
          version: "0.5.0",
          packageId: "browser-e2e-package",
          assessmentParts: [
            {
              id: "part-1",
              name: "Teil 1",
              units: [
                {
                  id: "u1",
                  name: "Aufgabe 1",
                  items: [
                    { id: "i1", name: "Item 1", sourceVariable: "V1" },
                    { id: "i2", name: "Item 2", sourceVariable: "V2" },
                  ],
                },
              ],
            },
          ],
        },
        itemProperties,
        settings: {},
      }),
    );

    const manager = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        id: MANAGER_ID,
        username: MANAGER_USERNAME,
        passwordHash: await bcrypt.hash(MANAGER_PASSWORD, 4),
        displayName: "E2E Manager",
        isAppAdmin: false,
      }),
    );
    await dataSource.getRepository(AcpUserRole).save(
      dataSource.getRepository(AcpUserRole).create({
        userId: manager.id,
        acpId: acp.id,
        role: AcpRole.ACP_MANAGER,
      }),
    );

    const accessConfig = await dataSource.getRepository(AcpAccessConfig).save(
      dataSource.getRepository(AcpAccessConfig).create({
        acpId: acp.id,
        accessModel: AccessModel.CREDENTIALS_LIST,
        allowRegistered: false,
        featureConfig: {
          enableItemList: true,
          enableItemListFilter: true,
          enableItemListSort: true,
          enableItemClick: true,
          persistUserPreferences: true,
        },
      }),
    );
    await dataSource.getRepository(AcpCredential).save(
      dataSource.getRepository(AcpCredential).create({
        accessConfigId: accessConfig.id,
        username: CREDENTIAL_USERNAME,
        passwordHash: await bcrypt.hash(CREDENTIAL_PASSWORD, 4),
      }),
    );

    const sharedState = {
      ui: {},
      tags: {},
      metadataColumns: { visible: [], order: [] },
      itemOrder: [],
      itemProperties,
    };
    await dataSource.getRepository(AcpItemExplorerState).save(
      dataSource.getRepository(AcpItemExplorerState).create({
        acpId: acp.id,
        publishedState: sharedState,
        draftState: sharedState,
        status: "CLEAN",
        version: 1,
        publishedVersion: 1,
      }),
    );

    const fixtureDirectory =
      process.env.BROWSER_E2E_FIXTURE_DIR || "/tmp/content-pool-browser-e2e";
    await mkdir(fixtureDirectory, { recursive: true });
    const unitXml = `<?xml version="1.0" encoding="UTF-8"?>
<Unit>
  <Id>u1</Id>
  <Label>Aufgabe 1</Label>
  <Description>Browser E2E Unit</Description>
  <DefinitionRef player="iqb-player-aspect@2.11">u1.voud</DefinitionRef>
  <Reference>u1.vomd</Reference>
</Unit>`;
    const itemMetadata = JSON.stringify({
      profiles: [],
      items: [
        {
          id: "i1",
          uuid: "item-uuid-1",
          description: "Item 1",
          variableId: "V1",
          useUnitAliasAsPrefix: true,
          profiles: [],
        },
        {
          id: "i2",
          uuid: "item-uuid-2",
          description: "Item 2",
          variableId: "V2",
          useUnitAliasAsPrefix: true,
          profiles: [],
        },
      ],
    });
    const unitDefinition = JSON.stringify({
      pages: [{ elements: [{ id: "V1" }] }, { elements: [{ id: "V2" }] }],
    });
    const playerHtml =
      "<!doctype html><html><body>Browser E2E Player</body></html>";
    const files = [
      { name: "u1.xml", content: unitXml, type: "UNIT_XML" },
      { name: "u1.vomd", content: itemMetadata, type: "ITEM_METADATA" },
      { name: "u1.voud", content: unitDefinition, type: "UNIT_DEFINITION" },
      {
        name: "iqb-player-aspect-2.11.6.html",
        content: playerHtml,
        type: "PLAYER",
      },
    ];
    for (const file of files) {
      const filePath = join(fixtureDirectory, file.name);
      await writeFile(filePath, file.content, "utf8");
      await dataSource.getRepository(AcpFile).save(
        dataSource.getRepository(AcpFile).create({
          acpId: acp.id,
          filePath,
          originalName: file.name,
          fileType: file.type,
          fileSize: Buffer.byteLength(file.content),
        }),
      );
    }

    process.stdout.write(
      JSON.stringify({
        acpId: ACP_ID,
        managerUsername: MANAGER_USERNAME,
        credentialUsername: CREDENTIAL_USERNAME,
      }) + "\n",
    );
  } finally {
    await app.close();
  }
}

void seed().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
