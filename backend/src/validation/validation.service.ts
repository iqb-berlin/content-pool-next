import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AcpFile, Acp } from '../database/entities';
import {
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
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
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
  async validateFile(file: AcpFile, buffer: Buffer): Promise<ValidationResult> {
    const issues: ValidationIssue[] = [];

    // Check file extension and apply format-specific validation
    const name = file.originalName.toLowerCase();

    if (name.endsWith('.json')) {
      try {
        JSON.parse(buffer.toString('utf-8'));
      } catch (e: any) {
        issues.push({
          severity: 'error',
          message: `Invalid JSON: ${e.message}`,
        });
      }
    } else if (name.endsWith('.xml')) {
      // Basic XML well-formedness check
      const content = buffer.toString('utf-8');
      if (!content.trim().startsWith('<')) {
        issues.push({
          severity: 'error',
          message: 'File does not appear to be valid XML',
        });
      }
    }

    if (buffer.length === 0) {
      issues.push({
        severity: 'warning',
        message: 'File is empty',
      });
    }

    const result: ValidationResult = {
      valid: !issues.some((i) => i.severity === 'error'),
      issues,
      timestamp: new Date().toISOString(),
    };

    // Store validation result
    file.validationResult = result as any;
    await this.fileRepository.save(file);

    return result;
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
            const moduleExists = (part.bookletModules || []).some(
              (m: any) => m.id === modRef.moduleId,
            );
            if (!moduleExists) {
              issues.push({
                severity: 'error',
                message: `Instrument "${instrument.id}" references missing module: ${modRef.moduleId}`,
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
}
