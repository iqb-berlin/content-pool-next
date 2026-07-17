import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  median,
  nearestRankPercentile,
  validateBenchmarkResults,
} from "./validate-item-explorer-browser-benchmark.mjs";

function benchmarkResult(variant, runIndex, durationsMs) {
  return {
    source: `${variant}-${runIndex}.json`,
    result: {
      schemaVersion: 1,
      variant,
      revision: `${variant}-revision`,
      runIndex,
      sampleCount: durationsMs.length,
      durationsMs,
    },
  };
}

test("calculates an even-sized median from both middle samples", () => {
  assert.equal(median([1, 2, 100, 200]), 51);
  assert.equal(nearestRankPercentile([1, 2, 3, 100], 0.95), 100);
});

test("aggregates matching baseline and candidate runs", () => {
  const results = [
    benchmarkResult("baseline", 1, Array(40).fill(400)),
    benchmarkResult("candidate", 1, Array(40).fill(100)),
    benchmarkResult("baseline", 2, Array(40).fill(400)),
    benchmarkResult("candidate", 2, Array(40).fill(100)),
  ];

  const summary = validateBenchmarkResults(results, 2);

  assert.equal(summary.passed, true);
  assert.equal(summary.baseline.sampleCount, 80);
  assert.equal(summary.candidate.sampleCount, 80);
  assert.equal(summary.improvementPercent, 75);
});

test("rejects an odd number of paired runs", () => {
  assert.throws(
    () => validateBenchmarkResults([], 5),
    /expectedRuns must be a positive even integer/,
  );
});

test("rejects candidates that exceed latency and improvement limits", () => {
  const results = [
    benchmarkResult("baseline", 1, Array(40).fill(1800)),
    benchmarkResult("candidate", 1, Array(40).fill(1600)),
    benchmarkResult("baseline", 2, Array(40).fill(1800)),
    benchmarkResult("candidate", 2, Array(40).fill(1600)),
  ];

  const summary = validateBenchmarkResults(results, 2);

  assert.equal(summary.passed, false);
  assert.equal(summary.failures.length, 3);
});

test("rejects missing and duplicate runs", () => {
  const results = [
    benchmarkResult("baseline", 1, Array(40).fill(400)),
    benchmarkResult("baseline", 1, Array(40).fill(400)),
    benchmarkResult("candidate", 1, Array(40).fill(100)),
  ];

  const summary = validateBenchmarkResults(results, 2);

  assert.equal(summary.passed, false);
  assert.ok(
    summary.failures.some((failure) => failure.includes("Duplicate baseline")),
  );
  assert.ok(
    summary.failures.some((failure) =>
      failure.includes("Missing candidate run 2"),
    ),
  );
});

test("writes a passing summary through the command-line validator", async () => {
  const directory = await mkdtemp(join(tmpdir(), "item-explorer-benchmark-"));
  const baselinePath1 = join(directory, "baseline-1.json");
  const candidatePath1 = join(directory, "candidate-1.json");
  const baselinePath2 = join(directory, "baseline-2.json");
  const candidatePath2 = join(directory, "candidate-2.json");
  const summaryPath = join(directory, "summary.json");
  await writeFile(
    baselinePath1,
    JSON.stringify(benchmarkResult("baseline", 1, Array(40).fill(400)).result),
  );
  await writeFile(
    candidatePath1,
    JSON.stringify(benchmarkResult("candidate", 1, Array(40).fill(100)).result),
  );
  await writeFile(
    baselinePath2,
    JSON.stringify(benchmarkResult("baseline", 2, Array(40).fill(400)).result),
  );
  await writeFile(
    candidatePath2,
    JSON.stringify(benchmarkResult("candidate", 2, Array(40).fill(100)).result),
  );

  const execution = spawnSync(
    process.execPath,
    [
      fileURLToPath(
        new URL(
          "./validate-item-explorer-browser-benchmark.mjs",
          import.meta.url,
        ),
      ),
      "--expected-runs",
      "2",
      "--output",
      summaryPath,
      baselinePath1,
      candidatePath1,
      baselinePath2,
      candidatePath2,
    ],
    { encoding: "utf8" },
  );

  assert.equal(execution.status, 0, execution.stderr);
  const summary = JSON.parse(await readFile(summaryPath, "utf8"));
  assert.equal(summary.passed, true);
  assert.equal(summary.candidate.sampleCount, 80);
  assert.equal(summary.candidate.medianMs, 100);
});
