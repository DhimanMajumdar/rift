import { createOpenRouter } from "@openrouter/ai-sdk-provider";

export function getAgentModel() {
  const provider = createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
  });

  const modelId = process.env.OPENROUTER_DEFAULT_MODEL;
  if (!modelId) throw new Error("OPENROUTER_DEFAULT_MODEL is not set");

  // Ask OpenRouter to include per-call cost accounting in the response so
  // we can surface real USD cost, not just token counts.
  return provider(modelId, { usage: { include: true } });
}
