import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_TOKEN_URL } from "./google-oauth";
import { getAntigravityUserAgent } from "./version";

const CLOUD_CODE_BASE_URL = "https://daily-cloudcode-pa.sandbox.googleapis.com";
const QUOTA_API_URL = "https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels";

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

const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;
const refreshLocks = new Map<string, Promise<string>>();

export async function getValidAccessToken(account: {
  _id: unknown;
  email: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt?: Date;
}): Promise<string> {
  const expiresAt = account.tokenExpiresAt ? new Date(account.tokenExpiresAt).getTime() : 0;
  const needsRefresh = !account.accessToken || Date.now() > expiresAt - TOKEN_REFRESH_MARGIN_MS;

  if (!needsRefresh) return account.accessToken;
  if (!account.refreshToken) return account.accessToken;

  const accountId = String(account._id);
  const existing = refreshLocks.get(accountId);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const result = await refreshAccessToken(account.refreshToken);
      if (!result) return account.accessToken;

      const { dbService } = await import("./db-service");
      await dbService.connect();
      const newExpiresAt = new Date(Date.now() + result.expires_in * 1000);
      await dbService.account.findByIdAndUpdate(account._id, {
        accessToken: result.access_token,
        tokenExpiresAt: newExpiresAt,
      });
      account.accessToken = result.access_token;
      return result.access_token;
    } finally {
      refreshLocks.delete(accountId);
    }
  })();

  refreshLocks.set(accountId, promise);
  return promise;
}

type AccountTier = "free" | "pro" | "ultra";

export async function fetchTierAndProject(accessToken: string): Promise<{ projectId: string; tier: AccountTier }> {
  try {
    const res = await fetch(`${CLOUD_CODE_BASE_URL}/v1internal:loadCodeAssist`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "User-Agent": getAntigravityUserAgent(),
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
        "User-Agent": getAntigravityUserAgent(),
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

