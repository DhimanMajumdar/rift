import chalk from "chalk";

export interface RunUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  // USD; undefined when the provider didn't report cost accounting.
  cost: number | undefined;
}

interface RawUsageTotals {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

interface RawStep {
  providerMetadata?: {
    openrouter?: {
      usage?: { cost?: number };
    };
  };
}

const session: RunUsage = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  cost: undefined,
};
let sessionHasAnyRun = false;

function addCost(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined && b === undefined) return undefined;
  return (a ?? 0) + (b ?? 0);
}

// OpenRouter reports cost per model-call step via providerMetadata, not in
// the standard aggregated usage object — sum it across every step ourselves.
export function extractCostFromSteps(steps: ReadonlyArray<RawStep>): number | undefined {
  let cost: number | undefined;
  for (const step of steps) {
    const stepCost = step.providerMetadata?.openrouter?.usage?.cost;
    if (typeof stepCost === "number") cost = addCost(cost, stepCost);
  }
  return cost;
}

export function usageFromTotals(
  totals: RawUsageTotals,
  cost: number | undefined,
): RunUsage {
  return {
    inputTokens: totals.inputTokens ?? 0,
    outputTokens: totals.outputTokens ?? 0,
    totalTokens: totals.totalTokens ?? 0,
    cost,
  };
}

export function sumUsage(usages: RunUsage[]): RunUsage {
  const totals = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  let cost: number | undefined;
  for (const u of usages) {
    totals.inputTokens += u.inputTokens;
    totals.outputTokens += u.outputTokens;
    totals.totalTokens += u.totalTokens;
    cost = addCost(cost, u.cost);
  }
  return { ...totals, cost };
}

export function recordUsage(usage: RunUsage): void {
  sessionHasAnyRun = true;
  session.inputTokens += usage.inputTokens;
  session.outputTokens += usage.outputTokens;
  session.totalTokens += usage.totalTokens;
  session.cost = addCost(session.cost, usage.cost);
}

export function getSessionUsage(): RunUsage {
  return { ...session };
}

export function hasSessionUsage(): boolean {
  return sessionHasAnyRun;
}

function formatCost(cost: number | undefined): string {
  if (cost === undefined) return "cost: n/a";
  if (cost === 0) return "cost: $0.00";
  return `cost: $${cost < 0.01 ? cost.toFixed(4) : cost.toFixed(2)}`;
}

function formatTokens(usage: RunUsage): string {
  return `${usage.inputTokens.toLocaleString()} in / ${usage.outputTokens.toLocaleString()} out / ${usage.totalTokens.toLocaleString()} total tokens`;
}

export function formatUsageLine(usage: RunUsage, label = "Usage"): string {
  return `${label}: ${formatTokens(usage)} · ${formatCost(usage.cost)}`;
}

export function formatSessionUsageLine(): string {
  return chalk.dim(formatUsageLine(getSessionUsage(), "Session total"));
}

export function printSessionUsage(): void {
  if (!sessionHasAnyRun) return;
  console.log(formatSessionUsageLine());
}
