#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const benchmarkThresholds = {
  samplesPerRun: 40,
  candidateMedianMs: 500,
  candidateP95Ms: 1500,
  minimumImprovementPercent: 30,
};

export function median(values) {
  if (!values.length)
    throw new Error("Cannot calculate a median without samples.");
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export function nearestRankPercentile(values, percentileRank) {
  if (!values.length) {
    throw new Error("Cannot calculate a percentile without samples.");
  }
  if (percentileRank <= 0 || percentileRank > 1) {
    throw new Error("Percentile rank must be greater than 0 and at most 1.");
  }
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * percentileRank) - 1];
}

function validateResultShape(result, source) {
  if (result?.schemaVersion !== 1) {
    throw new Error(`${source}: unsupported benchmark result schema.`);
  }
  if (result.variant !== "baseline" && result.variant !== "candidate") {
    throw new Error(`${source}: invalid benchmark variant.`);
  }
  if (!Number.isInteger(result.runIndex) || result.runIndex < 1) {
    throw new Error(`${source}: runIndex must be a positive integer.`);
  }
  if (!result.revision || typeof result.revision !== "string") {
    throw new Error(`${source}: revision is required.`);
  }
  if (
    !Array.isArray(result.durationsMs) ||
    result.durationsMs.length !== result.sampleCount ||
    result.durationsMs.some(
      (duration) => !Number.isFinite(duration) || duration < 0,
    )
  ) {
    throw new Error(`${source}: durations must match sampleCount.`);
  }
  if (result.sampleCount !== benchmarkThresholds.samplesPerRun) {
    throw new Error(
      `${source}: expected ${benchmarkThresholds.samplesPerRun} samples, received ${result.sampleCount}.`,
    );
  }
}

export function validateBenchmarkResults(
  sourcedResults,
  expectedRuns,
  thresholds = benchmarkThresholds,
) {
  if (
    !Number.isInteger(expectedRuns) ||
    expectedRuns < 1 ||
    expectedRuns % 2 !== 0
  ) {
    throw new Error("expectedRuns must be a positive even integer.");
  }

  for (const { result, source } of sourcedResults) {
    validateResultShape(result, source);
  }

  const grouped = {
    baseline: sourcedResults.filter(
      ({ result }) => result.variant === "baseline",
    ),
    candidate: sourcedResults.filter(
      ({ result }) => result.variant === "candidate",
    ),
  };
  const failures = [];
  for (const variant of ["baseline", "candidate"]) {
    const runs = grouped[variant];
    if (runs.length !== expectedRuns) {
      failures.push(
        `Expected ${expectedRuns} ${variant} runs, received ${runs.length}.`,
      );
    }
    const runIndices = new Set(runs.map(({ result }) => result.runIndex));
    for (let runIndex = 1; runIndex <= expectedRuns; runIndex += 1) {
      if (!runIndices.has(runIndex)) {
        failures.push(`Missing ${variant} run ${runIndex}.`);
      }
    }
    if (runIndices.size !== runs.length) {
      failures.push(`Duplicate ${variant} run indices detected.`);
    }
    const revisions = new Set(runs.map(({ result }) => result.revision));
    if (revisions.size > 1) {
      failures.push(`${variant} runs used more than one revision.`);
    }
  }

  const baselineDurations = grouped.baseline.flatMap(
    ({ result }) => result.durationsMs,
  );
  const candidateDurations = grouped.candidate.flatMap(
    ({ result }) => result.durationsMs,
  );
  if (!baselineDurations.length || !candidateDurations.length) {
    return {
      schemaVersion: 1,
      expectedRuns,
      thresholds,
      failures,
      passed: false,
    };
  }
  const baselineRevision = grouped.baseline[0]?.result.revision;
  const candidateRevision = grouped.candidate[0]?.result.revision;
  if (baselineRevision === candidateRevision) {
    failures.push("Baseline and candidate must use different revisions.");
  }

  const baselineMedianMs = median(baselineDurations);
  const baselineP95Ms = nearestRankPercentile(baselineDurations, 0.95);
  const candidateMedianMs = median(candidateDurations);
  const candidateP95Ms = nearestRankPercentile(candidateDurations, 0.95);
  const improvementPercent =
    baselineMedianMs === 0
      ? 0
      : ((baselineMedianMs - candidateMedianMs) / baselineMedianMs) * 100;

  if (candidateMedianMs >= thresholds.candidateMedianMs) {
    failures.push(
      `Candidate median ${candidateMedianMs.toFixed(1)} ms must be below ${thresholds.candidateMedianMs} ms.`,
    );
  }
  if (candidateP95Ms >= thresholds.candidateP95Ms) {
    failures.push(
      `Candidate p95 ${candidateP95Ms.toFixed(1)} ms must be below ${thresholds.candidateP95Ms} ms.`,
    );
  }
  if (improvementPercent < thresholds.minimumImprovementPercent) {
    failures.push(
      `Same-unit median improvement ${improvementPercent.toFixed(1)}% must be at least ${thresholds.minimumImprovementPercent}%.`,
    );
  }

  return {
    schemaVersion: 1,
    expectedRuns,
    thresholds,
    baseline: {
      revision: baselineRevision,
      runCount: grouped.baseline.length,
      sampleCount: baselineDurations.length,
      medianMs: baselineMedianMs,
      p95Ms: baselineP95Ms,
    },
    candidate: {
      revision: candidateRevision,
      runCount: grouped.candidate.length,
      sampleCount: candidateDurations.length,
      medianMs: candidateMedianMs,
      p95Ms: candidateP95Ms,
    },
    improvementPercent,
    failures,
    passed: failures.length === 0,
  };
}

function parseArguments(args) {
  let expectedRuns = 6;
  let outputPath = "";
  const resultPaths = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--expected-runs") {
      expectedRuns = Number(args[++index]);
    } else if (argument === "--output") {
      outputPath = args[++index] || "";
    } else {
      resultPaths.push(argument);
    }
  }
  if (!outputPath) throw new Error("--output is required.");
  if (!resultPaths.length)
    throw new Error("At least one result file is required.");
  return { expectedRuns, outputPath: resolve(outputPath), resultPaths };
}

async function main() {
  const { expectedRuns, outputPath, resultPaths } = parseArguments(
    process.argv.slice(2),
  );
  const sourcedResults = await Promise.all(
    resultPaths.map(async (resultPath) => ({
      source: resultPath,
      result: JSON.parse(await readFile(resultPath, "utf8")),
    })),
  );
  const summary = validateBenchmarkResults(sourcedResults, expectedRuns);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (!summary.passed) process.exitCode = 1;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
