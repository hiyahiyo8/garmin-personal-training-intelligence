import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";

import { parseSnapshot } from "./models.js";
import { analyzeSnapshot } from "./readiness.js";
import { renderMarkdown } from "./report.js";
import { importGarminPath, summarizeActivities, summarizeWeeks } from "./garmin-export.js";
import { renderExportReport } from "./export-report.js";

function usage() {
  return [
    "Usage:",
    "  node src/cli.js report --input <snapshot.json> [--output <report.md>]",
    "  node src/cli.js import --input <garmin.csv|folder> [--profile <profile.json>] [--output <report.md>]",
  ].join("\n");
}

function parseArgs(args) {
  if (!args[0] || !["report", "import"].includes(args[0])) throw new Error(usage());
  const options = {};
  for (let index = 1; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!value || !["--input", "--output", "--profile"].includes(key)) throw new Error(usage());
    options[key.slice(2)] = value;
  }
  if (!options.input) throw new Error(usage());
  options.command = args[0];
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === "import") {
    const activities = await importGarminPath(options.input);
    let profile = {};
    if (options.profile) profile = JSON.parse(await readFile(resolve(options.profile), "utf8"));
    const summarized = summarizeActivities(activities, profile);
    const weeks = summarizeWeeks(summarized);
    const report = renderExportReport(summarized, weeks, profile, options.input);
    if (options.output) {
      const outputPath = resolve(options.output);
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, report, "utf8");
      console.log(`Laporan export ditulis ke ${outputPath}`);
    } else {
      console.log(report);
    }
    return;
  }
  const inputPath = resolve(options.input);
  const raw = JSON.parse(await readFile(inputPath, "utf8"));
  const snapshot = parseSnapshot(raw);
  const report = renderMarkdown(snapshot, analyzeSnapshot(snapshot));
  if (options.output) {
    const outputPath = resolve(options.output);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, report, "utf8");
    console.log(`Laporan ditulis ke ${outputPath}`);
  } else {
    console.log(report);
  }
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
