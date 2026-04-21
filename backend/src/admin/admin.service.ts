import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import * as crypto from "crypto";
import * as fs from "fs/promises";
import * as path from "path";
import { AppSettings } from "../database/entities";
import { DEFAULT_ACP_INDEX_VERSION } from "../acp/acp-index.utils";
import {
  GEOGEBRA_PLAYER_DEPLOY_SCRIPT_PATH,
  GEOGEBRA_PLAYER_RESOURCE_BASE,
  GEOGEBRA_REQUIRED_ENTRY,
  getGeoGebraBundleBaseDir,
  getGeoGebraBundleCurrentDir,
} from "./geogebra-bundle.util";

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(AppSettings)
    private readonly settingsRepository: Repository<AppSettings>,
  ) {}

  async getSettings(): Promise<AppSettings> {
    let settings = await this.settingsRepository.findOne({ where: {} });
    if (!settings) {
      settings = this.settingsRepository.create({
        theme: {},
        language: "de",
        defaultAcpIndex: {
          version: DEFAULT_ACP_INDEX_VERSION,
          assessmentParts: [],
        },
        geoGebraBundle: null,
      });
      settings = await this.settingsRepository.save(settings);
    }
    if (settings.geoGebraBundle) {
      settings.geoGebraBundle = {
        ...settings.geoGebraBundle,
        deployScriptUrl: GEOGEBRA_PLAYER_DEPLOY_SCRIPT_PATH,
        publicBasePath: GEOGEBRA_PLAYER_RESOURCE_BASE,
      };
    }
    return settings;
  }

  async updateSettings(data: Partial<AppSettings>): Promise<AppSettings> {
    const settings = await this.getSettings();
    if (data.theme !== undefined) settings.theme = data.theme;
    if (data.language !== undefined) settings.language = data.language;
    if (data.logoUrl !== undefined) settings.logoUrl = data.logoUrl;
    if (data.landingPageHtml !== undefined)
      settings.landingPageHtml = data.landingPageHtml;
    if (data.imprintHtml !== undefined) settings.imprintHtml = data.imprintHtml;
    if (data.privacyHtml !== undefined) settings.privacyHtml = data.privacyHtml;
    if (data.accessibilityHtml !== undefined)
      settings.accessibilityHtml = data.accessibilityHtml;
    if (data.defaultAcpIndex !== undefined)
      settings.defaultAcpIndex = data.defaultAcpIndex;
    return this.settingsRepository.save(settings);
  }

  async uploadGeoGebraBundle(
    uploadedFile: Express.Multer.File | undefined,
  ): Promise<AppSettings> {
    if (!uploadedFile) {
      throw new BadRequestException("A GeoGebra ZIP archive is required");
    }

    const fileName = String(uploadedFile.originalname || "").trim();
    if (!fileName.toLowerCase().endsWith(".zip")) {
      throw new BadRequestException(
        "GeoGebra bundle upload must be provided as a ZIP file",
      );
    }

    const JSZip = require("jszip");

    let archive: any;
    try {
      archive = await JSZip.loadAsync(uploadedFile.buffer);
    } catch {
      throw new BadRequestException(
        `ZIP archive "${fileName}" could not be extracted`,
      );
    }

    const bundleEntries = await this.extractGeoGebraBundleEntries(archive);
    if (!bundleEntries.length) {
      throw new BadRequestException(
        `ZIP archive "${fileName}" does not contain any GeoGebra bundle files`,
      );
    }

    const hasDeployScript = bundleEntries.some(
      (entry) => entry.relativePath === GEOGEBRA_REQUIRED_ENTRY,
    );
    if (!hasDeployScript) {
      throw new BadRequestException(
        `ZIP archive "${fileName}" must contain ${GEOGEBRA_REQUIRED_ENTRY}`,
      );
    }

    const baseDir = getGeoGebraBundleBaseDir();
    const currentDir = getGeoGebraBundleCurrentDir();
    const stagingDir = path.join(
      baseDir,
      `staging-${Date.now()}-${crypto.randomUUID()}`,
    );

    await fs.mkdir(stagingDir, { recursive: true });

    try {
      for (const entry of bundleEntries) {
        const targetPath = path.join(stagingDir, ...entry.relativePath.split("/"));
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.writeFile(targetPath, entry.buffer);
      }

      await fs.access(path.join(stagingDir, GEOGEBRA_REQUIRED_ENTRY));
      await this.activateGeoGebraBundle(stagingDir, currentDir);
    } catch (error) {
      await fs.rm(stagingDir, { recursive: true, force: true });
      throw error;
    }

    const settings = await this.getSettings();
    settings.geoGebraBundle = {
      sourceFileName: fileName,
      deployScriptUrl: GEOGEBRA_PLAYER_DEPLOY_SCRIPT_PATH,
      publicBasePath: GEOGEBRA_PLAYER_RESOURCE_BASE,
      checksum: crypto
        .createHash("sha256")
        .update(uploadedFile.buffer)
        .digest("hex"),
      entryCount: bundleEntries.length,
      uploadedAt: new Date().toISOString(),
    };
    return this.settingsRepository.save(settings);
  }

  async deleteGeoGebraBundle(): Promise<AppSettings> {
    await fs.rm(getGeoGebraBundleCurrentDir(), {
      recursive: true,
      force: true,
    });

    const settings = await this.getSettings();
    settings.geoGebraBundle = null;
    return this.settingsRepository.save(settings);
  }

  private async extractGeoGebraBundleEntries(
    archive: any,
  ): Promise<Array<{ relativePath: string; buffer: Buffer }>> {
    const extractedFiles: Array<{ relativePath: string; buffer: Buffer }> = [];
    const seenRelativePaths = new Set<string>();
    const archiveEntries = Object.values(archive.files || {});

    for (const entry of archiveEntries as Array<{ dir?: boolean; name?: string }>) {
      if (entry?.dir) {
        continue;
      }

      const relativePath = this.getGeoGebraArchiveEntryPath(String(entry?.name || ""));
      if (!relativePath) {
        continue;
      }

      if (seenRelativePaths.has(relativePath)) {
        throw new BadRequestException(
          `ZIP archive contains duplicate GeoGebra file "${relativePath}"`,
        );
      }

      const zipEntry = archive.file(String(entry?.name || ""));
      if (!zipEntry) {
        continue;
      }

      seenRelativePaths.add(relativePath);
      extractedFiles.push({
        relativePath,
        buffer: Buffer.from(await zipEntry.async("nodebuffer")),
      });
    }

    return extractedFiles;
  }

  private getGeoGebraArchiveEntryPath(entryName: string): string | null {
    const normalizedPath = String(entryName || "")
      .replace(/\\/g, "/")
      .trim()
      .replace(/^\/+/, "");

    if (!normalizedPath || normalizedPath.startsWith("__MACOSX/")) {
      return null;
    }

    const segments = normalizedPath
      .split("/")
      .map((segment) => segment.trim())
      .filter(Boolean);

    if (!segments.length || segments.some((segment) => segment === "..")) {
      throw new BadRequestException(
        `ZIP archive contains an invalid entry path "${entryName}"`,
      );
    }

    if (segments[segments.length - 1] === ".DS_Store") {
      return null;
    }

    const geoGebraIndex = segments.indexOf("GeoGebra");
    if (geoGebraIndex === -1 || geoGebraIndex === segments.length - 1) {
      return null;
    }

    return segments.slice(geoGebraIndex).join("/");
  }

  private async activateGeoGebraBundle(
    stagingDir: string,
    currentDir: string,
  ): Promise<void> {
    await fs.mkdir(path.dirname(currentDir), { recursive: true });

    const backupDir = `${currentDir}-backup-${Date.now()}-${crypto.randomUUID()}`;
    let currentMoved = false;

    try {
      await fs.access(currentDir);
      await fs.rename(currentDir, backupDir);
      currentMoved = true;
    } catch {
      currentMoved = false;
    }

    try {
      await fs.rename(stagingDir, currentDir);
    } catch (error) {
      if (currentMoved) {
        await fs.rename(backupDir, currentDir).catch(() => undefined);
      }
      throw error;
    }

    if (currentMoved) {
      await fs.rm(backupDir, { recursive: true, force: true });
    }
  }
}
