import { getAntigravityUserAgent } from "./version";

const ENDPOINT_FALLBACKS = [
  "https://daily-cloudcode-pa.googleapis.com",
  "https://cloudcode-pa.googleapis.com",
];

const HEADERS = {
  "Content-Type": "application/json",
  "x-client-name": "antigravity",
  "x-goog-api-client": "gl-node/18.18.2 fire/0.8.6 grpc/1.10.x",
};

interface ModelQuotaInfo {
  remainingFraction?: number;
  resetTime?: string;
}

interface FetchModelsResponse {
  models: Record<string, {
    displayName?: string;
    quotaInfo?: ModelQuotaInfo;
  }>;
}

function isSupportedModel(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  return lower.includes("claude") || lower.includes("gemini");
}

export function getModelFamily(modelName: string): "claude" | "gemini" | "unknown" {
  const lower = (modelName || "").toLowerCase();
  if (lower.includes("claude")) return "claude";
  if (lower.includes("gemini")) return "gemini";
  return "unknown";
}

export async function fetchAvailableModels(token: string, projectId?: string): Promise<FetchModelsResponse | null> {
  const headers: Record<string, string> = {
    ...HEADERS,
    "Authorization": `Bearer ${token}`,
    "User-Agent": getAntigravityUserAgent(),
  };

  const body = projectId ? { project: projectId } : {};

  for (const endpoint of ENDPOINT_FALLBACKS) {
    try {
      const res = await fetch(`${endpoint}/v1internal:fetchAvailableModels`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) continue;
      return await res.json() as FetchModelsResponse;
    } catch {
      continue;
    }
  }
  return null;
}

export async function listModels(token: string) {
  const data = await fetchAvailableModels(token);
  if (!data?.models) return { object: "list", data: [] };

  const modelList = Object.entries(data.models)
    .filter(([modelId]) => isSupportedModel(modelId))
    .map(([modelId, modelData]) => ({
      id: modelId,
      object: "model",
      created: Math.floor(Date.now() / 1000),
      owned_by: "anthropic",
      description: modelData.displayName || modelId,
    }));

  return { object: "list", data: modelList };
}

let cachedModels: Set<string> | null = null;
let cacheTimestamp = 0;
const MODEL_CACHE_TTL_MS = 5 * 60 * 1000;

export async function isValidModel(modelId: string, token: string): Promise<boolean> {
  const now = Date.now();
  if (cachedModels && now - cacheTimestamp < MODEL_CACHE_TTL_MS) {
    return cachedModels.has(modelId);
  }

  try {
    const data = await fetchAvailableModels(token);
    if (data?.models) {
      cachedModels = new Set(Object.keys(data.models).filter(isSupportedModel));
      cacheTimestamp = now;
      return cachedModels.has(modelId);
    }
  } catch {
    // pass
  }
  return true;
}
