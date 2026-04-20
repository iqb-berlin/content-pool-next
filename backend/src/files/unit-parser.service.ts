import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs/promises';
import { AcpFile, Acp } from '../database/entities';
import { getAssessmentParts, normalizeIndexForStorage } from '../acp/acp-index.utils';

/** Parsed reference data from a unit .xml file */
export interface UnitXmlData {
  unitId: string;
  unitLabel: string;
  description?: string;
  definitionRef: string;     // .voud filename
  playerRef: string;         // e.g. "iqb-player-aspect@2.11"
  codingSchemeRef?: string;  // .vocs filename
  metadataRef?: string;      // .vomd filename
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
  unitId: string;
  unitLabel: string;
  description: string;
  variableId: string;
  sourceVariable?: string;
  metadata: Record<string, string>;
  empiricalDifficulty?: number;
  tags?: string[];
}

/** Full item list response */
export interface ItemListResult {
  columns: MetadataColumn[];
  items: VomdItemData[];
  unitMetadata: Record<string, any[]>; // unitId → unit-level profile entries
  codingSchemes: Record<string, any>;  // unitId → coding scheme JSON
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

  constructor(
    @InjectRepository(AcpFile)
    private readonly fileRepository: Repository<AcpFile>,
    @InjectRepository(Acp)
    private readonly acpRepository: Repository<Acp>,
  ) {}

  /**
   * Parse a Unit .xml file content and extract references.
   */
  parseUnitXml(xmlContent: string, xmlFilename: string): UnitXmlData | null {
    try {
      // Extract <Id>
      const idMatch = xmlContent.match(/<Id>([^<]+)<\/Id>/);
      const unitId = idMatch?.[1] || '';

      // Extract <Label>
      const labelMatch = xmlContent.match(/<Label>([^<]+)<\/Label>/);
      const unitLabel = labelMatch?.[1] || unitId;

      // Extract <Description>
      const descMatch = xmlContent.match(/<Description>([^<]*)<\/Description>/);
      const description = descMatch?.[1] || undefined;

      // Extract <DefinitionRef ...>filename.voud</DefinitionRef>
      const defRefMatch = xmlContent.match(/<DefinitionRef[^>]*>([^<]+)<\/DefinitionRef>/);
      const definitionRef = defRefMatch?.[1]?.trim() || '';

      // Extract player attribute from <DefinitionRef player="...">
      const playerAttrMatch = xmlContent.match(/<DefinitionRef[^>]*player="([^"]+)"/);
      const playerRef = playerAttrMatch?.[1] || '';

      // Extract <CodingSchemeRef ...>filename.vocs</CodingSchemeRef>
      const codingRefMatch = xmlContent.match(/<CodingSchemeRef[^>]*>([^<]+)<\/CodingSchemeRef>/);
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
  parseVomd(vomdContent: string): {
    unitProfiles: any[];
    items: any[];
  } | null {
    try {
      const data = JSON.parse(vomdContent);
      return {
        unitProfiles: data.profiles || [],
        items: data.items || [],
      };
    } catch (e) {
      this.logger.error(`Failed to parse .vomd: ${e}`);
      return null;
    }
  }

  /**
   * Resolve a player reference like "iqb-player-aspect@2.11" to an actual
   * uploaded file. Finds the best match among uploaded HTML files.
   */
  private findPlayerFile(playerRef: string, fileNames: string[]): string | undefined {
    if (!playerRef) return undefined;

    // playerRef format: "iqb-player-aspect@2.11"
    // Uploaded file format: "iqb-player-aspect-2.11.6.html"
    // Strategy: match base name and major.minor version
    const parts = playerRef.split('@');
    const baseName = parts[0]; // e.g. "iqb-player-aspect"
    const version = parts[1];  // e.g. "2.11"

    return fileNames.find(name => {
      const lower = name.toLowerCase();
      return lower.includes(baseName.toLowerCase()) &&
             (version ? lower.includes(version) : true) &&
             lower.endsWith('.html');
    });
  }

  /**
   * Validate that all files referenced by a unit .xml are present.
   */
  async validateUnitFiles(acpId: string): Promise<UnitValidationResult[]> {
    // Get all files for this ACP
    const allFiles = await this.fileRepository.find({ where: { acpId } });
    const fileNames = allFiles.map(f => f.originalName);
    const results: UnitValidationResult[] = [];

    // Find all .xml files
    const xmlFiles = allFiles.filter(f =>
      f.originalName.toLowerCase().endsWith('.xml') &&
      !f.originalName.toLowerCase().startsWith('booklet') &&
      !f.originalName.toLowerCase().startsWith('testtaker'),
    );

    for (const xmlFile of xmlFiles) {
      try {
        const content = await fs.readFile(xmlFile.filePath, 'utf-8');

        // Only process Unit XML files (not booklet or testtaker XMLs)
        if (!content.includes('<Unit')) continue;

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
              expected: parsed.codingSchemeRef || '(nicht referenziert)',
              found: parsed.codingSchemeRef ? fileNames.includes(parsed.codingSchemeRef) : true,
            },
            metadata: {
              expected: parsed.metadataRef || '(nicht referenziert)',
              found: parsed.metadataRef
                ? fileNames.some(n => n === parsed.metadataRef || n === parsed.metadataRef + '.json')
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
        result.valid = result.files.definition.found &&
                       result.files.codingScheme.found &&
                       result.files.metadata.found &&
                       result.files.player.found;

        results.push(result);
      } catch (e) {
        this.logger.error(`Error validating unit file ${xmlFile.originalName}: ${e}`);
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
  async syncIndexFromFiles(acpId: string): Promise<IndexSyncReport> {
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
        id: 'default-assessment-part',
        name: [{ lang: 'de', value: 'Default Assessment Part' }],
        units: [],
      });
    }

    const unitLocation = new Map<string, { partIndex: number; unitIndex: number }>();
    for (let partIndex = 0; partIndex < parts.length; partIndex++) {
      const units = Array.isArray(parts[partIndex].units) ? parts[partIndex].units : [];
      parts[partIndex].units = units;
      for (let unitIndex = 0; unitIndex < units.length; unitIndex++) {
        const unitId = typeof units[unitIndex]?.id === 'string' ? units[unitIndex].id : '';
        if (unitId && !unitLocation.has(unitId)) {
          unitLocation.set(unitId, { partIndex, unitIndex });
        }
      }
    }

    const xmlFiles = allFiles.filter((f) =>
      f.originalName.toLowerCase().endsWith('.xml') &&
      !f.originalName.toLowerCase().startsWith('booklet') &&
      !f.originalName.toLowerCase().startsWith('testtaker'),
    );

    for (const xmlFile of xmlFiles) {
      let xmlContent = '';
      try {
        xmlContent = await fs.readFile(xmlFile.filePath, 'utf-8');
      } catch (e) {
        warningSet.add(`Konnte Unit-XML nicht lesen: ${xmlFile.originalName}`);
        this.logger.warn(`Could not read XML file ${xmlFile.originalName}: ${e}`);
        continue;
      }

      if (!xmlContent.includes('<Unit')) {
        continue;
      }

      const parsedUnit = this.parseUnitXml(xmlContent, xmlFile.originalName);
      if (!parsedUnit?.unitId) {
        warningSet.add(`Unit-XML konnte nicht geparst werden: ${xmlFile.originalName}`);
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

      const existingItems = Array.isArray(existingUnit?.items) ? [...existingUnit.items] : [];
      const parsedItems = await this.extractItemsForUnit(parsedUnit, allFiles, warningSet);
      const mergedItems = [...existingItems];

      for (const parsedItem of parsedItems) {
        const existingIndex = mergedItems.findIndex((i: any) => i?.id === parsedItem.id);
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

        if (nextItem.useUnitAliasAsPrefix === undefined && parsedItem.useUnitAliasAsPrefix !== undefined) {
          nextItem.useUnitAliasAsPrefix = parsedItem.useUnitAliasAsPrefix;
          changed = true;
        }

        if (parsedItem.metadata && Object.keys(parsedItem.metadata).length) {
          const existingMetadata = nextItem.metadata && typeof nextItem.metadata === 'object'
            ? nextItem.metadata
            : {};
          const mergedMetadata = {
            ...parsedItem.metadata,
            ...existingMetadata,
          };
          if (JSON.stringify(mergedMetadata) !== JSON.stringify(existingMetadata)) {
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
        dependencies: this.mergeDependencies(existingDependencies, dependencies),
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
    return report;
  }

  /**
   * Remove unit dependency entries that reference files no longer present
   * in ACP storage. This is intended for cleanup after file deletions.
   */
  async pruneMissingDependencies(acpId: string): Promise<IndexDependencyCleanupReport> {
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
    const indexUpdated = JSON.stringify(acp.acpIndex || {}) !== JSON.stringify(nextIndex);

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
  async getItemListFromFiles(acpId: string): Promise<ItemListResult> {
    const allFiles = await this.fileRepository.find({ where: { acpId } });
    const acp = await this.acpRepository.findOne({ where: { id: acpId } });
    const itemProps = acp?.itemProperties || {};

    // Collect all columns and items
    const columnMap = new Map<string, string>(); // id → label
    const items: VomdItemData[] = [];
    const unitMetadata: Record<string, any[]> = {};
    const codingSchemes: Record<string, any> = {};

    // First pass: find all .xml files to get unit IDs and references
    const xmlFiles = allFiles.filter(f =>
      f.originalName.toLowerCase().endsWith('.xml') &&
      !f.originalName.toLowerCase().startsWith('booklet') &&
      !f.originalName.toLowerCase().startsWith('testtaker'),
    );

    for (const xmlFile of xmlFiles) {
      try {
        const xmlContent = await fs.readFile(xmlFile.filePath, 'utf-8');
        if (!xmlContent.includes('<Unit')) continue;

        const parsed = this.parseUnitXml(xmlContent, xmlFile.originalName);
        if (!parsed) continue;

        // Find and parse .vomd file
        const vomdFileName = parsed.metadataRef;
        if (!vomdFileName) continue;

        // Try exact match and .json suffix
        const vomdFile = allFiles.find(f =>
          f.originalName === vomdFileName ||
          f.originalName === vomdFileName + '.json',
        );
        if (!vomdFile) continue;

        const vomdContent = await fs.readFile(vomdFile.filePath, 'utf-8');
        const vomdData = this.parseVomd(vomdContent);
        if (!vomdData) continue;

        // Extract unit-level metadata
        if (vomdData.unitProfiles.length > 0) {
          unitMetadata[parsed.unitId] = vomdData.unitProfiles[0].entries || [];
        }

        // Find and read .vocs file for coding scheme
        if (parsed.codingSchemeRef) {
          const vocsFile = allFiles.find(f => f.originalName === parsed.codingSchemeRef);
          if (vocsFile) {
            try {
              const vocsContent = await fs.readFile(vocsFile.filePath, 'utf-8');
              codingSchemes[parsed.unitId] = JSON.parse(vocsContent);
            } catch {
              this.logger.warn(`Could not parse coding scheme ${parsed.codingSchemeRef}`);
            }
          }
        }

        // Extract items and their profile entries
        for (const item of vomdData.items) {
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

          const sourceVariable = item.sourceVariable || item.variableId || item.variableReadOnlyId || '';

          items.push({
            itemId: item.id,
            uuid: item.uuid || `${parsed.unitId}_${item.id}`,
            unitId: parsed.unitId,
            unitLabel: parsed.unitLabel,
            description: item.description || '',
            variableId: sourceVariable,
            sourceVariable: sourceVariable || undefined,
            metadata,
            empiricalDifficulty: (item.uuid && itemProps[item.uuid]?.empiricalDifficulty) || itemProps[resolvedItemId]?.empiricalDifficulty || itemProps[item.id]?.empiricalDifficulty,
            tags:
              (item.uuid && Array.isArray(itemProps[item.uuid]?.tags) ? itemProps[item.uuid].tags : undefined) ||
              (Array.isArray(itemProps[resolvedItemId]?.tags) ? itemProps[resolvedItemId].tags : undefined) ||
              (Array.isArray(itemProps[item.id]?.tags) ? itemProps[item.id].tags : undefined) ||
              [],
          });
        }
      } catch (e) {
        this.logger.error(`Error processing ${xmlFile.originalName}: ${e}`);
      }
    }

    // Build columns array
    const columns: MetadataColumn[] = Array.from(columnMap.entries()).map(
      ([id, label]) => ({ id, label }),
    );

    return { columns, items, unitMetadata, codingSchemes };
  }

  /**
   * Get unit view data (player + definition file references) directly from
   * uploaded files, without relying on the ACP-Index.
   */
  async getUnitViewFromFiles(acpId: string, unitId: string): Promise<any> {
    const allFiles = await this.fileRepository.find({ where: { acpId } });

    // Find the .xml file for this unit
    const xmlFile = allFiles.find((f: AcpFile) => {
      const baseName = f.originalName.replace(/\.xml$/i, '');
      return baseName === unitId;
    });
    if (!xmlFile) return null;

    const xmlContent = await fs.readFile(xmlFile.filePath, 'utf-8');
    if (!xmlContent.includes('<Unit')) return null;

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
      const playerFile = allFiles.find((f: AcpFile) => f.originalName === playerFileName);
      if (playerFile) {
        dependencies.push({
          type: 'PLAYER',
          originalName: playerFile.originalName,
          downloadUrl: `/api/acp/${acpId}/files/${playerFile.id}/download`,
          fileId: playerFile.id,
        });
      }
    }

    // Definition (.voud) file
    if (parsed.definitionRef) {
      const defFile = allFiles.find((f: AcpFile) => f.originalName === parsed.definitionRef);
      if (defFile) {
        dependencies.push({
          type: 'UNIT_DEFINITION',
          originalName: defFile.originalName,
          downloadUrl: `/api/acp/${acpId}/files/${defFile.id}/download`,
          fileId: defFile.id,
        });
      }
    }

    // Coding scheme (.vocs) file
    if (parsed.codingSchemeRef) {
      const vocsFile = allFiles.find((f: AcpFile) => f.originalName === parsed.codingSchemeRef);
      if (vocsFile) {
        dependencies.push({
          type: 'CODING_SCHEME',
          originalName: vocsFile.originalName,
          downloadUrl: `/api/acp/${acpId}/files/${vocsFile.id}/download`,
          fileId: vocsFile.id,
        });
      }
    }

    // Metadata (.vomd) file
    if (parsed.metadataRef) {
      const vomdFile = allFiles.find((f: AcpFile) =>
        f.originalName === parsed.metadataRef ||
        f.originalName === parsed.metadataRef + '.json',
      );
      if (vomdFile) {
        dependencies.push({
          type: 'METADATA',
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
      dependencies.push({ id: parsedUnit.definitionRef, type: 'UNIT_DEFINITION' });
      if (!fileNameSet.has(parsedUnit.definitionRef)) {
        warningSet.add(
          `Unit "${parsedUnit.unitId}" referenziert fehlende Definitionsdatei: ${parsedUnit.definitionRef}`,
        );
      }
    }

    if (parsedUnit.codingSchemeRef) {
      dependencies.push({ id: parsedUnit.codingSchemeRef, type: 'CODING_SCHEME' });
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

      dependencies.push({ id: metadataFileName, type: 'METADATA' });
      if (!fileNameSet.has(metadataFileName)) {
        warningSet.add(
          `Unit "${parsedUnit.unitId}" referenziert fehlende Metadaten: ${parsedUnit.metadataRef}`,
        );
      }
    }

    if (parsedUnit.playerRef) {
      const playerFileName = this.findPlayerFile(parsedUnit.playerRef, fileNames);
      if (playerFileName) {
        dependencies.push({ id: playerFileName, type: 'PLAYER' });
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
      const id = typeof dep?.id === 'string' ? dep.id : '';
      if (!id) return;
      const type = typeof dep?.type === 'string' ? dep.type : 'FILE';
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
    const id = typeof dep?.id === 'string' ? dep.id.trim() : '';
    if (!id) return false;

    const type = typeof dep?.type === 'string' ? dep.type : 'FILE';
    const fileBackedTypes = new Set([
      'UNIT_DEFINITION',
      'CODING_SCHEME',
      'METADATA',
      'PLAYER',
      'FILE',
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
        const dependencies = Array.isArray(unit?.dependencies) ? unit.dependencies : [];
        if (!dependencies.length) continue;

        const filteredDependencies = dependencies.filter((dep: any) =>
          this.shouldKeepDependency(dep, fileNameSet),
        );

        const removedForUnit = dependencies.length - filteredDependencies.length;
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

      for (let instrumentIndex = 0; instrumentIndex < instruments.length; instrumentIndex++) {
        const instrument = instruments[instrumentIndex];
        const sourceBooklets = Array.isArray(instrument?.testcenterBooklet)
          ? instrument.testcenterBooklet
          : [];
        if (!sourceBooklets.length) {
          continue;
        }

        const booklets = [...sourceBooklets];
        let instrumentChanged = false;

        for (let bookletIndex = 0; bookletIndex < booklets.length; bookletIndex++) {
          const booklet = booklets[bookletIndex];
          if (!booklet || typeof booklet !== 'object' || Array.isArray(booklet)) {
            continue;
          }

          const definitionId = typeof booklet.definitionId === 'string'
            ? booklet.definitionId.trim()
            : '';
          if (!definitionId || fileNameSet.has(definitionId)) {
            continue;
          }

          const { definitionId: _removed, ...bookletWithoutDefinition } = booklet;
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
  ): Promise<Array<{ id: string; name: string; sourceVariable?: string; metadata: Record<string, string>; useUnitAliasAsPrefix?: boolean }>> {
    if (!parsedUnit.metadataRef) return [];

    const vomdFile = this.findFileByOriginalName(allFiles, parsedUnit.metadataRef);
    if (!vomdFile) {
      warningSet.add(
        `Unit "${parsedUnit.unitId}" referenziert VOMD "${parsedUnit.metadataRef}", die nicht hochgeladen wurde`,
      );
      return [];
    }

    let vomdContent = '';
    try {
      vomdContent = await fs.readFile(vomdFile.filePath, 'utf-8');
    } catch (e) {
      warningSet.add(
        `VOMD für Unit "${parsedUnit.unitId}" konnte nicht gelesen werden: ${vomdFile.originalName}`,
      );
      this.logger.warn(`Could not read VOMD ${vomdFile.originalName}: ${e}`);
      return [];
    }

    const vomdData = this.parseVomd(vomdContent);
    if (!vomdData) {
      warningSet.add(`VOMD für Unit "${parsedUnit.unitId}" ist kein valides JSON: ${vomdFile.originalName}`);
      return [];
    }

    const parsedItems: Array<{ id: string; name: string; sourceVariable?: string; metadata: Record<string, string>; useUnitAliasAsPrefix?: boolean }> = [];
    for (const item of vomdData.items || []) {
      if (!item?.id) {
        warningSet.add(`Unit "${parsedUnit.unitId}" enthält ein Item ohne ID in ${vomdFile.originalName}`);
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
        sourceVariable: item.sourceVariable || item.variableId || item.variableReadOnlyId || undefined,
        metadata,
        useUnitAliasAsPrefix: item.useUnitAliasAsPrefix,
      });
    }

    return parsedItems;
  }

  private findFileByOriginalName(allFiles: AcpFile[], originalName: string): AcpFile | undefined {
    return allFiles.find(
      (f) => f.originalName === originalName || f.originalName === `${originalName}.json`,
    );
  }

  /**
   * Extract text from a language-coded label array.
   * Input: [{"lang":"de","value":"Itemformat"}] → "Itemformat"
   */
  private extractLabelText(label: any): string {
    if (!label) return '';
    if (typeof label === 'string') return label;
    if (Array.isArray(label)) {
      const de = label.find((l: any) => l.lang === 'de');
      return de?.value || label[0]?.value || '';
    }
    return '';
  }

  /**
   * Extract display text from valueAsText field.
   * Can be: [{"lang":"de","value":"..."}] or {"lang":"de","value":"..."} or string
   */
  private extractValueText(valueAsText: any): string {
    if (!valueAsText) return '';
    if (typeof valueAsText === 'string') return valueAsText;
    if (Array.isArray(valueAsText)) {
      const de = valueAsText.find((v: any) => v.lang === 'de');
      return de?.value || valueAsText[0]?.value || '';
    }
    if (typeof valueAsText === 'object' && valueAsText.value) {
      return valueAsText.value;
    }
    return '';
  }
}
