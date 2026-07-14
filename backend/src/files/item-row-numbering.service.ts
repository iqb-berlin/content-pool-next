import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import * as crypto from "crypto";
import { Acp, AcpItemRowNumber } from "../database/entities";

export interface NumberableItemRow {
  rowKey: string;
  itemId: string;
  unitId: string;
  subId?: string;
}

@Injectable()
export class ItemRowNumberingService {
  private readonly collator = new Intl.Collator("de", {
    numeric: true,
    sensitivity: "base",
  });

  constructor(
    @InjectRepository(AcpItemRowNumber)
    private readonly rowNumberRepository: Repository<AcpItemRowNumber>,
  ) {}

  async hasAssignedNumbers(acpId: string): Promise<boolean> {
    return this.rowNumberRepository.exists({ where: { acpId } });
  }

  async assignNumbers(
    acpId: string,
    rows: NumberableItemRow[],
  ): Promise<Map<string, number>> {
    const normalizedRows = this.normalizeRows(rows);
    if (!normalizedRows.length) {
      return new Map();
    }

    return this.withAcpLock(acpId, async (repository) => {
      const persisted = await repository.find({
        where: { acpId },
        order: { rowNumber: "ASC" },
      });
      const numbers = new Map(
        persisted.map((entry) => [entry.rowKey, entry.rowNumber] as const),
      );
      let nextNumber = persisted.reduce(
        (highest, entry) => Math.max(highest, entry.rowNumber),
        0,
      );
      const missingRows = normalizedRows
        .filter((row) => !numbers.has(row.rowKey))
        .sort((left, right) => this.compareRows(left, right));

      if (missingRows.length) {
        const created = missingRows.map((row) => {
          nextNumber += 1;
          numbers.set(row.rowKey, nextNumber);
          return repository.create({
            acpId,
            rowKey: row.rowKey,
            rowKeyHash: this.hashRowKey(row.rowKey),
            rowNumber: nextNumber,
          });
        });
        await repository.save(created);
      }

      return numbers;
    });
  }

  async recalculateNumbers(
    acpId: string,
    rows: NumberableItemRow[],
  ): Promise<Map<string, number>> {
    const normalizedRows = this.normalizeRows(rows).sort((left, right) =>
      this.compareRows(left, right),
    );

    return this.withAcpLock(acpId, async (repository) => {
      await repository.delete({ acpId });
      const numbers = new Map<string, number>();
      const created = normalizedRows.map((row, index) => {
        const rowNumber = index + 1;
        numbers.set(row.rowKey, rowNumber);
        return repository.create({
          acpId,
          rowKey: row.rowKey,
          rowKeyHash: this.hashRowKey(row.rowKey),
          rowNumber,
        });
      });
      if (created.length) {
        await repository.save(created);
      }
      return numbers;
    });
  }

  private async withAcpLock<T>(
    acpId: string,
    work: (repository: Repository<AcpItemRowNumber>) => Promise<T>,
  ): Promise<T> {
    return this.rowNumberRepository.manager.transaction(async (manager) => {
      const acp = await manager
        .getRepository(Acp)
        .createQueryBuilder("acp")
        .setLock("pessimistic_write")
        .where("acp.id = :acpId", { acpId })
        .getOne();
      if (!acp) {
        throw new NotFoundException("ACP not found");
      }
      return work(manager.getRepository(AcpItemRowNumber));
    });
  }

  private normalizeRows(rows: NumberableItemRow[]): NumberableItemRow[] {
    const uniqueRows = new Map<string, NumberableItemRow>();
    for (const row of rows) {
      const rowKey = String(row.rowKey || "").trim();
      if (!rowKey || uniqueRows.has(rowKey)) {
        continue;
      }
      uniqueRows.set(rowKey, { ...row, rowKey });
    }
    return Array.from(uniqueRows.values());
  }

  private hashRowKey(rowKey: string): string {
    return crypto.createHash("sha256").update(rowKey, "utf8").digest("hex");
  }

  private compareRows(
    left: NumberableItemRow,
    right: NumberableItemRow,
  ): number {
    const itemComparison = this.collator.compare(
      left.itemId || "",
      right.itemId || "",
    );
    if (itemComparison) {
      return itemComparison;
    }
    const subIdComparison = this.collator.compare(
      left.subId || "",
      right.subId || "",
    );
    if (subIdComparison) {
      return subIdComparison;
    }
    const unitComparison = this.collator.compare(
      left.unitId || "",
      right.unitId || "",
    );
    return unitComparison || this.collator.compare(left.rowKey, right.rowKey);
  }
}
