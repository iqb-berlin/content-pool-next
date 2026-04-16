import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs/promises';
import { AcpFile, Acp } from '../database/entities';

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

          items.push({
            itemId: item.id,
            uuid: item.uuid || `${parsed.unitId}_${item.id}`,
            unitId: parsed.unitId,
            unitLabel: parsed.unitLabel,
            description: item.description || '',
            variableId: item.variableId || item.variableReadOnlyId || '',
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
