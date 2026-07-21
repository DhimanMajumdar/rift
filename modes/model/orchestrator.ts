import chalk from "chalk";
import { select, isCancel, text, autocomplete } from "@clack/prompts";
import {
  fetchAvailableModels,
  getConfiguredModelId,
  setConfiguredModelId,
  type OpenRouterModelInfo,
} from "../../ai/model-config.ts";

function formatModelLabel(m: OpenRouterModelInfo): string {
  const price = m.isFree
    ? "free"
    : `$${(m.promptPrice * 1_000_000).toFixed(2)}/$${(m.completionPrice * 1_000_000).toFixed(2)} per 1M tok`;
  const ctx = m.contextLength >= 1000 ? `${Math.round(m.contextLength / 1000)}k ctx` : `${m.contextLength} ctx`;
  return `${m.id} — ${price} — ${ctx}`;
}

export function getCurrentModelLabel(): string {
  try {
    return getConfiguredModelId(process.cwd());
  } catch {
    return "(not configured)";
  }
}

async function pickFromList(
  models: OpenRouterModelInfo[],
  message: string,
): Promise<string | undefined> {
  if (models.length === 0) {
    console.log(chalk.yellow("\nNo matching models found.\n"));
    return undefined;
  }

  const choice = await autocomplete({
    message,
    options: models.map((m) => ({ value: m.id, label: formatModelLabel(m) })),
    maxItems: 10,
    placeholder: "Type to filter…",
  });

  if (isCancel(choice)) return undefined;
  return choice as string;
}

export async function runSelectModel(): Promise<void> {
  console.log(chalk.bold("\n🧠 Select Model\n"));
  console.log(chalk.dim(`Current: ${getCurrentModelLabel()}\n`));

  const mode = await select({
    message: "How do you want to pick a model?",
    options: [
      { value: "free", label: "Browse free models" },
      { value: "all", label: "Browse all tool-capable models" },
      { value: "manual", label: "Enter a model ID manually" },
      { value: "cancel", label: "Cancel" },
    ],
  });
  if (isCancel(mode) || mode === "cancel") return;

  let models: OpenRouterModelInfo[] = [];
  try {
    models = await fetchAvailableModels();
  } catch (e) {
    console.log(
      chalk.red(
        `\nCouldn't fetch the model list: ${e instanceof Error ? e.message : String(e)}`,
      ),
    );
    if (mode !== "manual") console.log(chalk.dim("You can still enter a model ID manually.\n"));
  }

  let modelId: string | undefined;

  if (mode === "manual" || models.length === 0) {
    const entered = await text({
      message: "Model ID (e.g. openai/gpt-4o-mini)",
      validate: (v) => {
        const s = (v ?? "").trim();
        if (!s) return "Required";
        if (!s.includes("/")) return "Should look like provider/model-name";
      },
    });
    if (isCancel(entered)) return;
    modelId = entered.trim();

    const known = models.find((m) => m.id === modelId);
    if (known && !known.supportsTools) {
      console.log(
        chalk.yellow(
          `\nWarning: ${modelId} doesn't advertise tool-calling support — Agent/Plan/Ask modes rely on tools and may not work with it.\n`,
        ),
      );
    }
  } else if (mode === "free") {
    // Rift's tools (file edits, search, shell) require tool-calling support —
    // most free models on OpenRouter don't have it, so filter those out too.
    modelId = await pickFromList(
      models.filter((m) => m.isFree && m.supportsTools),
      "Pick a free model (tool-calling only — Rift needs it for every mode)",
    );
  } else {
    modelId = await pickFromList(
      models.filter((m) => m.supportsTools),
      "Pick a model (type to search)",
    );
  }

  if (!modelId) return;

  setConfiguredModelId(process.cwd(), modelId);
  console.log(chalk.green(`\n✓ Model set to ${modelId}. Used for every mode from now on.\n`));
}
