import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_TOKEN_URL } from "./google-oauth";

const CLOUD_CODE_BASE_URL = "https://daily-cloudcode-pa.sandbox.googleapis.com";
const QUOTA_API_URL = "https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels";
const USER_AGENT = "antigravity/1.100.0";

interface LoadCodeAssistResponse {
  cloudaicompanionProject?: string;
  currentTier?: { id?: string; quotaTier?: string; name?: string };
  paidTier?: { id?: string; quotaTier?: string; name?: string };
}

interface QuotaResponse {
  models: Record<string, {
    quotaInfo?: {
      remainingFraction?: number;
      resetTime?: string;
    };
  }>;
}

export async function refreshAccessToken(refreshToken: string) {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) return null;
  return res.json() as Promise<{ access_token: string; expires_in: number }>;
}

type AccountTier = "free" | "pro" | "ultra";

export async function fetchTierAndProject(accessToken: string): Promise<{ projectId: string; tier: AccountTier }> {
  try {
    const res = await fetch(`${CLOUD_CODE_BASE_URL}/v1internal:loadCodeAssist`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({ metadata: { ideType: "ANTIGRAVITY" } }),
    });
    if (!res.ok) return { projectId: "", tier: "free" };
    const data: LoadCodeAssistResponse = await res.json();
    const projectId = data.cloudaicompanionProject || "";
    const rawTier = (data.paidTier?.id || data.currentTier?.id || "").toLowerCase();
    let tier: AccountTier = "free";
    if (rawTier.includes("ultra")) tier = "ultra";
    else if (rawTier.includes("pro") || rawTier.includes("premium") || rawTier.includes("enterprise")) tier = "pro";
    console.log("[syncTier] rawTier:", rawTier, "→", tier);
    return { projectId, tier };
  } catch {
    return { projectId: "", tier: "free" };
  }
}

export async function fetchQuotas(accessToken: string, projectId: string): Promise<{ quotas: Record<string, number>; resets: Record<string, string> }> {
  try {
    const res = await fetch(QUOTA_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({ project: projectId || "bamboo-precept-lgxtn" }),
    });
    if (!res.ok) return { quotas: {}, resets: {} };
    const data: QuotaResponse = await res.json();
    const quotas: Record<string, number> = {};
    const resets: Record<string, string> = {};
    for (const [name, info] of Object.entries(data.models)) {
      if (name.includes("gemini") || name.includes("claude")) {
        const pct = info.quotaInfo?.remainingFraction
          ? Math.round(info.quotaInfo.remainingFraction * 100)
          : 0;
        quotas[name] = pct;
        if (info.quotaInfo?.resetTime) resets[name] = info.quotaInfo.resetTime;
      }
    }
    return { quotas, resets };
  } catch {
    return { quotas: {}, resets: {} };
  }
}

export async function syncAccountData(accessToken: string) {
  const { projectId, tier } = await fetchTierAndProject(accessToken);
  const { quotas, resets } = await fetchQuotas(accessToken, projectId);
  return { projectId, tier, quotas, quotaResets: resets };
}

