// qa.md: SARIF 2.1.0 is the standard interchange for results, baselines and
// suppressions — appropriate for CI integration. Read-only: just serializes a
// ResearchReport into SARIF; writes nothing to the audited repo.
import type { ResearchReport } from "./report.js";
import type { Finding, FindingLevel } from "./finding.js";

// SARIF `level` is about CI severity, not our L-level. qa.md: only L3/L4 may
// block a merge, so we map those to warning/error; lower levels are notes.
function sarifLevel(level: FindingLevel): "error" | "warning" | "note" | "none" {
  if (level === "L4" || level === "L5") return "error";
  if (level === "L3") return "warning";
  if (level === "L2") return "note";
  return "none";
}

export interface SarifLog {
  version: "2.1.0";
  $schema: string;
  runs: Array<{
    tool: { driver: { name: string; version?: string; informationUri?: string } };
    results: Array<Record<string, unknown>>;
  }>;
}

export function toSarif(report: ResearchReport, toolVersion = "0.1.0"): SarifLog {
  const results = report.findings
    .filter((f) => sarifLevel(f.level) !== "none")
    .map((f: Finding, idx: number) => {
      const level = sarifLevel(f.level);
      return {
        ruleId: f.category,
        ruleIndex: 0,
        level,
        message: { text: f.title },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: f.location.path },
              region: { startLine: f.location.startLine, endLine: f.location.endLine },
            },
          },
        ],
        partialFingerprints: { primaryLocationLineHash: f.fingerprint },
        properties: {
          level: f.level,
          confidence: f.confidence,
          severity: f.severity,
          disposition: f.disposition ?? "needs_review",
          executionResult: f.execution_result,
          fingerprint: f.fingerprint,
          index: idx,
        },
        // qa.md: L3/L4 with deterministic evidence may block merge.
        baselineState: f.level === "L3" || f.level === "L4" ? "new" : "existing",
      };
    });

  return {
    version: "2.1.0",
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [
      {
        tool: {
          driver: {
            name: "deep",
            version: toolVersion,
            informationUri: "https://github.com/opencode",
          },
        },
        results,
      },
    ],
  };
}
