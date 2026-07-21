import fs from "node:fs";
import path from "node:path";

export interface OpenRouterModelInfo {
  id: string;
  name: string;
  contextLength: number;
  promptPrice: number;
  completionPrice: number;
  isFree: boolean;
  supportsTools: boolean;
}

interface RiftConfig {
  modelId?: string;
}

function configPath(codebasePath: string): string {
  return path.join(codebasePath, ".rift", "config.json");
}

function readConfig(codebasePath: string): RiftConfig {
  try {
    return JSON.parse(fs.readFileSync(configPath(codebasePath), "utf8"));
  } catch {
    return {};
  }
}

function writeConfig(codebasePath: string, config: RiftConfig): void {
  fs.mkdirSync(path.join(codebasePath, ".rift"), { recursive: true });
  fs.writeFileSync(configPath(codebasePath), JSON.stringify(config, null, 2), "utf8");
}

// Resolution order: a model picked via the CLI (persisted per-workspace) wins
// over the .env default, so switching models never requires editing .env.
export function getConfiguredModelId(codebasePath: string): string {
  const fromConfig = readConfig(codebasePath).modelId;
  if (fromConfig) return fromConfig;

  const fromEnv = process.env.OPENROUTER_DEFAULT_MODEL;
  if (fromEnv) return fromEnv;

  throw new Error(
    "No model configured. Choose 'Select Model' from the CLI menu, or set OPENROUTER_DEFAULT_MODEL in .env.",
  );
}

export function setConfiguredModelId(codebasePath: string, modelId: string): void {
  const config = readConfig(codebasePath);
  config.modelId = modelId;
  writeConfig(codebasePath, config);
}

let modelsCache: OpenRouterModelInfo[] | null = null;

export async function fetchAvailableModels(): Promise<OpenRouterModelInfo[]> {
  if (modelsCache) return modelsCache;

  const res = await fetch("https://openrouter.ai/api/v1/models");
  if (!res.ok) throw new Error(`Failed to fetch model list: HTTP ${res.status}`);

  const body = (await res.json()) as { data: any[] };
  modelsCache = body.data.map((m) => ({
    id: m.id,
    name: m.name ?? m.id,
    contextLength: m.context_length ?? 0,
    promptPrice: Number(m.pricing?.prompt ?? 0),
    completionPrice: Number(m.pricing?.completion ?? 0),
    isFree: m.pricing?.prompt === "0" && m.pricing?.completion === "0",
    supportsTools:
      Array.isArray(m.supported_parameters) && m.supported_parameters.includes("tools"),
  }));

  return modelsCache;
}
