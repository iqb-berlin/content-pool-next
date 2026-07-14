import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import * as fs from "fs/promises";
import { AcpFile, Acp, AcpAccessConfig } from "../database/entities";
import {
  getAssessmentParts,
  normalizeIndexForStorage,
} from "../acp/acp-index.utils";
import { FileProcessingProgressReporter } from "./file-processing-progress";
import { normalizeFeatureConfig } from "../acp/feature-config.utils";
import {
  buildItemRowKey,
  parseItemRowKeyParts,
} from "../items/item-row-key.util";
import { ItemRowNumberingService } from "./item-row-numbering.service";
import { ItemExplorerStateService } from "../item-explorer/item-explorer-state.service";

/** Parsed reference data from a unit .xml file */
export interface UnitXmlData {
  unitId: string;
  unitLabel: string;
  description?: string;
  definitionRef: string; // .voud filename
  playerRef: string; // e.g. "iqb-player-aspect@2.11"
  codingSchemeRef?: string; // .vocs filename
  metadataRef?: string; // .vomd filename
}

/** Result of validating a unit's file completeness */
export interface UnitValidationResult {
  unitId: string;
  unitLabel: string;
  valid: boolean;
  files: {
    xml: { expected: string; found: boolean };
    definition: { expected: string; found: boolean };
    codingScheme: { expected: string; found: boolean };
    metadata: { expected: string; found: boolean };
    player: { expected: string; found: boolean; resolvedName?: string };
  };
}

/** Column definition derived from .vomd item profiles */
export interface MetadataColumn {
  id: string;
  label: string;
}

/** Item data extracted from .vomd files */
export interface VomdItemData {
  itemId: string;
  uuid: string;
  rowKey: string;
  subId?: string;
  subIdDisplay?: string;
  unitId: string;
  unitLabel: string;
  description: string;
  variableId: string;
  sourceVariable?: string;
  metadata: Record<string, string>;
  empiricalDifficulty?: number;
  tags?: string[];
  rowNumber: number;
}

/** Full item list response */
export interface ItemListResult {
  columns: MetadataColumn[];
  items: VomdItemData[];
  subIdLabel: string;
  subIdLabels: Record<string, string>;
  unitMetadata: Record<string, any[]>; // unitId → unit-level profile entries
  codingSchemes: Record<string, any>; // unitId → coding scheme JSON
}

interface ParsedItemListResult {
  itemList: ItemListResult;
  sourceFileSignature: string;
}

interface PartialCreditRow {
  rowKey: string;
  subId: string;
  properties: Record<string, unknown>;
}

interface ItemRowKeyCacheEntry {
  signature: string;
  rowKeys: ReadonlySet<string>;
}

export interface IndexSyncReport {
  unitsAdded: number;
  unitsUpdated: number;
  itemsAdded: number;
  itemsUpdated: number;
  warnings: string[];
}

export interface IndexDependencyCleanupReport {
  unitsUpdated: number;
  dependenciesRemoved: number;
  bookletsUpdated: number;
  bookletDefinitionsRemoved: number;
  indexUpdated: boolean;
}

@Injectable()
export class UnitParserService {
  private readonly logger = new Logger(UnitParserService.name);
  private readonly itemRowKeyCache = new Map<string, ItemRowKeyCacheEntry>();
  private readonly maxItemRowKeyCacheEntries = 100;

  constructor(
    @InjectRepository(AcpFile)
    private readonly fileRepository: Repository<AcpFile>,
    @InjectRepository(Acp)
    private readonly acpRepository: Repository<Acp>,
    @InjectRepository(AcpAccessConfig)
    private readonly accessConfigRepository: Repository<AcpAccessConfig>,
    private readonly itemRowNumberingService: ItemRowNumberingService,
    private readonly itemExplorerStateService: ItemExplorerStateService,
  ) {}

  /**
   * Parse a Unit .xml file content and extract references.
   */
  parseUnitXml(xmlContent: string, xmlFilename: string): UnitXmlData | null {
    try {
      // Extract <Id>
      const idMatch = xmlContent.match(/<Id>([^<]+)<\/Id>/);
      const unitId = idMatch?.[1] || "";

      // Extract <Label>
      const labelMatch = xmlContent.match(/<Label>([^<]+)<\/Label>/);
      const unitLabel = labelMatch?.[1] || unitId;

      // Extract <Description>
      const descMatch = xmlContent.match(/<Description>([^<]*)<\/Description>/);
      const description = descMatch?.[1] || undefined;

      // Extract <DefinitionRef ...>filename.voud</DefinitionRef>
      const defRefMatch = xmlContent.match(
        /<DefinitionRef[^>]*>([^<]+)<\/DefinitionRef>/,
      );
      const definitionRef = defRefMatch?.[1]?.trim() || "";

      // Extract player attribute from <DefinitionRef player="...">
      const playerAttrMatch = xmlContent.match(
        /<DefinitionRef[^>]*player="([^"]+)"/,
      );
      const playerRef = playerAttrMatch?.[1] || "";

      // Extract <CodingSchemeRef ...>filename.vocs</CodingSchemeRef>
      const codingRefMatch = xmlContent.match(
        /<CodingSchemeRef[^>]*>([^<]+)<\/CodingSchemeRef>/,
      );
      const codingSchemeRef = codingRefMatch?.[1]?.trim() || undefined;

      // Extract <Reference>filename.vomd</Reference>
      const metaRefMatch = xmlContent.match(/<Reference>([^<]+)<\/Reference>/);
      const metadataRef = metaRefMatch?.[1]?.trim() || undefined;

      return {
        unitId,
        unitLabel,
        description,
        definitionRef,
        playerRef,
        codingSchemeRef,
        metadataRef,
      };
    } catch (e) {
      this.logger.error(`Failed to parse unit XML ${xmlFilename}: ${e}`);
      return null;
    }
  }

  /**
   * Parse a .vomd JSON file and extract items with their profile entries.
   */
  parseVomd(
    vomdContent: string,
    strictStructure = false,
  ): {
    unitProfiles: any[];
    items: any[];
  } | null {
    try {
      const data: unknown = JSON.parse(vomdContent);
      if (!this.isRecord(data)) {
        throw new Error("VOMD root must be an object");
      }

      const unitProfiles = data.profiles === undefined ? [] : data.profiles;
      const items = data.items === undefined ? [] : data.items;
      if (
        !Array.isArray(unitProfiles) ||
        !Array.isArray(items) ||
        (strictStructure &&
          (!Object.prototype.hasOwnProperty.call(data, "items") ||
            !unitProfiles.every((profile) =>
              this.isValidVomdProfile(profile),
            ) ||
            !items.every((item) => this.isValidVomdItem(item))))
      ) {
        throw new Error("VOMD has an invalid structure");
      }

      return {
        unitProfiles,
        items,
      };
    } catch (e) {
      this.logger.error(`Failed to parse .vomd: ${e}`);
      return null;
    }
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private isValidVomdProfile(value: unknown): boolean {
    if (!this.isRecord(value)) return false;

    const entries = value.entries === undefined ? [] : value.entries;
    return (
      Array.isArray(entries) && entries.every((entry) => this.isRecord(entry))
    );
  }

  private isValidVomdItem(
    value: unknown,
  ): value is Record<string, any> & { id: string; profiles?: any[] } {
    if (!this.isRecord(value)) return false;
    if (typeof value.id !== "string" || value.id.trim().length === 0) {
      return false;
    }

    const profiles = value.profiles === undefined ? [] : value.profiles;
    return (
      Array.isArray(profiles) &&
      profiles.every((profile) => this.isValidVomdProfile(profile))
    );
  }

  /**
   * Resolve a player reference like "iqb-player-aspect@2.11" to an actual
   * uploaded file. Finds the best match among uploaded HTML files.
   */
  private findPlayerFile(
    playerRef: string,
    fileNames: string[],
  ): string | undefined {
    if (!playerRef) return undefined;

    // playerRef format: "iqb-player-aspect@2.11"
    // Uploaded file format: "iqb-player-aspect-2.11.6.html"
    // Strategy: match base name and major.minor version
    const parts = playerRef.split("@");
    const baseName = parts[0]; // e.g. "iqb-player-aspect"
    const version = parts[1]; // e.g. "2.11"

    return fileNames.find((name) => {
      const lower = name.toLowerCase();
      return (
        lower.includes(baseName.toLowerCase()) &&
        (version ? lower.includes(version) : true) &&
        lower.endsWith(".html")
      );
    });
  }

  /**
   * Validate that all files referenced by a unit .xml are present.
   */
  async validateUnitFiles(acpId: string): Promise<UnitValidationResult[]> {
    // Get all files for this ACP
    const allFiles = await this.fileRepository.find({ where: { acpId } });
    const fileNames = allFiles.map((f) => f.originalName);
    const results: UnitValidationResult[] = [];

    // Find all .xml files
    const xmlFiles = allFiles.filter(
      (f) =>
        f.originalName.toLowerCase().endsWith(".xml") &&
        !f.originalName.toLowerCase().startsWith("booklet") &&
        !f.originalName.toLowerCase().startsWith("testtaker"),
    );

    for (const xmlFile of xmlFiles) {
      try {
        const content = await fs.readFile(xmlFile.filePath, "utf-8");

        // Only process Unit XML files (not booklet or testtaker XMLs)
        if (!content.includes("<Unit")) continue;

        const parsed = this.parseUnitXml(content, xmlFile.originalName);
        if (!parsed) continue;

        const playerFileName = this.findPlayerFile(parsed.playerRef, fileNames);

        const result: UnitValidationResult = {
          unitId: parsed.unitId,
          unitLabel: parsed.unitLabel,
          valid: true,
          files: {
            xml: { expected: xmlFile.originalName, found: true },
            definition: {
              expected: parsed.definitionRef,
              found: fileNames.includes(parsed.definitionRef),
            },
            codingScheme: {
              expected: parsed.codingSchemeRef || "(nicht referenziert)",
              found: parsed.codingSchemeRef
                ? fileNames.includes(parsed.codingSchemeRef)
                : true,
            },
            metadata: {
              expected: parsed.metadataRef || "(nicht referenziert)",
              found: parsed.metadataRef
                ? fileNames.some(
                    (n) =>
                      n === parsed.metadataRef ||
                      n === parsed.metadataRef + ".json",
                  )
                : true,
            },
            player: {
              expected: parsed.playerRef,
              found: !!playerFileName,
              resolvedName: playerFileName,
            },
          },
        };

        // Check overall validity
        result.valid =
          result.files.definition.found &&
          result.files.codingScheme.found &&
          result.files.metadata.found &&
          result.files.player.found;

        results.push(result);
      } catch (e) {
        this.logger.error(
          `Error validating unit file ${xmlFile.originalName}: ${e}`,
        );
      }
    }

    return results;
  }

  /**
   * Merge uploaded unit files into ACP-Index (non-destructive).
   * - Adds/updates units and items inferred from unit XML + VOMD
   * - Preserves existing manual index fields
   * - Never removes existing units/items automatically
   * - Prunes dependency entries that reference files no longer present
   */
  async syncIndexFromFiles(
    acpId: string,
    progress?: FileProcessingProgressReporter,
  ): Promise<IndexSyncReport> {
    const acp = await this.acpRepository.findOne({ where: { id: acpId } });
    if (!acp) {
      throw new NotFoundException(`ACP with ID ${acpId} not found`);
    }

    const allFiles = await this.fileRepository.find({ where: { acpId } });
    const fileNames = allFiles.map((f) => f.originalName);
    const fileNameSet = new Set(fileNames);

    const warningSet = new Set<string>();
    const report: IndexSyncReport = {
      unitsAdded: 0,
      unitsUpdated: 0,
      itemsAdded: 0,
      itemsUpdated: 0,
      warnings: [],
    };

    const normalizedIndex = normalizeIndexForStorage(acp.acpIndex || {});
    const parts = getAssessmentParts(normalizedIndex).map((part: any) => ({
      ...part,
      units: Array.isArray(part?.units) ? [...part.units] : [],
    }));

    if (!parts.length) {
      parts.push({
        id: "default-assessment-part",
        name: [{ lang: "de", value: "Default Assessment Part" }],
        units: [],
      });
    }

    const unitLocation = new Map<
      string,
      { partIndex: number; unitIndex: number }
    >();
    for (let partIndex = 0; partIndex < parts.length; partIndex++) {
      const units = Array.isArray(parts[partIndex].units)
        ? parts[partIndex].units
        : [];
      parts[partIndex].units = units;
      for (let unitIndex = 0; unitIndex < units.length; unitIndex++) {
        const unitId =
          typeof units[unitIndex]?.id === "string" ? units[unitIndex].id : "";
        if (unitId && !unitLocation.has(unitId)) {
          unitLocation.set(unitId, { partIndex, unitIndex });
        }
      }
    }

    const xmlFiles = allFiles.filter(
      (f) =>
        f.originalName.toLowerCase().endsWith(".xml") &&
        !f.originalName.toLowerCase().startsWith("booklet") &&
        !f.originalName.toLowerCase().startsWith("testtaker"),
    );

    await progress?.startPhase("sync-index", xmlFiles.length, {
      message:
        xmlFiles.length > 0
          ? "Unit-XML-Dateien werden in den ACP-Index eingelesen."
          : "Keine Unit-XML-Dateien fuer die Synchronisierung gefunden.",
    });

    for (const xmlFile of xmlFiles) {
      let xmlContent = "";
      try {
        xmlContent = await fs.readFile(xmlFile.filePath, "utf-8");
      } catch (e) {
        warningSet.add(`Konnte Unit-XML nicht lesen: ${xmlFile.originalName}`);
        this.logger.warn(
          `Could not read XML file ${xmlFile.originalName}: ${e}`,
        );
        await progress?.advance({ message: xmlFile.originalName });
        continue;
      }

      if (!xmlContent.includes("<Unit")) {
        await progress?.advance({ message: xmlFile.originalName });
        continue;
      }

      const parsedUnit = this.parseUnitXml(xmlContent, xmlFile.originalName);
      if (!parsedUnit?.unitId) {
        warningSet.add(
          `Unit-XML konnte nicht geparst werden: ${xmlFile.originalName}`,
        );
        await progress?.advance({ message: xmlFile.originalName });
        continue;
      }

      const location = unitLocation.get(parsedUnit.unitId);
      const existingUnit = location
        ? parts[location.partIndex].units[location.unitIndex]
        : undefined;

      const dependencies = this.buildDependenciesFromUnitRefs(
        parsedUnit,
        fileNames,
        fileNameSet,
        warningSet,
      );

      const existingItems = Array.isArray(existingUnit?.items)
        ? [...existingUnit.items]
        : [];
      const parsedItems = await this.extractItemsForUnit(
        parsedUnit,
        allFiles,
        warningSet,
      );
      const mergedItems = [...existingItems];

      for (const parsedItem of parsedItems) {
        const existingIndex = mergedItems.findIndex(
          (i: any) => i?.id === parsedItem.id,
        );
        if (existingIndex === -1) {
          mergedItems.push(parsedItem);
          report.itemsAdded++;
          continue;
        }

        const existingItem = mergedItems[existingIndex] || {};
        const nextItem = { ...existingItem };
        let changed = false;

        if (!nextItem.name && parsedItem.name) {
          nextItem.name = parsedItem.name;
          changed = true;
        }

        if (!nextItem.sourceVariable && parsedItem.sourceVariable) {
          nextItem.sourceVariable = parsedItem.sourceVariable;
          changed = true;
        }

        if (
          nextItem.useUnitAliasAsPrefix === undefined &&
          parsedItem.useUnitAliasAsPrefix !== undefined
        ) {
          nextItem.useUnitAliasAsPrefix = parsedItem.useUnitAliasAsPrefix;
          changed = true;
        }

        if (parsedItem.metadata && Object.keys(parsedItem.metadata).length) {
          const existingMetadata =
            nextItem.metadata && typeof nextItem.metadata === "object"
              ? nextItem.metadata
              : {};
          const mergedMetadata = {
            ...parsedItem.metadata,
            ...existingMetadata,
          };
          if (
            JSON.stringify(mergedMetadata) !== JSON.stringify(existingMetadata)
          ) {
            nextItem.metadata = mergedMetadata;
            changed = true;
          }
        }

        if (changed) {
          mergedItems[existingIndex] = nextItem;
          report.itemsUpdated++;
        }
      }

      const existingDependencies = Array.isArray(existingUnit?.dependencies)
        ? existingUnit.dependencies
        : [];

      const mergedUnit = {
        ...(existingUnit || {}),
        id: parsedUnit.unitId,
        name: existingUnit?.name || parsedUnit.unitLabel || parsedUnit.unitId,
        description: existingUnit?.description || parsedUnit.description,
        dependencies: this.mergeDependencies(
          existingDependencies,
          dependencies,
        ),
        items: mergedItems,
      };

      if (!location) {
        parts[0].units.push(mergedUnit);
        unitLocation.set(parsedUnit.unitId, {
          partIndex: 0,
          unitIndex: parts[0].units.length - 1,
        });
        report.unitsAdded++;
        continue;
      }

      const previous = parts[location.partIndex].units[location.unitIndex];
      if (JSON.stringify(previous) !== JSON.stringify(mergedUnit)) {
        parts[location.partIndex].units[location.unitIndex] = mergedUnit;
        report.unitsUpdated++;
      }

      await progress?.advance({ message: xmlFile.originalName });
    }

    this.pruneMissingReferencesFromParts(parts, fileNameSet);

    const nextIndex = normalizeIndexForStorage({
      ...normalizedIndex,
      assessmentParts: parts,
    });

    if (JSON.stringify(acp.acpIndex || {}) !== JSON.stringify(nextIndex)) {
      acp.acpIndex = nextIndex;
      await this.acpRepository.save(acp);
    }

    report.warnings = Array.from(warningSet);
    await progress?.completePhase(
      xmlFiles.length > 0
        ? "ACP-Index-Synchronisierung abgeschlossen."
        : "ACP-Index-Synchronisierung ohne verarbeitbare Unit-Dateien abgeschlossen.",
    );
    return report;
  }

  /**
   * Remove unit dependency entries that reference files no longer present
   * in ACP storage. This is intended for cleanup after file deletions.
   */
  async pruneMissingDependencies(
    acpId: string,
  ): Promise<IndexDependencyCleanupReport> {
    const acp = await this.acpRepository.findOne({ where: { id: acpId } });
    if (!acp) {
      throw new NotFoundException(`ACP with ID ${acpId} not found`);
    }

    const allFiles = await this.fileRepository.find({ where: { acpId } });
    const fileNameSet = new Set(allFiles.map((f) => f.originalName));
    const normalizedIndex = normalizeIndexForStorage(acp.acpIndex || {});
    const parts = getAssessmentParts(normalizedIndex).map((part: any) => ({
      ...part,
      units: Array.isArray(part?.units) ? [...part.units] : [],
    }));

    const cleanup = this.pruneMissingReferencesFromParts(parts, fileNameSet);

    const nextIndex = normalizeIndexForStorage({
      ...normalizedIndex,
      assessmentParts: parts,
    });
    const indexUpdated =
      JSON.stringify(acp.acpIndex || {}) !== JSON.stringify(nextIndex);

    if (indexUpdated) {
      acp.acpIndex = nextIndex;
      await this.acpRepository.save(acp);
    }

    return {
      unitsUpdated: cleanup.unitsUpdated,
      dependenciesRemoved: cleanup.dependenciesRemoved,
      bookletsUpdated: cleanup.bookletsUpdated,
      bookletDefinitionsRemoved: cleanup.bookletDefinitionsRemoved,
      indexUpdated,
    };
  }

  /**
   * Read all .vomd files for an ACP, extract items with profile metadata,
   * and determine dynamic columns.
   */
  async getItemListFromFiles(
    acpId: string,
    options: {
      itemPropertiesOverride?: Record<string, Record<string, unknown>>;
      publishedItemPropertiesOverride?: Record<string, Record<string, unknown>>;
    } = {},
  ): Promise<ItemListResult> {
    const { itemList } = await this.parseItemListFromFiles(
      acpId,
      options.itemPropertiesOverride,
    );

    if (
      options.publishedItemPropertiesOverride &&
      !this.haveSamePartialCreditRows(
        options.itemPropertiesOverride || {},
        options.publishedItemPropertiesOverride,
      )
    ) {
      const { itemList: publishedItemList } = await this.parseItemListFromFiles(
        acpId,
        options.publishedItemPropertiesOverride,
      );
      await this.applyItemRowNumbers(acpId, publishedItemList, {});
      return this.applyItemRowNumbers(acpId, itemList, {
        persistMissingRowNumbers: false,
      });
    }

    return this.applyItemRowNumbers(acpId, itemList, {});
  }

  private async parseItemListFromFiles(
    acpId: string,
    itemPropertiesOverride?: Record<string, Record<string, unknown>>,
    strictSourceReads = false,
  ): Promise<ParsedItemListResult> {
    const allFiles = await this.fileRepository.find({ where: { acpId } });
    const sourceFileSignature = this.buildSourceFileSignature(allFiles);
    const acp = await this.acpRepository.findOne({ where: { id: acpId } });
    const accessConfig = await this.accessConfigRepository.findOne({
      where: { acpId },
    });
    const itemProps = itemPropertiesOverride || acp?.itemProperties || {};
    const normalizedFeatureConfig = normalizeFeatureConfig(
      accessConfig?.featureConfig || {},
    ) as Record<string, unknown>;
    const subIdLabel = String(
      normalizedFeatureConfig.itemSubIdLabel || "Sub-ID",
    );
    const subIdLabels = this.asStringMap(
      normalizedFeatureConfig.itemSubIdLabels,
    );
    const partialRowsByItemUuid = this.indexPartialCreditRows(itemProps);

    // Collect all columns and items
    const columnMap = new Map<string, string>(); // id → label
    const items: VomdItemData[] = [];
    const unitMetadata: Record<string, any[]> = {};
    const codingSchemes: Record<string, any> = {};

    // First pass: find all .xml files to get unit IDs and references
    const xmlFiles = allFiles.filter(
      (f) =>
        f.originalName.toLowerCase().endsWith(".xml") &&
        !f.originalName.toLowerCase().startsWith("booklet") &&
        !f.originalName.toLowerCase().startsWith("testtaker"),
    );

    for (const xmlFile of xmlFiles) {
      try {
        const xmlContent = await fs.readFile(xmlFile.filePath, "utf-8");
        if (!xmlContent.includes("<Unit")) continue;

        const parsed = this.parseUnitXml(xmlContent, xmlFile.originalName);
        if (!parsed || !parsed.unitId.trim()) {
          if (strictSourceReads) {
            throw new ConflictException(
              `Invalid unit XML file: ${xmlFile.originalName}`,
            );
          }
          continue;
        }

        // Find and parse .vomd file
        const vomdFileName = parsed.metadataRef;
        if (!vomdFileName) continue;

        // Try exact match and .json suffix
        const vomdFile = allFiles.find(
          (f) =>
            f.originalName === vomdFileName ||
            f.originalName === vomdFileName + ".json",
        );
        if (!vomdFile) {
          if (strictSourceReads) {
            throw new ConflictException(
              `Referenced item metadata file is missing: ${vomdFileName}`,
            );
          }
          continue;
        }

        const vomdContent = await fs.readFile(vomdFile.filePath, "utf-8");
        const vomdData = this.parseVomd(vomdContent, strictSourceReads);
        if (!vomdData) {
          if (strictSourceReads) {
            throw new ConflictException(
              `Invalid item metadata file: ${vomdFile.originalName}`,
            );
          }
          continue;
        }

        // Extract unit-level metadata
        if (vomdData.unitProfiles.length > 0) {
          const entries = vomdData.unitProfiles[0]?.entries;
          unitMetadata[parsed.unitId] = Array.isArray(entries) ? entries : [];
        }

        // Find and read .vocs file for coding scheme
        if (parsed.codingSchemeRef) {
          const vocsFile = allFiles.find(
            (f) => f.originalName === parsed.codingSchemeRef,
          );
          if (vocsFile) {
            try {
              const vocsContent = await fs.readFile(vocsFile.filePath, "utf-8");
              codingSchemes[parsed.unitId] = JSON.parse(vocsContent);
            } catch {
              this.logger.warn(
                `Could not parse coding scheme ${parsed.codingSchemeRef}`,
              );
            }
          }
        }

        // Extract items and their profile entries
        for (const item of vomdData.items) {
          if (!this.isValidVomdItem(item)) {
            this.logger.warn(
              `Skipping invalid item metadata in ${vomdFile.originalName}`,
            );
            continue;
          }
          const itemProfiles = item.profiles || [];
          const metadata: Record<string, string> = {};

          for (const profile of itemProfiles) {
            for (const entry of profile.entries || []) {
              const entryId = entry.id;
              const label = this.extractLabelText(entry.label);
              const value = this.extractValueText(entry.valueAsText);

              if (entryId && label) {
                columnMap.set(entryId, label);
              }
              if (entryId) {
                metadata[entryId] = value;
              }
            }
          }

          let resolvedItemId = item.id;
          if (item.useUnitAliasAsPrefix !== false) {
            resolvedItemId = `${parsed.unitId}_${item.id}`;
          }

          const sourceVariable =
            item.sourceVariable ||
            item.variableId ||
            item.variableReadOnlyId ||
            "";

          const itemUuid = item.uuid || `${parsed.unitId}_${item.id}`;
          const baseProperties = this.resolveItemProperties(itemProps, [
            itemUuid,
            resolvedItemId,
            item.id,
          ]);
          const partialRows = partialRowsByItemUuid.get(itemUuid) || [];

          const explorerRows = partialRows.length
            ? partialRows
            : [
                {
                  rowKey: buildItemRowKey(itemUuid),
                  subId: "",
                  properties: baseProperties,
                },
              ];

          for (const explorerRow of explorerRows) {
            const rowProperties = {
              ...baseProperties,
              ...explorerRow.properties,
            };
            const empiricalDifficultyRaw = rowProperties.empiricalDifficulty;
            const empiricalDifficulty =
              empiricalDifficultyRaw === undefined ||
              empiricalDifficultyRaw === null ||
              !Number.isFinite(Number(empiricalDifficultyRaw))
                ? undefined
                : Number(empiricalDifficultyRaw);

            items.push({
              itemId: item.id,
              uuid: itemUuid,
              rowKey: explorerRow.rowKey,
              rowNumber: 0,
              subId: explorerRow.subId || undefined,
              subIdDisplay: explorerRow.subId
                ? subIdLabels[explorerRow.subId] || explorerRow.subId
                : undefined,
              unitId: parsed.unitId,
              unitLabel: parsed.unitLabel,
              description: item.description || "",
              variableId: sourceVariable,
              sourceVariable: sourceVariable || undefined,
              metadata: { ...metadata },
              empiricalDifficulty,
              tags: Array.isArray(rowProperties.tags)
                ? rowProperties.tags.map((tag) => String(tag))
                : [],
            });
          }
        }
      } catch (e) {
        this.logger.error(`Error processing ${xmlFile.originalName}: ${e}`);
        if (strictSourceReads) {
          if (e instanceof ConflictException) {
            throw e;
          }
          throw new ConflictException(
            "The ACP source files changed while row numbers were being recalculated",
          );
        }
      }
    }

    // Build columns array
    const columns: MetadataColumn[] = Array.from(columnMap.entries()).map(
      ([id, label]) => ({ id, label }),
    );

    const itemList: ItemListResult = {
      columns,
      items,
      subIdLabel,
      subIdLabels,
      unitMetadata,
      codingSchemes,
    };

    return { itemList, sourceFileSignature };
  }

  async recalculatePublishedItemRowNumbers(
    acpId: string,
  ): Promise<{ renumberedCount: number }> {
    const publishedState =
      await this.itemExplorerStateService.getCleanPublishedState(acpId);
    const { itemList, sourceFileSignature } = await this.parseItemListFromFiles(
      acpId,
      publishedState.publishedState.itemProperties,
      true,
    );

    return this.itemExplorerStateService.runWithLockedCleanState(
      acpId,
      async (_explorerState, manager) => {
        const result = await this.applyItemRowNumbers(acpId, itemList, {
          recalculateRowNumbers: true,
          rowNumberingManager: manager,
          validateSourceFiles: (lockedManager) =>
            this.assertSourceFilesUnchanged(
              acpId,
              sourceFileSignature,
              lockedManager,
            ),
        });
        return { renumberedCount: result.items.length };
      },
      publishedState.publishedVersion,
    );
  }

  private async applyItemRowNumbers(
    acpId: string,
    itemList: ItemListResult,
    options: {
      recalculateRowNumbers?: boolean;
      rowNumberingManager?: EntityManager;
      validateSourceFiles?: (manager: EntityManager) => Promise<void>;
      persistMissingRowNumbers?: boolean;
    },
  ): Promise<ItemListResult> {
    const numberableRows = itemList.items.map((item) => {
      return {
        rowKey: item.rowKey,
        itemId: item.itemId,
        unitId: item.unitId,
        subId: item.subId,
      };
    });

    const rowNumbers = options.recalculateRowNumbers
      ? await this.itemRowNumberingService.recalculateNumbers(
          acpId,
          numberableRows,
          options.rowNumberingManager,
          options.validateSourceFiles,
        )
      : options.persistMissingRowNumbers === false
        ? await this.itemRowNumberingService.assignProvisionalNumbers(
            acpId,
            numberableRows,
          )
        : await this.itemRowNumberingService.assignNumbers(
            acpId,
            numberableRows,
          );
    for (const item of itemList.items) {
      item.rowNumber = rowNumbers.get(item.rowKey)!;
    }

    return itemList;
  }

  private async assertSourceFilesUnchanged(
    acpId: string,
    expectedSignature: string,
    manager: EntityManager,
  ): Promise<void> {
    const currentFiles = await manager
      .getRepository(AcpFile)
      .createQueryBuilder("file")
      .setLock("pessimistic_read")
      .where("file.acpId = :acpId", { acpId })
      .orderBy("file.id", "ASC")
      .getMany();

    if (this.buildSourceFileSignature(currentFiles) !== expectedSignature) {
      throw new ConflictException(
        "The ACP source files changed while row numbers were being recalculated",
      );
    }
  }

  private buildSourceFileSignature(files: AcpFile[]): string {
    return JSON.stringify(
      files
        .map((file) => [
          file.id,
          file.originalName,
          file.filePath,
          file.checksum || "",
          String(file.fileSize || ""),
          file.uploadedAt instanceof Date
            ? file.uploadedAt.toISOString()
            : String(file.uploadedAt || ""),
        ])
        .sort(([left], [right]) => String(left).localeCompare(String(right))),
    );
  }

  /**
   * Resolve the row keys that can currently be shown in the Item Explorer.
   * The cache signature follows both uploaded file revisions and the active
   * Explorer item-property keys, which are what create partial-credit rows.
   */
  async getItemRowKeysFromFiles(
    acpId: string,
    options: {
      itemPropertiesOverride?: Record<string, Record<string, unknown>>;
      publishedItemPropertiesOverride?: Record<string, Record<string, unknown>>;
    } = {},
  ): Promise<ReadonlySet<string>> {
    const [files, acp] = await Promise.all([
      this.fileRepository.find({ where: { acpId } }),
      this.acpRepository.findOne({ where: { id: acpId } }),
    ]);
    const itemProperties =
      options.itemPropertiesOverride || acp?.itemProperties || {};
    const signature = JSON.stringify({
      files: files
        .map((file) => [
          file.id,
          file.originalName,
          file.checksum || "",
          String(file.fileSize || ""),
          file.uploadedAt instanceof Date
            ? file.uploadedAt.toISOString()
            : String(file.uploadedAt || ""),
        ])
        .sort(([left], [right]) => String(left).localeCompare(String(right))),
      itemPropertyKeys: Object.keys(itemProperties).sort(),
      publishedItemPropertyKeys: Object.keys(
        options.publishedItemPropertiesOverride || {},
      ).sort(),
    });
    const cacheKey = `${acpId}:${signature}`;
    const cached = this.itemRowKeyCache.get(cacheKey);
    if (cached?.signature === signature) {
      return cached.rowKeys;
    }

    const itemList = await this.getItemListFromFiles(acpId, options);
    const rowKeys = new Set(
      itemList.items
        .map((item) => String(item.rowKey || "").trim())
        .filter(Boolean),
    );
    if (this.itemRowKeyCache.size >= this.maxItemRowKeyCacheEntries) {
      const oldestKey = this.itemRowKeyCache.keys().next().value as
        | string
        | undefined;
      if (oldestKey) this.itemRowKeyCache.delete(oldestKey);
    }
    this.itemRowKeyCache.set(cacheKey, { signature, rowKeys });
    return rowKeys;
  }

  private resolveItemProperties(
    itemProperties: Record<string, Record<string, unknown>>,
    keys: string[],
  ): Record<string, unknown> {
    const merged: Record<string, unknown> = {};
    for (const key of [...keys].reverse()) {
      const value = itemProperties[key];
      if (value && typeof value === "object" && !Array.isArray(value)) {
        Object.assign(merged, value);
      }
    }
    return merged;
  }

  private indexPartialCreditRows(
    itemProperties: Record<string, Record<string, unknown>>,
  ): Map<string, PartialCreditRow[]> {
    const indexed = new Map<string, PartialCreditRow[]>();
    for (const [rowKey, rawProperties] of Object.entries(itemProperties)) {
      const parts = parseItemRowKeyParts(rowKey);
      if (
        !parts ||
        !rawProperties ||
        typeof rawProperties !== "object" ||
        Array.isArray(rawProperties)
      ) {
        continue;
      }

      const rows = indexed.get(parts.itemUuid) || [];
      rows.push({
        rowKey,
        subId: parts.subId,
        properties: rawProperties,
      });
      indexed.set(parts.itemUuid, rows);
    }
    return indexed;
  }

  private haveSamePartialCreditRows(
    left: Record<string, Record<string, unknown>>,
    right: Record<string, Record<string, unknown>>,
  ): boolean {
    const leftKeys = Object.keys(left).filter(
      (rowKey) => parseItemRowKeyParts(rowKey) !== null,
    );
    const rightKeys = Object.keys(right).filter(
      (rowKey) => parseItemRowKeyParts(rowKey) !== null,
    );
    if (leftKeys.length !== rightKeys.length) {
      return false;
    }
    const rightKeySet = new Set(rightKeys);
    return leftKeys.every((rowKey) => rightKeySet.has(rowKey));
  }

  private asStringMap(value: unknown): Record<string, string> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }
    const normalized: Record<string, string> = {};
    for (const [key, label] of Object.entries(value)) {
      if (typeof label === "string" && key.trim() && label.trim()) {
        normalized[key.trim()] = label.trim();
      }
    }
    return normalized;
  }

  /**
   * Get unit view data (player + definition file references) directly from
   * uploaded files, without relying on the ACP-Index.
   */
  async getUnitViewFromFiles(acpId: string, unitId: string): Promise<any> {
    const allFiles = await this.fileRepository.find({ where: { acpId } });

    // Find the .xml file for this unit
    const xmlFile = allFiles.find((f: AcpFile) => {
      const baseName = f.originalName.replace(/\.xml$/i, "");
      return baseName === unitId;
    });
    if (!xmlFile) return null;

    const xmlContent = await fs.readFile(xmlFile.filePath, "utf-8");
    if (!xmlContent.includes("<Unit")) return null;

    const parsed = this.parseUnitXml(xmlContent, xmlFile.originalName);
    if (!parsed) return null;

    // Build dependencies array (same structure as views.service getUnitViewData)
    const dependencies: any[] = [];

    // Player file
    const playerFileName = this.findPlayerFile(
      parsed.playerRef,
      allFiles.map((f: AcpFile) => f.originalName),
    );
    if (playerFileName) {
      const playerFile = allFiles.find(
        (f: AcpFile) => f.originalName === playerFileName,
      );
      if (playerFile) {
        dependencies.push({
          type: "PLAYER",
          originalName: playerFile.originalName,
          downloadUrl: `/api/acp/${acpId}/files/${playerFile.id}/download`,
          fileId: playerFile.id,
        });
      }
    }

    // Definition (.voud) file
    if (parsed.definitionRef) {
      const defFile = allFiles.find(
        (f: AcpFile) => f.originalName === parsed.definitionRef,
      );
      if (defFile) {
        dependencies.push({
          type: "UNIT_DEFINITION",
          originalName: defFile.originalName,
          downloadUrl: `/api/acp/${acpId}/files/${defFile.id}/download`,
          fileId: defFile.id,
        });
      }
    }

    // Coding scheme (.vocs) file
    if (parsed.codingSchemeRef) {
      const vocsFile = allFiles.find(
        (f: AcpFile) => f.originalName === parsed.codingSchemeRef,
      );
      if (vocsFile) {
        dependencies.push({
          type: "CODING_SCHEME",
          originalName: vocsFile.originalName,
          downloadUrl: `/api/acp/${acpId}/files/${vocsFile.id}/download`,
          fileId: vocsFile.id,
        });
      }
    }

    // Metadata (.vomd) file
    if (parsed.metadataRef) {
      const vomdFile = allFiles.find(
        (f: AcpFile) =>
          f.originalName === parsed.metadataRef ||
          f.originalName === parsed.metadataRef + ".json",
      );
      if (vomdFile) {
        dependencies.push({
          type: "METADATA",
          originalName: vomdFile.originalName,
          downloadUrl: `/api/acp/${acpId}/files/${vomdFile.id}/download`,
          fileId: vomdFile.id,
        });
      }
    }

    return {
      id: parsed.unitId,
      name: parsed.unitLabel,
      description: parsed.description,
      dependencies,
    };
  }

  private buildDependenciesFromUnitRefs(
    parsedUnit: UnitXmlData,
    fileNames: string[],
    fileNameSet: Set<string>,
    warningSet: Set<string>,
  ): { id: string; type: string }[] {
    const dependencies: { id: string; type: string }[] = [];

    if (parsedUnit.definitionRef) {
      dependencies.push({
        id: parsedUnit.definitionRef,
        type: "UNIT_DEFINITION",
      });
      if (!fileNameSet.has(parsedUnit.definitionRef)) {
        warningSet.add(
          `Unit "${parsedUnit.unitId}" referenziert fehlende Definitionsdatei: ${parsedUnit.definitionRef}`,
        );
      }
    }

    if (parsedUnit.codingSchemeRef) {
      dependencies.push({
        id: parsedUnit.codingSchemeRef,
        type: "CODING_SCHEME",
      });
      if (!fileNameSet.has(parsedUnit.codingSchemeRef)) {
        warningSet.add(
          `Unit "${parsedUnit.unitId}" referenziert fehlendes Kodierschema: ${parsedUnit.codingSchemeRef}`,
        );
      }
    }

    if (parsedUnit.metadataRef) {
      const metadataFileName = fileNameSet.has(parsedUnit.metadataRef)
        ? parsedUnit.metadataRef
        : fileNameSet.has(`${parsedUnit.metadataRef}.json`)
          ? `${parsedUnit.metadataRef}.json`
          : parsedUnit.metadataRef;

      dependencies.push({ id: metadataFileName, type: "METADATA" });
      if (!fileNameSet.has(metadataFileName)) {
        warningSet.add(
          `Unit "${parsedUnit.unitId}" referenziert fehlende Metadaten: ${parsedUnit.metadataRef}`,
        );
      }
    }

    if (parsedUnit.playerRef) {
      const playerFileName = this.findPlayerFile(
        parsedUnit.playerRef,
        fileNames,
      );
      if (playerFileName) {
        dependencies.push({ id: playerFileName, type: "PLAYER" });
      } else {
        warningSet.add(
          `Unit "${parsedUnit.unitId}" hat keinen passenden Player für Ref "${parsedUnit.playerRef}"`,
        );
      }
    }

    return dependencies;
  }

  private mergeDependencies(
    existing: any[],
    inferred: { id: string; type: string }[],
  ): { id: string; type: string }[] {
    const merged: { id: string; type: string }[] = [];
    const seen = new Set<string>();

    const pushIfValid = (dep: any) => {
      const id = typeof dep?.id === "string" ? dep.id : "";
      if (!id) return;
      const type = typeof dep?.type === "string" ? dep.type : "FILE";
      const key = `${type}::${id}`;
      if (seen.has(key)) return;
      seen.add(key);
      merged.push({ id, type });
    };

    for (const dep of existing || []) pushIfValid(dep);
    for (const dep of inferred || []) pushIfValid(dep);

    return merged;
  }

  private shouldKeepDependency(dep: any, availableFiles: Set<string>): boolean {
    const id = typeof dep?.id === "string" ? dep.id.trim() : "";
    if (!id) return false;

    const type = typeof dep?.type === "string" ? dep.type : "FILE";
    const fileBackedTypes = new Set([
      "UNIT_DEFINITION",
      "CODING_SCHEME",
      "METADATA",
      "PLAYER",
      "FILE",
    ]);

    if (!fileBackedTypes.has(type)) {
      return true;
    }

    return availableFiles.has(id);
  }

  private pruneMissingReferencesFromParts(
    parts: any[],
    fileNameSet: Set<string>,
  ): {
    unitsUpdated: number;
    dependenciesRemoved: number;
    bookletsUpdated: number;
    bookletDefinitionsRemoved: number;
  } {
    let unitsUpdated = 0;
    let dependenciesRemoved = 0;
    let bookletsUpdated = 0;
    let bookletDefinitionsRemoved = 0;

    for (const part of parts) {
      for (let unitIndex = 0; unitIndex < part.units.length; unitIndex++) {
        const unit = part.units[unitIndex];
        const dependencies = Array.isArray(unit?.dependencies)
          ? unit.dependencies
          : [];
        if (!dependencies.length) continue;

        const filteredDependencies = dependencies.filter((dep: any) =>
          this.shouldKeepDependency(dep, fileNameSet),
        );

        const removedForUnit =
          dependencies.length - filteredDependencies.length;
        if (removedForUnit > 0) {
          part.units[unitIndex] = {
            ...unit,
            dependencies: filteredDependencies,
          };
          unitsUpdated++;
          dependenciesRemoved += removedForUnit;
        }
      }

      const sourceInstruments = Array.isArray(part?.instruments)
        ? part.instruments
        : [];
      if (!sourceInstruments.length) {
        continue;
      }

      const instruments = [...sourceInstruments];
      let partInstrumentsChanged = false;

      for (
        let instrumentIndex = 0;
        instrumentIndex < instruments.length;
        instrumentIndex++
      ) {
        const instrument = instruments[instrumentIndex];
        const sourceBooklets = Array.isArray(instrument?.testcenterBooklet)
          ? instrument.testcenterBooklet
          : [];
        if (!sourceBooklets.length) {
          continue;
        }

        const booklets = [...sourceBooklets];
        let instrumentChanged = false;

        for (
          let bookletIndex = 0;
          bookletIndex < booklets.length;
          bookletIndex++
        ) {
          const booklet = booklets[bookletIndex];
          if (
            !booklet ||
            typeof booklet !== "object" ||
            Array.isArray(booklet)
          ) {
            continue;
          }

          const definitionId =
            typeof booklet.definitionId === "string"
              ? booklet.definitionId.trim()
              : "";
          if (!definitionId || fileNameSet.has(definitionId)) {
            continue;
          }

          const { definitionId: _removed, ...bookletWithoutDefinition } =
            booklet;
          booklets[bookletIndex] = bookletWithoutDefinition;
          instrumentChanged = true;
          bookletsUpdated++;
          bookletDefinitionsRemoved++;
        }

        if (instrumentChanged) {
          instruments[instrumentIndex] = {
            ...instrument,
            testcenterBooklet: booklets,
          };
          partInstrumentsChanged = true;
        }
      }

      if (partInstrumentsChanged) {
        part.instruments = instruments;
      }
    }

    return {
      unitsUpdated,
      dependenciesRemoved,
      bookletsUpdated,
      bookletDefinitionsRemoved,
    };
  }

  private async extractItemsForUnit(
    parsedUnit: UnitXmlData,
    allFiles: AcpFile[],
    warningSet: Set<string>,
  ): Promise<
    Array<{
      id: string;
      name: string;
      sourceVariable?: string;
      metadata: Record<string, string>;
      useUnitAliasAsPrefix?: boolean;
    }>
  > {
    if (!parsedUnit.metadataRef) return [];

    const vomdFile = this.findFileByOriginalName(
      allFiles,
      parsedUnit.metadataRef,
    );
    if (!vomdFile) {
      warningSet.add(
        `Unit "${parsedUnit.unitId}" referenziert VOMD "${parsedUnit.metadataRef}", die nicht hochgeladen wurde`,
      );
      return [];
    }

    let vomdContent = "";
    try {
      vomdContent = await fs.readFile(vomdFile.filePath, "utf-8");
    } catch (e) {
      warningSet.add(
        `VOMD für Unit "${parsedUnit.unitId}" konnte nicht gelesen werden: ${vomdFile.originalName}`,
      );
      this.logger.warn(`Could not read VOMD ${vomdFile.originalName}: ${e}`);
      return [];
    }

    const vomdData = this.parseVomd(vomdContent);
    if (!vomdData) {
      warningSet.add(
        `VOMD für Unit "${parsedUnit.unitId}" ist ungültig: ${vomdFile.originalName}`,
      );
      return [];
    }

    const parsedItems: Array<{
      id: string;
      name: string;
      sourceVariable?: string;
      metadata: Record<string, string>;
      useUnitAliasAsPrefix?: boolean;
    }> = [];
    for (const item of vomdData.items || []) {
      if (
        !this.isRecord(item) ||
        typeof item.id !== "string" ||
        item.id.trim().length === 0
      ) {
        warningSet.add(
          `Unit "${parsedUnit.unitId}" enthält ein Item ohne ID in ${vomdFile.originalName}`,
        );
        continue;
      }
      if (!this.isValidVomdItem(item)) {
        warningSet.add(
          `Unit "${parsedUnit.unitId}" enthält ein Item mit ungültiger Profilstruktur in ${vomdFile.originalName}`,
        );
        continue;
      }

      const metadata: Record<string, string> = {};
      for (const profile of item.profiles || []) {
        for (const entry of profile.entries || []) {
          if (!entry?.id) continue;
          metadata[entry.id] = this.extractValueText(entry.valueAsText);
        }
      }

      parsedItems.push({
        id: item.id,
        name: item.description || item.id,
        sourceVariable:
          item.sourceVariable ||
          item.variableId ||
          item.variableReadOnlyId ||
          undefined,
        metadata,
        useUnitAliasAsPrefix: item.useUnitAliasAsPrefix,
      });
    }

    return parsedItems;
  }

  private findFileByOriginalName(
    allFiles: AcpFile[],
    originalName: string,
  ): AcpFile | undefined {
    return allFiles.find(
      (f) =>
        f.originalName === originalName ||
        f.originalName === `${originalName}.json`,
    );
  }

  /**
   * Extract text from a language-coded label array.
   * Input: [{"lang":"de","value":"Itemformat"}] → "Itemformat"
   */
  private extractLabelText(label: any): string {
    if (!label) return "";
    if (typeof label === "string") return label;
    if (Array.isArray(label)) {
      const de = label.find((l: any) => l.lang === "de");
      return de?.value || label[0]?.value || "";
    }
    return "";
  }

  /**
   * Extract display text from valueAsText field.
   * Can be: [{"lang":"de","value":"..."}] or {"lang":"de","value":"..."} or string
   */
  private extractValueText(valueAsText: any): string {
    if (!valueAsText) return "";
    if (typeof valueAsText === "string") return valueAsText;
    if (Array.isArray(valueAsText)) {
      const de = valueAsText.find((v: any) => v.lang === "de");
      return de?.value || valueAsText[0]?.value || "";
    }
    if (typeof valueAsText === "object" && valueAsText.value) {
      return valueAsText.value;
    }
    return "";
  }
}
