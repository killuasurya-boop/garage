import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type ReadinessEvidenceResult = {
  severity: "pass" | "warn" | "fail";
  check: string;
  detail: string;
};

export type ReadinessAuditEvidence = {
  kind: "readiness-audit";
  generatedAt: string;
  baseUrl: string;
  lanBaseUrl: string;
  status: "GO" | "CONDITIONAL GO" | "NO-GO";
  results: ReadinessEvidenceResult[];
};

export type FinalMvpUatEvidenceResult = {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
};

export type FinalMvpUatEvidence = {
  kind: "final-mvp-uat";
  generatedAt: string;
  baseUrl: string;
  passCount: number;
  total: number;
  results: FinalMvpUatEvidenceResult[];
};

export type WmsOperationalUatEvidence = {
  kind: "wms-operational-uat";
  generatedAt: string;
  baseUrl: string;
  passCount: number;
  total: number;
  results: FinalMvpUatEvidenceResult[];
};

export type OperationalEvidence = {
  readiness: ReadinessAuditEvidence | null;
  finalMvpUat: FinalMvpUatEvidence | null;
  wmsOperationalUat: WmsOperationalUatEvidence | null;
};

const reportDir = path.join(process.cwd(), ".garage", "readiness");

async function writeJson(fileName: string, payload: unknown) {
  await mkdir(reportDir, { recursive: true });
  await writeFile(path.join(reportDir, fileName), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function readJson<T>(fileName: string): Promise<T | null> {
  try {
    const raw = await readFile(path.join(reportDir, fileName), "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeReadinessAuditEvidence(report: ReadinessAuditEvidence) {
  await writeJson("latest-readiness-audit.json", report);
}

export async function writeFinalMvpUatEvidence(report: FinalMvpUatEvidence) {
  await writeJson("latest-final-mvp-uat.json", report);
}

export async function writeWmsOperationalUatEvidence(report: WmsOperationalUatEvidence) {
  await writeJson("latest-wms-operational-uat.json", report);
}

export async function readOperationalEvidence(): Promise<OperationalEvidence> {
  const [readiness, finalMvpUat, wmsOperationalUat] = await Promise.all([
    readJson<ReadinessAuditEvidence>("latest-readiness-audit.json"),
    readJson<FinalMvpUatEvidence>("latest-final-mvp-uat.json"),
    readJson<WmsOperationalUatEvidence>("latest-wms-operational-uat.json"),
  ]);

  return { readiness, finalMvpUat, wmsOperationalUat };
}

export function finalMvpPassed(report: FinalMvpUatEvidence | null, id: string) {
  return Boolean(report?.results.some((result) => result.id === id && result.pass));
}

export function readinessCheckPassed(report: ReadinessAuditEvidence | null, check: string) {
  return Boolean(report?.results.some((result) => result.check === check && result.severity === "pass"));
}
