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
  "claude-sonnet-4-6": "claude-sonnet-4-6",
  "claude-sonnet-4-6-thinking": "claude-sonnet-4-6-thinking",
  "claude-opus-4-6": "claude-opus-4-6-thinking",
  "claude-opus-4-6-thinking": "claude-opus-4-6-thinking",
  "claude-sonnet-4-20250514": "claude-sonnet-4-6",
  "claude-opus-4-20250514": "claude-opus-4-6-thinking",
  "claude-3-5-sonnet-20241022": "claude-sonnet-4-6",
  "claude-3-5-haiku-20241022": "claude-sonnet-4-6",
  "claude-3-opus-20240229": "claude-opus-4-6-thinking",
  "claude-3-5-sonnet-latest": "claude-sonnet-4-6",
  "claude-3-5-haiku-latest": "claude-sonnet-4-6",
  "claude-3-opus-latest": "claude-opus-4-6-thinking",
};

function resolveModel(model: string): string {
  return MODEL_MAP[model] || model;
}

async function fetchProjectInfo(accessToken: string, email: string): Promise<{ projectId: string }> {
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
  return { projectId: data.cloudaicompanionProject };
}

async function getProjectId(account: { _id: unknown; email: string; accessToken: string; projectId?: string }): Promise<string> {
  if (account.projectId) return account.projectId;
  const { projectId } = await fetchProjectInfo(account.accessToken, account.email);
  await Account.findByIdAndUpdate(account._id, { projectId });
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyBlock = any;

const ALLOWED_SCHEMA_FIELDS = new Set(["type", "description", "properties", "required", "items", "enum", "title"]);

function sanitizeSchema(schema: AnyBlock): AnyBlock {
  if (!schema || typeof schema !== "object") {
    return { type: "OBJECT", properties: { reason: { type: "STRING", description: "Reason for calling this tool" } }, required: ["reason"] };
  }
  const result: AnyBlock = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "const") { result.enum = [value]; continue; }
    if (!ALLOWED_SCHEMA_FIELDS.has(key)) continue;
    if (key === "properties" && value && typeof value === "object") {
      result.properties = {};
      for (const [pk, pv] of Object.entries(value as Record<string, unknown>)) {
        result.properties[pk] = sanitizeSchema(pv);
      }
    } else if (key === "items" && value && typeof value === "object") {
      result.items = sanitizeSchema(value);
    } else {
      result[key] = value;
    }
  }
  if (!result.type) result.type = "object";
  if (typeof result.type === "string") {
    const typeMap: Record<string, string> = { string: "STRING", number: "NUMBER", integer: "INTEGER", boolean: "BOOLEAN", array: "ARRAY", object: "OBJECT" };
    result.type = typeMap[result.type.toLowerCase()] || result.type.toUpperCase();
  }
  if (result.type === "OBJECT" && (!result.properties || Object.keys(result.properties).length === 0)) {
    result.properties = { reason: { type: "STRING", description: "Reason for calling this tool" } };
    result.required = ["reason"];
  }
  return result;
}

function cleanCacheControl(messages: AnyBlock[]): AnyBlock[] {
  return messages.map((msg: AnyBlock) => {
    if (!Array.isArray(msg.content)) return msg;
    return {
      ...msg,
      content: msg.content.map((block: AnyBlock) => {
        if (!block || typeof block !== "object") return block;
        const { cache_control, ...rest } = block;
        void cache_control;
        return rest;
      }),
    };
  });
}

function convertContentToParts(content: AnyBlock, isClaudeModel: boolean): AnyBlock[] {
  if (typeof content === "string") return [{ text: content }];
  if (!Array.isArray(content)) return [{ text: String(content) }];

  const parts: AnyBlock[] = [];
  for (const block of content) {
    if (!block) continue;
    if (block.type === "text") {
      if (block.text && block.text.trim()) {
        parts.push({ text: block.text });
      }
    } else if (block.type === "tool_use") {
      const fc: AnyBlock = { name: block.name, args: block.input || {} };
      if (isClaudeModel && block.id) fc.id = block.id;
      parts.push({ functionCall: fc });
    } else if (block.type === "tool_result") {
      let responseContent = block.content;
      if (typeof responseContent === "string") {
        responseContent = { result: responseContent };
      } else if (Array.isArray(responseContent)) {
        const texts = responseContent.filter((c: AnyBlock) => c.type === "text").map((c: AnyBlock) => c.text).join("\n");
        responseContent = { result: texts || "" };
      }
      const fr: AnyBlock = { name: block.tool_use_id || "unknown", response: responseContent };
      if (isClaudeModel && block.tool_use_id) fr.id = block.tool_use_id;
      parts.push({ functionResponse: fr });
    } else if (block.type === "thinking") {
      if (block.signature && block.signature.length >= 50) {
        parts.push({ text: block.thinking, thought: true, thoughtSignature: block.signature });
      }
    } else if (block.type === "image" && block.source?.type === "base64") {
      parts.push({ inlineData: { mimeType: block.source.media_type, data: block.source.data } });
    }
  }
  return parts;
}

function anthropicToolsToGoogle(tools: AnyBlock[]) {
  if (!tools?.length) return undefined;
  const declarations = tools.map((t: AnyBlock, idx: number) => {
    const name = (t.name || `tool-${idx}`).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
    return {
      name,
      description: t.description || "",
      parameters: sanitizeSchema(t.input_schema),
    };
  });
  return [{ functionDeclarations: declarations }];
}

function buildV1InternalBody(
  body: AnyBlock,
  model: string,
  projectId: string,
) {
  const apiModel = resolveModel(model);
  const isClaudeModel = apiModel.includes("claude");
  const isThinking = apiModel.includes("thinking");
  const messages = cleanCacheControl(body.messages || []);

  const contents: AnyBlock[] = [];
  for (const msg of messages) {
    const role = msg.role === "assistant" ? "model" : "user";
    const parts = convertContentToParts(msg.content, isClaudeModel);
    if (parts.length === 0) parts.push({ text: "." });
    contents.push({ role, parts });
  }

  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: body.max_tokens || 16384,
  };
  if (body.temperature !== undefined) generationConfig.temperature = body.temperature;
  if (body.top_p !== undefined) generationConfig.topP = body.top_p;
  if (body.top_k !== undefined) generationConfig.topK = body.top_k;

  if (isThinking) {
    if (isClaudeModel) {
      const thinkingConfig: AnyBlock = { include_thoughts: true };
      if (body.thinking?.budget_tokens) {
        thinkingConfig.thinking_budget = body.thinking.budget_tokens;
        if ((generationConfig.maxOutputTokens as number) <= thinkingConfig.thinking_budget) {
          generationConfig.maxOutputTokens = thinkingConfig.thinking_budget + 8192;
        }
      }
      generationConfig.thinkingConfig = thinkingConfig;
    }
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

  const system = typeof body.system === "string"
    ? body.system
    : Array.isArray(body.system)
      ? body.system.filter((s: AnyBlock) => s.type === "text").map((s: AnyBlock) => s.text || "").join("\n")
      : undefined;

  if (system) {
    innerRequest.systemInstruction = { role: "user", parts: [{ text: system }] };
  }

  const googleTools = anthropicToolsToGoogle(body.tools);
  if (googleTools) {
    innerRequest.tools = googleTools;
    if (isClaudeModel) {
      innerRequest.toolConfig = { functionCallingConfig: { mode: "VALIDATED" } };
    }
  }

  return {
    project: projectId,
    requestId: `agent-${crypto.randomUUID()}`,
    request: innerRequest,
    model: apiModel,
    userAgent: "antigravity",
    requestType: "agent",
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
  if (model.includes("claude") && model.includes("thinking")) {
    h["anthropic-beta"] = "interleaved-thinking-2025-05-14";
  }
  return h;
}

function convertGooglePartsToAnthropic(parts: AnyBlock[]) {
  const content: AnyBlock[] = [];
  let hasToolCalls = false;

  for (const part of parts) {
    if (part.text !== undefined) {
      if (part.thought === true) {
        content.push({
          type: "thinking",
          thinking: part.text,
          signature: part.thoughtSignature || "",
        });
      } else {
        content.push({ type: "text", text: part.text });
      }
    } else if (part.functionCall) {
      const toolId = part.functionCall.id || `toolu_${crypto.randomBytes(12).toString("hex")}`;
      content.push({
        type: "tool_use",
        id: toolId,
        name: part.functionCall.name,
        input: part.functionCall.args || {},
      });
      hasToolCalls = true;
    }
  }

  return { content, hasToolCalls };
}

function parseSseToAnthropic(sseText: string, model: string) {
  let promptTokens = 0;
  let completionTokens = 0;
  let cachedTokens = 0;
  const allParts: AnyBlock[] = [];
  let finishReason = "";

  for (const line of sseText.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    const jsonStr = line.slice(6).trim();
    if (!jsonStr || jsonStr === "[DONE]") continue;
    try {
      const chunk = JSON.parse(jsonStr);
      const inner = chunk.response || chunk;
      const candidate = inner?.candidates?.[0];
      const parts = candidate?.content?.parts;
      if (parts) allParts.push(...parts);
      if (candidate?.finishReason) finishReason = candidate.finishReason;
      const meta = inner?.usageMetadata;
      if (meta) {
        promptTokens = meta.promptTokenCount || promptTokens;
        completionTokens = meta.candidatesTokenCount || completionTokens;
        cachedTokens = meta.cachedContentTokenCount || cachedTokens;
      }
    } catch { }
  }

  const { content: rawContent, hasToolCalls } = convertGooglePartsToAnthropic(allParts);
  const content: AnyBlock[] = [];
  for (const block of rawContent) {
    if (block.type === "text") {
      if (!block.text) continue;
      const last = content[content.length - 1];
      if (last && last.type === "text") {
        last.text += block.text;
      } else {
        content.push({ ...block });
      }
    } else {
      content.push(block);
    }
  }
  if (content.length === 0) content.push({ type: "text", text: "" });

  let stopReason = "end_turn";
  if (finishReason === "MAX_TOKENS") stopReason = "max_tokens";
  else if (finishReason === "TOOL_USE" || hasToolCalls) stopReason = "tool_use";

  return {
    id: `msg_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
    type: "message",
    role: "assistant",
    content,
    model,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: promptTokens - cachedTokens,
      output_tokens: completionTokens,
      cache_read_input_tokens: cachedTokens,
      cache_creation_input_tokens: 0,
    },
  };
}

function streamSseToAnthropic(sseText: string, model: string) {
  const parsed = parseSseToAnthropic(sseText, model);
  const events: string[] = [];

  events.push(`event: message_start\ndata: ${JSON.stringify({
    type: "message_start",
    message: {
      id: parsed.id,
      type: "message",
      role: "assistant",
      content: [],
      model,
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: parsed.usage.input_tokens, output_tokens: 0, cache_read_input_tokens: parsed.usage.cache_read_input_tokens, cache_creation_input_tokens: 0 },
    },
  })}\n`);

  type MergedBlock = { type: string; texts?: string[]; thinking?: string; signature?: string; id?: string; name?: string; input?: unknown };
  const merged: MergedBlock[] = [];
  for (const block of parsed.content) {
    if (block.type === "text") {
      if (!block.text) continue;
      const last = merged[merged.length - 1];
      if (last && last.type === "text") {
        last.texts!.push(block.text);
      } else {
        merged.push({ type: "text", texts: [block.text] });
      }
    } else if (block.type === "thinking") {
      merged.push({ type: "thinking", thinking: block.thinking, signature: block.signature });
    } else if (block.type === "tool_use") {
      merged.push({ type: "tool_use", id: block.id, name: block.name, input: block.input });
    }
  }

  for (let i = 0; i < merged.length; i++) {
    const block = merged[i];
    if (block.type === "thinking") {
      events.push(`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: i, content_block: { type: "thinking", thinking: "" } })}\n`);
      events.push(`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: i, delta: { type: "thinking_delta", thinking: block.thinking } })}\n`);
      if (block.signature) {
        events.push(`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: i, delta: { type: "signature_delta", signature: block.signature } })}\n`);
      }
      events.push(`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: i })}\n`);
    } else if (block.type === "text") {
      events.push(`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: i, content_block: { type: "text", text: "" } })}\n`);
      for (const chunk of block.texts!) {
        events.push(`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: i, delta: { type: "text_delta", text: chunk } })}\n`);
      }
      events.push(`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: i })}\n`);
    } else if (block.type === "tool_use") {
      events.push(`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: i, content_block: { type: "tool_use", id: block.id, name: block.name, input: {} } })}\n`);
      events.push(`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: i, delta: { type: "input_json_delta", partial_json: JSON.stringify(block.input) } })}\n`);
      events.push(`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: i })}\n`);
    }
  }

  events.push(`event: message_delta\ndata: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: parsed.stop_reason, stop_sequence: null }, usage: { output_tokens: parsed.usage.output_tokens } })}\n`);
  events.push(`event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n`);

  return { events, usage: parsed.usage };
}

const MAX_ACCOUNT_RETRIES = 3;

export async function POST(request: NextRequest) {
  await connectDB();

  const apiKey = request.headers.get("x-api-key") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!apiKey) {
    return NextResponse.json({ type: "error", error: { type: "authentication_error", message: "Missing API key" } }, { status: 401 });
  }

  const tunnel = await Tunnel.findOne({ apiKey, enabled: true });
  if (!tunnel) {
    return NextResponse.json({ type: "error", error: { type: "authentication_error", message: "Invalid API key" } }, { status: 401 });
  }

  if (tunnel.tokenLimit > 0 && tunnel.tokensUsed >= tunnel.tokenLimit) {
    return NextResponse.json({ type: "error", error: { type: "rate_limit_error", message: "Token limit exceeded" } }, { status: 429 });
  }

  const body = await request.json();
  const requestedModel = body.model || tunnel.model;
  const model = resolveModel(requestedModel);
  const stream = body.stream === true;

  const triedAccountIds: string[] = [];
  let lastError: Record<string, unknown> | null = null;
  let lastStatus = 500;

  for (let attempt = 0; attempt < MAX_ACCOUNT_RETRIES; attempt++) {
    let account;
    if (tunnel.accountMode === "tied" && tunnel.tiedAccountId) {
      if (attempt > 0) break;
      account = await Account.findOne({ _id: tunnel.tiedAccountId, status: "active" });
      if (!account) {
        return NextResponse.json({ type: "error", error: { type: "api_error", message: "Tied account is unavailable" } }, { status: 503 });
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

    const v1Body = buildV1InternalBody(body, model, projectId);
    const headers = buildUpstreamHeaders(account.accessToken, model, account.email);

    for (const baseUrl of V1_INTERNAL_URLS) {
      const url = `${baseUrl}:streamGenerateContent?alt=sse`;
      const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(v1Body) });

      if (res.ok) {
        const sseText = await res.text();

        if (stream) {
          const { events, usage } = streamSseToAnthropic(sseText, requestedModel);
          const totalTokens = usage.input_tokens + usage.output_tokens;
          if (totalTokens > 0) {
            Promise.all([
              Tunnel.findByIdAndUpdate(tunnel._id, { $inc: { tokensUsed: totalTokens } }),
              Account.findByIdAndUpdate(account._id, { $inc: { tokensUsed: totalTokens } }),
            ]).catch(() => { });
          }
          const encoder = new TextEncoder();
          const readable = new ReadableStream({
            start(controller) {
              for (const event of events) controller.enqueue(encoder.encode(event + "\n"));
              controller.close();
            },
          });
          return new Response(readable, {
            headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
          });
        }

        const anthropicResponse = parseSseToAnthropic(sseText, requestedModel);
        const totalTokens = anthropicResponse.usage.input_tokens + anthropicResponse.usage.output_tokens;
        if (totalTokens > 0) {
          Promise.all([
            Tunnel.findByIdAndUpdate(tunnel._id, { $inc: { tokensUsed: totalTokens } }),
            Account.findByIdAndUpdate(account._id, { $inc: { tokensUsed: totalTokens } }),
          ]).catch(() => { });
        }
        return NextResponse.json(anthropicResponse);
      }

      lastStatus = res.status;
      lastError = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));

      if (res.status === 429) {
        await Account.findByIdAndUpdate(account._id, { [`quotas.${model}`]: 0 });
        break;
      }
      if (res.status >= 500) continue;
      return NextResponse.json({ type: "error", error: { type: "invalid_request_error", message: (lastError as Record<string, string>)?.message || "Upstream error" } }, { status: 400 });
    }
  }

  if (!lastError) {
    return NextResponse.json({ type: "error", error: { type: "api_error", message: "No available account for this model" } }, { status: 503 });
  }
  if (lastStatus === 429) {
    return NextResponse.json({ type: "error", error: { type: "invalid_request_error", message: "RESOURCE_EXHAUSTED: All accounts have exhausted quota. Please wait for reset." } }, { status: 400 });
  }
  return NextResponse.json({ type: "error", error: { type: "api_error", message: (lastError as Record<string, string>)?.message || "Upstream error" } }, { status: lastStatus });
}
