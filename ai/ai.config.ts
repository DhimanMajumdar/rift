import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { getConfiguredModelId } from "./model-config.ts";

export function getAgentModel() {
  const provider = createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
  });

  const modelId = getConfiguredModelId(process.cwd());

  // Ask OpenRouter to include per-call cost accounting in the response so
  // we can surface real USD cost, not just token counts.
  return provider(modelId, { usage: { include: true } });
}
