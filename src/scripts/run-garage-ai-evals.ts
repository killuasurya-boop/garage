import { config } from "dotenv";

import {
  accessForRole,
  classifyGarageAiIntent,
  profileForIntent,
} from "@/lib/garage-ai-context";
import { buildSupervisorDecision, listAiActionRegistry, listAiAgents } from "@/lib/garage-ai-agents";
import { garageAiEvalCases } from "@/lib/garage-ai-eval-cases";
import type { AiSubAgentId } from "@/lib/garage-api-types";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

type EvalFailure = {
  id: string;
  title: string;
  field: string;
  expected: unknown;
  actual: unknown;
};

function sameAgents(expected: AiSubAgentId[], actual: AiSubAgentId[]) {
  return (
    expected.length === actual.length &&
    expected.every((agentId, index) => actual[index] === agentId)
  );
}

function pushFailure(
  failures: EvalFailure[],
  input: { id: string; title: string },
  field: string,
  expected: unknown,
  actual: unknown,
) {
  failures.push({
    id: input.id,
    title: input.title,
    field,
    expected,
    actual,
  });
}

async function main() {
  const failures: EvalFailure[] = [];
  const shouldCheckDb = process.argv.includes("--db");

  for (const testCase of garageAiEvalCases) {
    const cart = testCase.cart ?? [];
    const intent = classifyGarageAiIntent(testCase.message, cart);
    const access = accessForRole(testCase.role, intent);
    const profile = profileForIntent(intent, access);
    const decision = buildSupervisorDecision({
      intent,
      dataAccessLevel: access,
      role: testCase.role,
      message: testCase.message,
    });

    if (intent !== testCase.expectedIntent) {
      pushFailure(failures, testCase, "intent", testCase.expectedIntent, intent);
    }

    if (access !== testCase.expectedAccess) {
      pushFailure(failures, testCase, "access", testCase.expectedAccess, access);
    }

    if (!sameAgents(testCase.expectedAgents, decision.agentsUsed)) {
      pushFailure(
        failures,
        testCase,
        "agentsUsed",
        testCase.expectedAgents,
        decision.agentsUsed,
      );
    }

    if (decision.riskLevel !== testCase.expectedRisk) {
      pushFailure(
        failures,
        testCase,
        "riskLevel",
        testCase.expectedRisk,
        decision.riskLevel,
      );
    }

    if (decision.approvalRequired !== testCase.expectedApprovalRequired) {
      pushFailure(
        failures,
        testCase,
        "approvalRequired",
        testCase.expectedApprovalRequired,
        decision.approvalRequired,
      );
    }

    if (!profile) {
      pushFailure(failures, testCase, "profile", "defined", profile);
    }
  }

  let dbSummary: { agents: number; registry: number } | null = null;
  if (shouldCheckDb) {
    const [agents, registry] = await Promise.all([
      listAiAgents(),
      listAiActionRegistry(),
    ]);
    dbSummary = {
      agents: agents.length,
      registry: registry.length,
    };

    if (agents.length < 8) {
      failures.push({
        id: "db-agents",
        title: "Default agent config seed",
        field: "agents",
        expected: ">= 8",
        actual: agents.length,
      });
    }

    if (registry.length < 16) {
      failures.push({
        id: "db-registry",
        title: "Default action registry seed",
        field: "registry",
        expected: ">= 16",
        actual: registry.length,
      });
    }
  }

  const summary = {
    total: garageAiEvalCases.length,
    passed: garageAiEvalCases.length - new Set(failures.map((item) => item.id)).size,
    failed: new Set(failures.map((item) => item.id)).size,
    assertionsFailed: failures.length,
    dbSummary,
  };

  if (failures.length) {
    console.error(JSON.stringify({ summary, failures }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify({ summary, status: "passed" }, null, 2));
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.stack ?? error.message : String(error),
  );
  process.exit(1);
});
