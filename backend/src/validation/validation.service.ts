import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs/promises';
import { AcpFile, Acp } from '../database/entities';
import {
  ACP_INDEX_ALLOWED_STATUS_VALUES,
  getAssessmentParts,
  getIndexScales,
  getIndexUnits,
  toRuntimeAcpIndex,
} from '../acp/acp-index.utils';

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  message: string;
  field?: string;
  path?: string;
  scope?: 'syntactic' | 'schema' | 'semantic';
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  timestamp: string;
}

export interface AutoValidationSummary {
  totalFiles: number;
  validFiles: number;
  invalidFiles: number;
  semanticValid: boolean;
  semanticIssueCount: number;
  timestamp: string;
}

@Injectable()
export class ValidationService {
  private readonly logger = new Logger(ValidationService.name);

  constructor(
    @InjectRepository(AcpFile)
    private readonly fileRepository: Repository<AcpFile>,
    @InjectRepository(Acp)
    private readonly acpRepository: Repository<Acp>,
  ) {}

  /**
   * Validate a single file (syntactic validation).
   */
  async validateFile(
    file: AcpFile,
    buffer: Buffer,
    persist = true,
  ): Promise<ValidationResult> {
    const issues: ValidationIssue[] = [];

    // Check file extension and apply format-specific validation
    const name = file.originalName.toLowerCase();

    if (name.endsWith('.json')) {
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(buffer.toString('utf-8'));
      } catch (e: any) {
        issues.push({
          severity: 'error',
          message: `Invalid JSON: ${e.message}`,
          scope: 'syntactic',
        });
      }
      if (parsedJson !== undefined) {
        issues.push(...this.validateJsonSchema(file.originalName, parsedJson));
      }
    } else if (name.endsWith('.xml')) {
      // Basic XML well-formedness check
      const content = buffer.toString('utf-8');
      if (!content.trim().startsWith('<')) {
        issues.push({
          severity: 'error',
          message: 'File does not appear to be valid XML',
          scope: 'syntactic',
        });
      }
    }

    if (buffer.length === 0) {
      issues.push({
        severity: 'warning',
        message: 'File is empty',
        scope: 'syntactic',
      });
    }

    const result: ValidationResult = {
      valid: !issues.some((i) => i.severity === 'error'),
      issues,
      timestamp: new Date().toISOString(),
    };

    if (persist) {
      // Store validation result
      file.validationResult = result as any;
      await this.fileRepository.save(file);
    }

    return result;
  }

  /**
   * Validate freshly uploaded files automatically and persist per-file results.
   * Merges syntactic/schema checks with ACP-wide semantic checks.
   */
  async autoValidateUploadedFiles(
    acpId: string,
    files: AcpFile[],
  ): Promise<{ files: AcpFile[]; summary: AutoValidationSummary }> {
    if (!files.length) {
      return {
        files: [],
        summary: {
          totalFiles: 0,
          validFiles: 0,
          invalidFiles: 0,
          semanticValid: true,
          semanticIssueCount: 0,
          timestamp: new Date().toISOString(),
        },
      };
    }

    const syntacticAndSchemaResults = new Map<string, ValidationResult>();

    for (const file of files) {
      try {
        const buffer = await fs.readFile(file.filePath);
        const result = await this.validateFile(file, buffer, false);
        syntacticAndSchemaResults.set(file.id, result);
      } catch {
        syntacticAndSchemaResults.set(file.id, {
          valid: false,
          issues: [
            {
              severity: 'error',
              message: 'File is missing on disk and could not be validated',
              scope: 'syntactic',
            },
          ],
          timestamp: new Date().toISOString(),
        });
      }
    }

    const semanticResult = await this.validateAcpConsistency(acpId);
    const semanticIssues = semanticResult.issues.map((issue) => ({
      ...issue,
      scope: 'semantic' as const,
    }));

    const now = new Date().toISOString();
    const validatedEntries = files.map((file) => {
      const fileResult = syntacticAndSchemaResults.get(file.id) || {
        valid: false,
        issues: [
          {
            severity: 'error',
            message: 'Validation result missing',
            scope: 'syntactic' as const,
          },
        ],
        timestamp: now,
      };
      const mergedIssues = [...fileResult.issues, ...semanticIssues];
      const mergedResult: ValidationResult = {
        valid: fileResult.valid && semanticResult.valid,
        issues: mergedIssues,
        timestamp: now,
      };
      file.validationResult = mergedResult as unknown as Record<string, unknown>;
      return { file, result: mergedResult };
    });
    const validatedFiles = validatedEntries.map((entry) => entry.file);

    await this.fileRepository.save(validatedFiles);

    const validFiles = validatedEntries.filter((entry) => entry.result.valid).length;

    return {
      files: validatedFiles,
      summary: {
        totalFiles: validatedFiles.length,
        validFiles,
        invalidFiles: validatedFiles.length - validFiles,
        semanticValid: semanticResult.valid,
        semanticIssueCount: semanticResult.issues.length,
        timestamp: now,
      },
    };
  }

  /**
   * Semantic validation: check cross-references within an ACP.
   */
  async validateAcpConsistency(acpId: string): Promise<ValidationResult> {
    const acp = await this.acpRepository.findOne({ where: { id: acpId } });
    if (!acp) {
      return {
        valid: false,
        issues: [{ severity: 'error', message: 'ACP not found' }],
        timestamp: new Date().toISOString(),
      };
    }

    const issues: ValidationIssue[] = [];
    const index = toRuntimeAcpIndex(acp.acpIndex);
    const units = getIndexUnits(index);
    const files = await this.fileRepository.find({ where: { acpId } });
    const fileNames = new Set(files.map((f) => f.originalName));

    // Check that all unit dependencies reference existing files
    for (const unit of units) {
      for (const dep of unit.dependencies || []) {
        if (!fileNames.has(dep.id)) {
          issues.push({
            severity: 'error',
            message: `Unit "${unit.id}" references missing file: ${dep.id}`,
            path: `units/${unit.id}/dependencies`,
          });
        }
      }
    }

    // Check that booklet modules reference existing units
    for (const part of getAssessmentParts(index)) {
      for (const module of part.bookletModules || []) {
        for (const modUnit of module.units || []) {
          const unitExists = units.some(
            (u: any) => u.id === modUnit.id,
          );
          if (!unitExists) {
            issues.push({
              severity: 'error',
              message: `Module "${module.id}" references missing unit: ${modUnit.id}`,
              path: `assessmentParts/bookletModules/${module.id}/units`,
            });
          }
        }
      }

      // Check instruments reference existing modules
      for (const instrument of part.instruments || []) {
        for (const booklet of instrument.testcenterBooklet || []) {
          if (!fileNames.has(booklet.definitionId)) {
            issues.push({
              severity: 'warning',
              message: `Instrument "${instrument.id}" references missing booklet file: ${booklet.definitionId}`,
              path: `assessmentParts/instruments/${instrument.id}`,
            });
          }
          for (const modRef of booklet.modules || []) {
            const moduleRefId = this.resolveModuleReferenceId(modRef);
            const moduleExists = (part.bookletModules || []).some(
              (m: any) => m.id === moduleRefId,
            );
            if (!moduleRefId || !moduleExists) {
              issues.push({
                severity: 'error',
                message: `Instrument "${instrument.id}" references missing module: ${moduleRefId || '(unbekannt)'}`,
                path: `assessmentParts/instruments/${instrument.id}`,
              });
            }
          }
        }
      }
    }

    // Check scale item references
    for (const scale of getIndexScales(index)) {
      if (scale.typeParameters?.items) {
        for (const scaleItem of scale.typeParameters.items) {
          // Check if item ID exists in any unit
          const itemExists = units.some((u: any) =>
            (u.items || []).some((i: any) => {
              const fullId = i.useUnitAliasAsPrefix !== false
                ? `${u.id}_${i.id}`
                : i.id;
              return fullId === scaleItem.id || i.id === scaleItem.id;
            }),
          );
          if (!itemExists) {
            issues.push({
              severity: 'warning',
              message: `Scale "${scale.id}" references unknown item: ${scaleItem.id}`,
              path: `scales/${scale.id}/items`,
            });
          }
        }
      }
    }

    return {
      valid: !issues.some((i) => i.severity === 'error'),
      issues,
      timestamp: new Date().toISOString(),
    };
  }

  private validateJsonSchema(fileName: string, payload: unknown): ValidationIssue[] {
    if (!this.looksLikeAcpIndex(fileName, payload)) {
      return [];
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return [
        {
          severity: 'error',
          message: 'ACP-Index schema check failed: top-level JSON must be an object',
          scope: 'schema',
          path: '$',
        },
      ];
    }

    const issues: ValidationIssue[] = [];
    const index = payload as Record<string, unknown>;

    if (typeof index.packageId !== 'string' || !index.packageId.trim()) {
      issues.push({
        severity: 'error',
        message: 'ACP-Index schema: required field "packageId" is missing or empty',
        scope: 'schema',
        path: 'packageId',
      });
    }

    if (typeof index.version !== 'string' || !index.version.trim()) {
      issues.push({
        severity: 'error',
        message: 'ACP-Index schema: required field "version" is missing or empty',
        scope: 'schema',
        path: 'version',
      });
    }

    if (typeof index.status !== 'string' || !ACP_INDEX_ALLOWED_STATUS_VALUES.includes(index.status as any)) {
      issues.push({
        severity: 'error',
        message: `ACP-Index schema: "status" must be one of ${ACP_INDEX_ALLOWED_STATUS_VALUES.join(', ')}`,
        scope: 'schema',
        path: 'status',
      });
    }

    if (!Array.isArray(index.assessmentParts)) {
      issues.push({
        severity: 'error',
        message: 'ACP-Index schema: required field "assessmentParts" must be an array',
        scope: 'schema',
        path: 'assessmentParts',
      });
      return issues;
    }

    for (let partIndex = 0; partIndex < index.assessmentParts.length; partIndex++) {
      const part = index.assessmentParts[partIndex] as Record<string, unknown>;
      if (!part || typeof part !== 'object' || Array.isArray(part)) {
        issues.push({
          severity: 'error',
          message: 'ACP-Index schema: assessmentPart entry must be an object',
          scope: 'schema',
          path: `assessmentParts[${partIndex}]`,
        });
        continue;
      }

      const modules = part.bookletModules;
      if (modules !== undefined && !Array.isArray(modules)) {
        issues.push({
          severity: 'error',
          message: 'ACP-Index schema: "bookletModules" must be an array',
          scope: 'schema',
          path: `assessmentParts[${partIndex}].bookletModules`,
        });
      }

      for (const [moduleIndex, moduleEntry] of (Array.isArray(modules) ? modules : []).entries()) {
        const module = moduleEntry as Record<string, unknown>;
        if (!module || typeof module !== 'object' || Array.isArray(module)) {
          issues.push({
            severity: 'error',
            message: 'ACP-Index schema: bookletModule entry must be an object',
            scope: 'schema',
            path: `assessmentParts[${partIndex}].bookletModules[${moduleIndex}]`,
          });
          continue;
        }

        if (typeof module.id !== 'string' || !module.id.trim()) {
          issues.push({
            severity: 'error',
            message: 'ACP-Index schema: bookletModule requires non-empty "id"',
            scope: 'schema',
            path: `assessmentParts[${partIndex}].bookletModules[${moduleIndex}].id`,
          });
        }

        if (module.units !== undefined && !Array.isArray(module.units)) {
          issues.push({
            severity: 'error',
            message: 'ACP-Index schema: bookletModule "units" must be an array',
            scope: 'schema',
            path: `assessmentParts[${partIndex}].bookletModules[${moduleIndex}].units`,
          });
        }
      }

      const instruments = part.instruments;
      if (instruments !== undefined && !Array.isArray(instruments)) {
        issues.push({
          severity: 'error',
          message: 'ACP-Index schema: "instruments" must be an array',
          scope: 'schema',
          path: `assessmentParts[${partIndex}].instruments`,
        });
      }

      for (const [instrumentIndex, instrumentEntry] of (Array.isArray(instruments) ? instruments : []).entries()) {
        const instrument = instrumentEntry as Record<string, unknown>;
        if (!instrument || typeof instrument !== 'object' || Array.isArray(instrument)) {
          issues.push({
            severity: 'error',
            message: 'ACP-Index schema: instrument entry must be an object',
            scope: 'schema',
            path: `assessmentParts[${partIndex}].instruments[${instrumentIndex}]`,
          });
          continue;
        }

        const booklets = instrument.testcenterBooklet;
        if (booklets !== undefined && !Array.isArray(booklets)) {
          issues.push({
            severity: 'error',
            message: 'ACP-Index schema: instrument "testcenterBooklet" must be an array',
            scope: 'schema',
            path: `assessmentParts[${partIndex}].instruments[${instrumentIndex}].testcenterBooklet`,
          });
          continue;
        }

        for (const [bookletIndex, bookletEntry] of (Array.isArray(booklets) ? booklets : []).entries()) {
          const booklet = bookletEntry as Record<string, unknown>;
          if (!booklet || typeof booklet !== 'object' || Array.isArray(booklet)) {
            issues.push({
              severity: 'error',
              message: 'ACP-Index schema: booklet entry must be an object',
              scope: 'schema',
              path: `assessmentParts[${partIndex}].instruments[${instrumentIndex}].testcenterBooklet[${bookletIndex}]`,
            });
            continue;
          }

          if (booklet.modules !== undefined && !Array.isArray(booklet.modules)) {
            issues.push({
              severity: 'error',
              message: 'ACP-Index schema: booklet "modules" must be an array',
              scope: 'schema',
              path: `assessmentParts[${partIndex}].instruments[${instrumentIndex}].testcenterBooklet[${bookletIndex}].modules`,
            });
            continue;
          }

          for (const [moduleRefIndex, moduleRef] of (Array.isArray(booklet.modules) ? booklet.modules : []).entries()) {
            if (!this.resolveModuleReferenceId(moduleRef)) {
              issues.push({
                severity: 'error',
                message: 'ACP-Index schema: module reference must be string, {moduleId}, or {id}',
                scope: 'schema',
                path: `assessmentParts[${partIndex}].instruments[${instrumentIndex}].testcenterBooklet[${bookletIndex}].modules[${moduleRefIndex}]`,
              });
            }
          }
        }
      }
    }

    return issues;
  }

  private looksLikeAcpIndex(fileName: string, payload: unknown): boolean {
    if (fileName.toLowerCase().includes('acp-index')) {
      return true;
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return false;
    }
    const root = payload as Record<string, unknown>;
    return (
      'assessmentParts' in root
      || 'packageId' in root
      || 'status' in root
      || 'version' in root
    );
  }

  private resolveModuleReferenceId(moduleRef: unknown): string | null {
    if (typeof moduleRef === 'string' && moduleRef.trim().length > 0) {
      return moduleRef.trim();
    }
    if (moduleRef && typeof moduleRef === 'object') {
      const ref = moduleRef as { moduleId?: unknown; id?: unknown };
      if (typeof ref.moduleId === 'string' && ref.moduleId.trim().length > 0) {
        return ref.moduleId.trim();
      }
      if (typeof ref.id === 'string' && ref.id.trim().length > 0) {
        return ref.id.trim();
      }
    }
    return null;
  }
}
