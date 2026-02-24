import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Tunnel } from "@/lib/models/tunnel";
import { Account } from "@/lib/models/account";
import * as crypto from "crypto";

const V1_INTERNAL_URLS = [
  "https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal",
  "https://daily-cloudcode-pa.googleapis.com/v1internal",
  "https://cloudcode-pa.googleapis.com/v1internal",
];

const AG_VERSIONS = ["1.15.8", "1.16.0", "1.16.2", "1.16.5"];
const CHROME_VERSIONS: Record<string, string> = {
  "1.15.8": "130.0.6723.118",
  "1.16.0": "132.0.6834.83",
  "1.16.2": "132.0.6834.110",
  "1.16.5": "132.0.6834.160",
};
const ELECTRON_VERSIONS: Record<string, string> = {
  "1.15.8": "38.0.1",
  "1.16.0": "39.1.2",
  "1.16.2": "39.2.1",
  "1.16.5": "39.2.3",
};
const PLATFORMS = [
  "Macintosh; Intel Mac OS X 10_15_7",
  "Windows NT 10.0; Win64; x64",
  "X11; Linux x86_64",
];

const accountFingerprints = new Map<string, { machineId: string; sessionId: string; sessionTs: number; version: string; platform: string }>();

function getFingerprint(email: string) {
  const now = Date.now();
  const existing = accountFingerprints.get(email);
  if (existing && now - existing.sessionTs < 3600_000) return existing;
  const hash = crypto.createHash("sha256").update(email).digest("hex");
  const machineId = existing?.machineId || [hash.slice(0, 8), hash.slice(8, 12), hash.slice(12, 16), hash.slice(16, 20), hash.slice(20, 32)].join("-");
  const versionIdx = parseInt(hash.slice(0, 2), 16) % AG_VERSIONS.length;
  const platformIdx = parseInt(hash.slice(2, 4), 16) % PLATFORMS.length;
  const fp = {
    machineId,
    sessionId: crypto.randomUUID(),
    sessionTs: now,
    version: AG_VERSIONS[versionIdx],
    platform: PLATFORMS[platformIdx],
  };
  accountFingerprints.set(email, fp);
  return fp;
}

function buildUserAgent(fp: { version: string; platform: string }) {
  const chrome = CHROME_VERSIONS[fp.version] || "132.0.6834.160";
  const electron = ELECTRON_VERSIONS[fp.version] || "39.2.3";
  return `Mozilla/5.0 (${fp.platform}) AppleWebKit/537.36 (KHTML, like Gecko) Antigravity/${fp.version} Chrome/${chrome} Electron/${electron} Safari/537.36`;
}

const MODEL_MAP: Record<string, string> = {
  "gemini-3.1-pro-high": "gemini-3.1-pro-high",
  "gemini-3.1-pro-low": "gemini-3.1-pro-high",
  "gemini-3-pro-high": "gemini-3.1-pro-high",
  "gemini-3-pro-low": "gemini-3.1-pro-high",
  "gemini-3-flash": "gemini-3-flash",
  "gemini-2.5-pro": "gemini-2.5-pro",
  "gemini-2.5-flash": "gemini-2.5-flash",
  "gemini-2.5-flash-lite": "gemini-2.5-flash",
  "claude-sonnet-4-6": "claude-sonnet-4-6",
  "claude-sonnet-4-6-thinking": "claude-sonnet-4-6-thinking",
  "claude-opus-4-6-thinking": "claude-opus-4-6-thinking",
};

function resolveModel(model: string): string {
  return MODEL_MAP[model] || model;
}

async function fetchProjectInfo(accessToken: string, email: string): Promise<{ projectId: string; tier: string }> {
  const fp = getFingerprint(email);
  const url = "https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:loadCodeAssist";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`,
      "User-Agent": buildUserAgent(fp),
    },
    body: JSON.stringify({ metadata: { ideType: "ANTIGRAVITY" } }),
  });
  if (!res.ok) throw new Error(`loadCodeAssist failed: ${res.status}`);
  const data = await res.json();
  if (!data.cloudaicompanionProject) throw new Error("No cloudaicompanionProject returned");
  const tier = (data.paidTier?.id || data.currentTier?.id || "FREE").toLowerCase();
  return { projectId: data.cloudaicompanionProject, tier };
}

async function getProjectId(account: { _id: unknown; email: string; accessToken: string; projectId?: string }): Promise<string> {
  if (account.projectId) return account.projectId;
  const { projectId, tier } = await fetchProjectInfo(account.accessToken, account.email);
  await Account.findByIdAndUpdate(account._id, { projectId, tier });
  return projectId;
}

async function selectAccount(model: string, excludeIds: string[] = []) {
  const accounts = await Account.find({
    status: "active",
    rotationEnabled: true,
    ...(excludeIds.length > 0 ? { _id: { $nin: excludeIds } } : {}),
  }).sort({ rotationPriority: -1 });
  const now = new Date().toISOString();
  let best = null;
  let bestUsage = Infinity;
  for (const acc of accounts) {
    const q = acc.quotas?.[model];
    if (q !== undefined && q <= 0) {
      const resetTime = acc.quotaResets?.[model];
      if (!resetTime || resetTime > now) continue;
      Account.findByIdAndUpdate(acc._id, { tokensUsed: 0, [`quotas.${model}`]: 100 }).exec();
    }
    const usage = acc.tokensUsed || 0;
    if (usage < bestUsage) {
      bestUsage = usage;
      best = acc;
    }
  }
  return best;
}

function buildV1InternalBody(messages: Array<{ role: string; content: string }>, model: string, projectId: string, opts: Record<string, unknown>) {
  const apiModel = resolveModel(model);

  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const systemParts = messages
    .filter((m) => m.role === "system")
    .map((m) => ({ text: m.content }));

  const generationConfig: Record<string, unknown> = {
    temperature: opts.temperature ?? 1.0,
    topP: 0.95,
  };
  if (opts.max_tokens) {
    generationConfig.maxOutputTokens = opts.max_tokens;
  }

  const innerRequest: Record<string, unknown> = {
    contents,
    generationConfig,
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "OFF" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "OFF" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "OFF" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "OFF" },
      { category: "HARM_CATEGORY_CIVIC_INTEGRITY", threshold: "OFF" },
    ],
  };

  if (systemParts.length > 0) {
    innerRequest.systemInstruction = { role: "user", parts: systemParts };
  }

  return {
    project: projectId,
    requestId: `openai-${crypto.randomUUID()}`,
    request: innerRequest,
    model: apiModel,
    userAgent: "antigravity",
    requestType: "chat",
  };
}

function buildUpstreamHeaders(accessToken: string, model: string, email: string): Record<string, string> {
  const fp = getFingerprint(email);
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${accessToken}`,
    "User-Agent": buildUserAgent(fp),
    "x-goog-api-client": "gl-node/18.18.2 fire/0.8.6 grpc/1.10.x",
    "x-client-name": "antigravity",
    "x-client-version": fp.version,
    "x-machine-id": fp.machineId,
    "x-vscode-sessionid": fp.sessionId,
  };
  if (model.includes("claude")) {
    h["anthropic-beta"] = "claude-code-20250219";
  }
  return h;
}

function parseSseResponse(sseText: string, model: string) {
  let fullText = "";
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;

  const lines = sseText.split("\n");
  for (const line of lines) {
    if (!line.startsWith("data: ")) continue;
    const jsonStr = line.slice(6).trim();
    if (!jsonStr || jsonStr === "[DONE]") continue;
    try {
      const chunk = JSON.parse(jsonStr);
      const inner = chunk.response || chunk;
      const parts = inner?.candidates?.[0]?.content?.parts;
      if (parts) {
        for (const p of parts) {
          if (p.thought) continue;
          if (p.text) fullText += p.text;
        }
      }
      const meta = inner?.usageMetadata;
      if (meta) {
        promptTokens = meta.promptTokenCount || promptTokens;
        completionTokens = meta.candidatesTokenCount || completionTokens;
        totalTokens = meta.totalTokenCount || totalTokens;
      }
    } catch { }
  }

  return {
    id: `chatcmpl-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message: { role: "assistant", content: fullText },
      finish_reason: "stop",
    }],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
    },
  };
}

const MAX_ACCOUNT_RETRIES = 3;

export async function POST(request: NextRequest) {
  await connectDB();

  const authHeader = request.headers.get("authorization");
  const apiKey = authHeader?.replace(/^Bearer\s+/i, "");
  if (!apiKey) {
    return NextResponse.json({ error: { message: "Missing API key", type: "auth_error" } }, { status: 401 });
  }

  const tunnel = await Tunnel.findOne({ apiKey, enabled: true });
  if (!tunnel) {
    return NextResponse.json({ error: { message: "Invalid API key", type: "auth_error" } }, { status: 401 });
  }

  if (tunnel.tokenLimit > 0 && tunnel.tokensUsed >= tunnel.tokenLimit) {
    return NextResponse.json({ error: { message: "Token limit exceeded", type: "rate_limit_error" } }, { status: 429 });
  }

  const body = await request.json();
  const model = tunnel.model;
  const messages = body.messages as Array<{ role: string; content: string }>;

  const triedAccountIds: string[] = [];
  let lastError: Record<string, unknown> | null = null;
  let lastStatus = 500;

  for (let attempt = 0; attempt < MAX_ACCOUNT_RETRIES; attempt++) {
    let account;
    if (tunnel.accountMode === "tied" && tunnel.tiedAccountId) {
      if (attempt > 0) break;
      account = await Account.findOne({ _id: tunnel.tiedAccountId, status: "active" });
      if (!account) {
        return NextResponse.json({ error: { message: "Tied account is unavailable", type: "server_error" } }, { status: 503 });
      }
    } else {
      account = await selectAccount(model, triedAccountIds);
    }
    if (!account) break;
    triedAccountIds.push(account._id.toString());

    let projectId: string;
    try {
      projectId = await getProjectId(account);
    } catch {
      continue;
    }

    const v1Body = buildV1InternalBody(messages, model, projectId, body);
    const headers = buildUpstreamHeaders(account.accessToken, model, account.email);

    for (const baseUrl of V1_INTERNAL_URLS) {
      const url = `${baseUrl}:streamGenerateContent?alt=sse`;
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(v1Body),
      });

      if (res.ok) {
        const sseText = await res.text();
        const oai = parseSseResponse(sseText, model);

        if (oai.usage.total_tokens > 0) {
          await Promise.all([
            Tunnel.findByIdAndUpdate(tunnel._id, {
              $inc: { tokensUsed: oai.usage.total_tokens },
            }),
            Account.findByIdAndUpdate(account._id, {
              $inc: { tokensUsed: oai.usage.total_tokens },
            }),
          ]);
        }

        return NextResponse.json(oai);
      }

      lastStatus = res.status;
      lastError = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));

      if (res.status === 429) {
        await Account.findByIdAndUpdate(account._id, {
          [`quotas.${model}`]: 0,
        });
        break;
      }

      if (res.status >= 500) continue;
      return NextResponse.json({ error: lastError }, { status: lastStatus });
    }
  }

  if (!lastError) {
    return NextResponse.json({ error: { message: "No available account for this model", type: "server_error" } }, { status: 503 });
  }
  return NextResponse.json({ error: lastError }, { status: lastStatus });
}

