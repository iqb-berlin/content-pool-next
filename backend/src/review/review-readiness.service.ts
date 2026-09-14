import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AcpFile } from "../database/entities";
import { UnitParserService } from "../files/unit-parser.service";
import {
  ValidationIssue,
  ValidationService,
} from "../validation/validation.service";
import { ReviewManifestService } from "./review-manifest.service";

export type ReviewReadinessStatus = "READY" | "WARNING" | "BLOCKED";

export interface ReviewReadinessResult {
  status: ReviewReadinessStatus;
  checkedAt: string;
  blockers: string[];
  warnings: string[];
  summary: {
    totalFiles: number;
    validFiles: number;
    invalidFiles: number;
    bookletCount: number;
    unitCount: number;
  };
}

@Injectable()
export class ReviewReadinessService {
  constructor(
    @InjectRepository(AcpFile)
    private readonly files: Repository<AcpFile>,
    private readonly validation: ValidationService,
    private readonly unitParser: UnitParserService,
    private readonly manifest: ReviewManifestService,
  ) {}

  async check(acpId: string): Promise<ReviewReadinessResult> {
    const blockers = new Set<string>();
    const warnings = new Set<string>();
    const files = await this.files.find({ where: { acpId } });

    if (files.length === 0) blockers.add("Der ACP enthält keine Dateien.");

    const validationRun = await this.validation.autoValidateUploadedFiles(
      acpId,
      files,
      undefined,
      false,
    );
    for (const issue of this.uniqueIssues(validationRun.files)) {
      const text = issue.path
        ? `${issue.message} (${issue.path})`
        : issue.message;
      if (issue.severity === "error") blockers.add(text);
      else if (issue.severity === "warning") warnings.add(text);
    }

    const unitResults = await this.unitParser.validateUnitFiles(acpId);
    const manifest = await this.manifest.getManifest(acpId);

    if (manifest.booklets.length === 0) {
      blockers.add("Der ACP enthält kein auflösbares Booklet.");
    }

    for (const issue of manifest.issues) {
      const text = issue.path
        ? `${issue.message} (${issue.path})`
        : issue.message;
      if (issue.severity === "error") blockers.add(text);
      else warnings.add(text);
    }

    const unitsById = new Map(unitResults.map((unit) => [unit.unitId, unit]));
    const referencedUnitIds = new Set(
      manifest.booklets.flatMap((booklet) =>
        booklet.units.map((unit) => unit.id),
      ),
    );
    for (const unitId of referencedUnitIds) {
      if (!unitsById.has(unitId)) {
        blockers.add(
          `Für die referenzierte Unit „${unitId}“ wurde keine Unit-Datei gefunden.`,
        );
      }
    }

    for (const unitId of referencedUnitIds) {
      const unit = unitsById.get(unitId);
      if (!unit) continue;
      if (!unit.files.definition.found) {
        blockers.add(
          `Unit „${unit.unitLabel || unit.unitId}“: Aufgabendefinition „${unit.files.definition.expected}“ fehlt.`,
        );
      }
      if (!unit.files.player.found) {
        blockers.add(
          `Unit „${unit.unitLabel || unit.unitId}“: Player „${unit.files.player.expected}“ fehlt.`,
        );
      }
      if (!unit.files.codingScheme.found) {
        warnings.add(
          `Unit „${unit.unitLabel || unit.unitId}“: Kodierschema „${unit.files.codingScheme.expected}“ fehlt.`,
        );
      }
      if (!unit.files.metadata.found) {
        warnings.add(
          `Unit „${unit.unitLabel || unit.unitId}“: Metadaten „${unit.files.metadata.expected}“ fehlen.`,
        );
      }
    }

    for (const booklet of manifest.booklets) {
      if (booklet.units.length === 0) {
        warnings.add(
          `Booklet „${booklet.name || booklet.id}“ enthält keine Aufgaben.`,
        );
      }
    }

    const blockerList = [...blockers];
    const warningList = [...warnings];
    return {
      status: blockerList.length
        ? "BLOCKED"
        : warningList.length
          ? "WARNING"
          : "READY",
      checkedAt: new Date().toISOString(),
      blockers: blockerList,
      warnings: warningList,
      summary: {
        totalFiles: validationRun.summary.totalFiles,
        validFiles: validationRun.summary.validFiles,
        invalidFiles: validationRun.summary.invalidFiles,
        bookletCount: manifest.booklets.length,
        unitCount: referencedUnitIds.size,
      },
    };
  }

  private uniqueIssues(files: AcpFile[]): ValidationIssue[] {
    const issues = new Map<string, ValidationIssue>();
    for (const file of files) {
      const result = file.validationResult as
        | { issues?: ValidationIssue[] }
        | null
        | undefined;
      for (const issue of result?.issues || []) {
        const key = [issue.severity, issue.message, issue.path || ""].join(
          "\u0000",
        );
        issues.set(key, issue);
      }
    }
    return [...issues.values()];
  }
}
