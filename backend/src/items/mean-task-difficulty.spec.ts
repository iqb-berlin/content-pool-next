import { calculateMeanTaskDifficultyByUnit } from "./mean-task-difficulty";

describe("calculateMeanTaskDifficultyByUnit", () => {
  it("assigns one mean to all finite item difficulties of a task", () => {
    const means = calculateMeanTaskDifficultyByUnit([
      { unitId: "unit-1", empiricalDifficulty: -0.5 },
      { unitId: "unit-1", empiricalDifficulty: 0.5 },
      { unitId: "unit-1" },
      { unitId: "unit-2", empiricalDifficulty: 0.75 },
    ]);

    expect(Array.from(means.entries())).toEqual([
      ["unit-1", 0],
      ["unit-2", 0.75],
    ]);
  });

  it("does not create a value for tasks without a finite difficulty", () => {
    const means = calculateMeanTaskDifficultyByUnit([
      { unitId: "unit-1" },
      { unitId: "unit-1", empiricalDifficulty: Number.NaN },
    ]);

    expect(means.has("unit-1")).toBe(false);
  });
});
