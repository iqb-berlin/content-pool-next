export interface ItemDifficultyValue {
  unitId: string;
  empiricalDifficulty?: number;
}

export function calculateMeanTaskDifficultyByUnit(
  items: readonly ItemDifficultyValue[],
): Map<string, number> {
  const totals = new Map<string, { sum: number; count: number }>();

  for (const item of items) {
    if (
      item.empiricalDifficulty === undefined ||
      !Number.isFinite(item.empiricalDifficulty)
    ) {
      continue;
    }

    const total = totals.get(item.unitId) || { sum: 0, count: 0 };
    total.sum += item.empiricalDifficulty;
    total.count += 1;
    totals.set(item.unitId, total);
  }

  return new Map(
    Array.from(totals.entries()).map(([unitId, total]) => [
      unitId,
      total.sum / total.count,
    ]),
  );
}
