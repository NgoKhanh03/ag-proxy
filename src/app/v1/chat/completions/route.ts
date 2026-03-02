import { NextRequest, NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";
import * as crypto from "crypto";
import { getAntigravityUserAgent, getAntigravityVersion } from "@/lib/version";
import { getValidAccessToken, fetchQuotas } from "@/lib/google-account";

const V1_INTERNAL_URLS = [
  "https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal",
  "https://daily-cloudcode-pa.googleapis.com/v1internal",
  "https://cloudcode-pa.googleapis.com/v1internal",
];

// Fingerprint per-account để giữ machineId và sessionId ổn định
const accountFingerprints = new Map<string, { machineId: string; sessionId: string; sessionTs: number }>();

function getFingerprint(email: string) {
  const now = Date.now();
  const existing = accountFingerprints.get(email);
  if (existing && now - existing.sessionTs < 3600_000) return existing;
  const hash = crypto.createHash("sha256").update(email).digest("hex");
  const machineId = existing?.machineId || [hash.slice(0, 8), hash.slice(8, 12), hash.slice(12, 16), hash.slice(16, 20), hash.slice(20, 32)].join("-");
  const fp = {
    machineId,
    sessionId: crypto.randomUUID(),
    sessionTs: now,
  };
  accountFingerprints.set(email, fp);
  return fp;
}

async function fetchProjectInfo(accessToken: string): Promise<{ projectId: string; tier: string }> {
  const url = "https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:loadCodeAssist";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`,
      "User-Agent": getAntigravityUserAgent(),
    },
    body: JSON.stringify({ metadata: { ideType: "ANTIGRAVITY" } }),
  });
  if (!res.ok) throw new Error(`loadCodeAssist failed: ${res.status}`);
  const data = await res.json();
  if (!data.cloudaicompanionProject) throw new Error("No cloudaicompanionProject returned");
  const tier = (data.paidTier?.id || data.currentTier?.id || "FREE").toLowerCase();
  return { projectId: data.cloudaicompanionProject, tier };
}

async function getProjectId(account: { _id: unknown; email: string; accessToken: string; refreshToken: string; tokenExpiresAt?: Date; projectId?: string }): Promise<string> {
  if (account.projectId) return account.projectId;
  const token = await getValidAccessToken(account);
  const { projectId, tier } = await fetchProjectInfo(token);
  await dbService.account.findByIdAndUpdate(account._id, { projectId, tier });
  return projectId;
}

async function selectAccount(model: string, excludeIds: string[] = []) {
  const accounts = await dbService.account.find({
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
      dbService.account.findByIdAndUpdate(acc._id, { tokensUsed: 0, [`quotas.${model}`]: 100 }).exec();
    }
    const usage = acc.tokensUsed || 0;
    if (usage < bestUsage) {
      bestUsage = usage;
      best = acc;
    }
  }
  return best;
}

// Flatten OpenAI content (string hoặc array [{type,text}]) → string thuần
function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((p: any) => p.type === "text")
      .map((p: any) => p.text ?? "")
      .join("");
  }
  return String(content ?? "");
}

// Convert OpenAI tools array → Gemini functionDeclarations
function convertToolsToGemini(tools: any[]): any[] {
  return tools
    .filter((t) => t?.type === "function" && t?.function?.name)
    .map((t) => ({
      name: t.function.name,
      description: t.function.description ?? "",
      parameters: t.function.parameters ?? { type: "object", properties: {} },
    }));
}

// Convert OpenAI tool_choice → Gemini toolConfig.functionCallingConfig
function convertToolChoiceToGemini(toolChoice: unknown): Record<string, unknown> | undefined {
  if (!toolChoice) return undefined;
  if (toolChoice === "none") return { functionCallingConfig: { mode: "NONE" } };
  if (toolChoice === "auto") return { functionCallingConfig: { mode: "AUTO" } };
  if (toolChoice === "required") return { functionCallingConfig: { mode: "ANY" } };
  if (typeof toolChoice === "object" && (toolChoice as any)?.type === "function") {
    const name = (toolChoice as any)?.function?.name;
    if (name) return { functionCallingConfig: { mode: "ANY", allowedFunctionNames: [name] } };
  }
  return { functionCallingConfig: { mode: "AUTO" } };
}

// Build Gemini parts from a single OpenAI message
// Handles: text, tool_calls (assistant), tool result (role=tool)
function buildGeminiPartsFromMessage(m: { role: string; content: unknown; tool_calls?: any[]; tool_call_id?: string; name?: string }): any[] {
  const parts: any[] = [];

  // Assistant message with tool_calls → functionCall parts
  // Include id so Google Cloud Code can construct Anthropic tool_use.id (required field)
  if (m.role === "assistant" && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
    for (const tc of m.tool_calls) {
      if (tc?.type === "function" && tc?.function?.name) {
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(tc.function.arguments ?? "{}"); } catch { }
        parts.push({ functionCall: { name: tc.function.name, args, id: tc.id } });
      }
    }
    // Also include any text content alongside tool calls
    const text = extractText(m.content);
    if (text) parts.push({ text });
    return parts;
  }

  // Tool result message (role=tool) → functionResponse part
  if (m.role === "tool") {
    const fnName = m.name ?? "tool";
    const resultText = extractText(m.content);
    let response: Record<string, unknown>;
    try { response = JSON.parse(resultText); } catch { response = { result: resultText }; }
    parts.push({ functionResponse: { name: fnName, response } });
    return parts;
  }

  // Regular text message
  const text = extractText(m.content);
  if (text) parts.push({ text });
  return parts;
}

function buildV1InternalBody(messages: Array<{ role: string; content: unknown; tool_calls?: any[]; tool_call_id?: string; name?: string }>, model: string, projectId: string, opts: Record<string, unknown>) {
  const systemParts = messages
    .filter((m) => m.role === "system")
    .map((m) => ({ text: extractText(m.content) }));

  // Build tool_call_id → function_name map from assistant messages
  // Needed so tool result messages can include the correct function name
  const toolCallIdToName = new Map<string, string>();
  for (const m of messages) {
    if (m.role === "assistant" && Array.isArray(m.tool_calls)) {
      for (const tc of m.tool_calls) {
        if (tc?.id && tc?.function?.name) {
          toolCallIdToName.set(tc.id, tc.function.name);
        }
      }
    }
  }

  // Build contents — group consecutive tool results (role=tool) with preceding assistant message
  const contents: Array<{ role: string; parts: any[] }> = [];
  const nonSystemMsgs = messages.filter((m) => m.role !== "system");

  for (let i = 0; i < nonSystemMsgs.length; i++) {
    const m = nonSystemMsgs[i];

    // Skip raw tool messages here — handled inside the assistant block below
    if (m.role === "tool") {
      // This shouldn't happen in a well-formed history, but guard anyway
      continue;
    }

    if (m.role === "assistant") {
      if (Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
        // --- Process assistant+tool block atomically ---

        // 1. Collect ALL consecutive tool messages that follow this assistant
        const followingTools: typeof nonSystemMsgs = [];
        let j = i + 1;
        while (j < nonSystemMsgs.length && nonSystemMsgs[j].role === "tool") {
          followingTools.push(nonSystemMsgs[j]);
          j++;
        }

        // 2. Build set of fulfilled tool_call_ids
        const fulfilledIds = new Set<string>(
          followingTools.map((t) => t.tool_call_id ?? "").filter(Boolean)
        );

        // 3. Build functionCall parts — only for fulfilled tool_calls
        const modelParts: any[] = [];
        const emittedIds = new Set<string>();
        for (const tc of m.tool_calls) {
          if (!fulfilledIds.has(tc.id)) continue; // orphaned — skip
          if (tc?.type !== "function" || !tc?.function?.name) continue;
          let args: Record<string, unknown> = {};
          try { args = JSON.parse(tc.function.arguments ?? "{}"); } catch { }
          modelParts.push({ functionCall: { name: tc.function.name, args, id: tc.id } });
          emittedIds.add(tc.id);
        }

        // Keep any text content from the assistant
        const text = extractText(m.content);
        if (text) modelParts.push({ text });

        if (modelParts.length > 0) {
          contents.push({ role: "model", parts: modelParts });
        }

        // 4. Build functionResponse parts — only for emitted tool_calls
        if (emittedIds.size > 0) {
          const userParts: any[] = [];
          for (const tm of followingTools) {
            if (!tm.tool_call_id || !emittedIds.has(tm.tool_call_id)) continue;
            const fnName = tm.name ?? toolCallIdToName.get(tm.tool_call_id) ?? "tool";
            const resultText = extractText(tm.content);
            let response: Record<string, unknown>;
            try { response = JSON.parse(resultText); } catch { response = { result: resultText }; }
            userParts.push({ functionResponse: { name: fnName, response, id: tm.tool_call_id } });
          }
          if (userParts.length > 0) {
            contents.push({ role: "user", parts: userParts });
          }
        }

        // 5. Advance i past all the tool messages we just consumed
        i = j - 1;
      } else {
        // Regular assistant text message
        const parts = buildGeminiPartsFromMessage(m);
        if (parts.length > 0) {
          contents.push({ role: "model", parts });
        }
      }
    } else {
      // user message
      const parts = buildGeminiPartsFromMessage(m);
      if (parts.length > 0) {
        contents.push({ role: "user", parts });
      }
    }
  }

  // --- Post-processing: sanitize contents for valid Anthropic/Gemini turn structure ---

  // Pass 1: Remove model turns with functionCall not followed by user+functionResponse
  for (let ci = contents.length - 1; ci >= 0; ci--) {
    const turn = contents[ci];
    if (turn.role !== "model") continue;
    const hasFunctionCall = (turn.parts ?? []).some((p: any) => p.functionCall);
    if (!hasFunctionCall) continue;
    const nextTurn = contents[ci + 1];
    const nextHasFunctionResponse = nextTurn?.role === "user" &&
      (nextTurn.parts ?? []).some((p: any) => p.functionResponse);
    if (!nextHasFunctionResponse) {
      const textParts = (turn.parts ?? []).filter((p: any) => p.text);
      if (textParts.length > 0) {
        contents[ci] = { role: "model", parts: textParts };
      } else {
        contents.splice(ci, 1);
      }
    }
  }

  // Pass 2: Remove leading model turns (first turn must be user)
  while (contents.length > 0 && contents[0].role === "model") {
    contents.shift();
  }

  // Pass 3: Merge consecutive same-role turns (Anthropic forbids them)
  const merged: Array<{ role: string; parts: any[] }> = [];
  for (const turn of contents) {
    const prev = merged[merged.length - 1];
    if (prev && prev.role === turn.role) {
      prev.parts.push(...turn.parts);
    } else {
      merged.push({ role: turn.role, parts: [...turn.parts] });
    }
  }
  contents.length = 0;
  contents.push(...merged);

  // Hỗ trợ cả max_tokens (OpenAI cũ) và max_completion_tokens (OpenAI mới)
  const maxTokens = (opts.max_completion_tokens || opts.max_tokens) as number | undefined;

  const generationConfig: Record<string, unknown> = {
    temperature: opts.temperature ?? 1.0,
    topP: 0.95,
  };
  if (maxTokens) {
    generationConfig.maxOutputTokens = maxTokens;
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

  // Tools: convert OpenAI format → Gemini functionDeclarations
  const oaiTools = opts.tools as any[] | undefined;
  if (Array.isArray(oaiTools) && oaiTools.length > 0) {
    const functionDeclarations = convertToolsToGemini(oaiTools);
    if (functionDeclarations.length > 0) {
      innerRequest.tools = [{ functionDeclarations }];
    }
    const toolConfig = convertToolChoiceToGemini(opts.tool_choice);
    if (toolConfig) {
      innerRequest.toolConfig = toolConfig;
    }
  }

  return {
    project: projectId,
    requestId: `openai-${crypto.randomUUID()}`,
    request: innerRequest,
    model,
    userAgent: "antigravity",
    requestType: "chat",
  };
}

// Convert Gemini functionCall parts → OpenAI tool_calls array
function extractToolCalls(parts: any[]): any[] | undefined {
  const toolCalls: any[] = [];
  for (const p of parts) {
    if (p.functionCall) {
      toolCalls.push({
        id: `call_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
        type: "function",
        function: {
          name: p.functionCall.name,
          arguments: JSON.stringify(p.functionCall.args ?? {}),
        },
      });
    }
  }
  return toolCalls.length > 0 ? toolCalls : undefined;
}

// Build SSE stream response theo format OpenAI (có tool_calls support)
function buildStreamResponse(sseText: string, model: string): ReadableStream {
  const encoder = new TextEncoder();
  const chatId = `chatcmpl-${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);

  return new ReadableStream({
    start(controller) {
      const lines = sseText.split("\n");
      let promptTokens = 0;
      let completionTokens = 0;
      let totalTokens = 0;

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr || jsonStr === "[DONE]") continue;
        try {
          const chunk = JSON.parse(jsonStr);
          const inner = chunk.response || chunk;
          const parts = inner?.candidates?.[0]?.content?.parts;
          const meta = inner?.usageMetadata;

          if (meta) {
            promptTokens = meta.promptTokenCount || promptTokens;
            completionTokens = meta.candidatesTokenCount || completionTokens;
            totalTokens = meta.totalTokenCount || totalTokens;
          }

          if (parts) {
            // Check for functionCall parts → emit as tool_calls delta
            const toolCalls = extractToolCalls(parts);
            if (toolCalls) {
              // Emit tool_calls as streaming delta chunks (index-based)
              for (let idx = 0; idx < toolCalls.length; idx++) {
                const tc = toolCalls[idx];
                // First: emit the tool call header (id, type, function.name)
                const headerChunk = {
                  id: chatId, object: "chat.completion.chunk", created, model,
                  choices: [{
                    index: 0,
                    delta: {
                      tool_calls: [{ index: idx, id: tc.id, type: "function", function: { name: tc.function.name, arguments: "" } }]
                    },
                    finish_reason: null,
                  }],
                };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(headerChunk)}\n\n`));
                // Then: emit the arguments
                const argsChunk = {
                  id: chatId, object: "chat.completion.chunk", created, model,
                  choices: [{
                    index: 0,
                    delta: { tool_calls: [{ index: idx, function: { arguments: tc.function.arguments } }] },
                    finish_reason: null,
                  }],
                };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(argsChunk)}\n\n`));
              }
              continue;
            }

            // Regular text parts
            for (const p of parts) {
              if (p.thought || !p.text) continue;
              const oaiChunk = {
                id: chatId, object: "chat.completion.chunk", created, model,
                choices: [{ index: 0, delta: { content: p.text }, finish_reason: null }],
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(oaiChunk)}\n\n`));
            }
          }
        } catch { }
      }

      // Final chunk
      const finalChunk = {
        id: chatId, object: "chat.completion.chunk", created, model,
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: totalTokens },
      };
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(finalChunk)}\n\n`));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
}

function buildUpstreamHeaders(accessToken: string, model: string, email: string): Record<string, string> {
  const fp = getFingerprint(email);
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${accessToken}`,
    "User-Agent": getAntigravityUserAgent(),
    "x-goog-api-client": "gl-node/18.18.2 fire/0.8.6 grpc/1.10.x",
    "x-client-name": "antigravity",
    "x-client-version": getAntigravityVersion(),
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
  const allToolCalls: any[] = [];
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
        // Extract functionCall parts → tool_calls
        const tcs = extractToolCalls(parts);
        if (tcs) {
          allToolCalls.push(...tcs);
        }
        for (const p of parts) {
          if (p.thought || p.functionCall) continue;
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

  const hasToolCalls = allToolCalls.length > 0;
  const message: Record<string, unknown> = { role: "assistant", content: fullText || null };
  if (hasToolCalls) message.tool_calls = allToolCalls;

  return {
    id: `chatcmpl-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message,
      finish_reason: hasToolCalls ? "tool_calls" : "stop",
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
  await dbService.connect();

  const authHeader = request.headers.get("authorization");
  const apiKey = authHeader?.replace(/^Bearer\s+/i, "");
  if (!apiKey) {
    return NextResponse.json({ error: { message: "Missing API key", type: "auth_error" } }, { status: 401 });
  }

  const tunnel = await dbService.tunnel.findOne({ apiKey, enabled: true });
  if (!tunnel) {
    return NextResponse.json({ error: { message: "Invalid API key", type: "auth_error" } }, { status: 401 });
  }

  if (tunnel.tokenLimit > 0 && tunnel.tokensUsed >= tunnel.tokenLimit) {
    return NextResponse.json({ error: { message: "Token limit exceeded", type: "rate_limit_error" } }, { status: 429 });
  }

  const acceptHeader = request.headers.get("accept") ?? "";
  const isStream = acceptHeader.includes("text/event-stream");

  const body = await request.json();
  const model = tunnel.model;
  const messages = body.messages as Array<{ role: string; content: unknown }>;

  console.log(`\n[REQ] ══════════════════════════════`);
  console.log(`[REQ] model     : ${model}`);
  console.log(`[REQ] stream    : ${isStream} (Accept: ${acceptHeader || "(none)"})`);
  console.log(`[REQ] tunnel    : ${tunnel._id} (${tunnel.accountMode})`);
  console.log(`[REQ] messages  : ${messages?.length ?? 0} msg(s)`);
  if (messages?.length) {
    for (let mi = 0; mi < messages.length; mi++) {
      const m = messages[mi] as any;
      const preview = typeof m.content === "string"
        ? m.content.slice(0, 80)
        : JSON.stringify(m.content)?.slice(0, 80);
      const tcInfo = m.tool_calls
        ? ` [tool_calls: ${m.tool_calls.map((tc: any) => tc.id).join(",")}]`
        : m.tool_call_id
          ? ` [tool_call_id: ${m.tool_call_id}]`
          : "";
      console.log(`[REQ]   [${mi}][${m.role}]${tcInfo} ${preview ?? ""}`);
    }
  }
  console.log(`[REQ] ══════════════════════════════`);

  const triedAccountIds: string[] = [];
  let lastError: Record<string, unknown> | null = null;
  let lastStatus = 500;

  for (let attempt = 0; attempt < MAX_ACCOUNT_RETRIES; attempt++) {
    let account;
    if (tunnel.accountMode === "tied" && tunnel.tiedAccountId) {
      if (attempt > 0) break;
      account = await dbService.account.findOne({ _id: tunnel.tiedAccountId, status: "active" });
      if (!account) {
        return NextResponse.json({ error: { message: "Tied account is unavailable", type: "server_error" } }, { status: 503 });
      }
    } else {
      account = await selectAccount(model, triedAccountIds);
    }
    if (!account) break;
    triedAccountIds.push(account._id.toString());

    let projectId: string;
    let accessToken: string;
    try {
      accessToken = await getValidAccessToken(account);
      projectId = await getProjectId({ ...account.toObject(), accessToken });
    } catch (e: any) {
      console.log(`[TOKEN] Bỏ qua account ${account.email}: ${e.message}`);
      continue;
    }

    const v1Body = buildV1InternalBody(messages, model, projectId, body);
    const headers = buildUpstreamHeaders(accessToken, model, account.email);

    // ===== DEBUG: Gemini contents =====
    const contents = (v1Body.request as any)?.contents ?? [];
    console.log(`[GEM] contents  : ${contents.length} turn(s)`);
    for (let ci = 0; ci < contents.length; ci++) {
      const turn = contents[ci];
      const partSummaries = (turn.parts ?? []).map((p: any) => {
        if (p.functionCall) return `functionCall(${p.functionCall.name},id=${p.functionCall.id})`;
        if (p.functionResponse) return `functionResponse(${p.functionResponse.name},id=${p.functionResponse.id})`;
        if (p.text) return `text(${p.text.slice(0, 40)})`;
        return JSON.stringify(p).slice(0, 40);
      }).join(", ");
      console.log(`[GEM]   [${ci}][${turn.role}] ${partSummaries}`);
    }

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

        // ===== DEBUG: Upstream response =====
        console.log(`\n[RES] ══════════════════════════════`);
        console.log(`[RES] upstream  : ${url}`);
        console.log(`[RES] account   : ${account.email}`);
        console.log(`[RES] status    : ${res.status}`);
        console.log(`[RES] tokens    : prompt=${oai.usage.prompt_tokens} completion=${oai.usage.completion_tokens} total=${oai.usage.total_tokens}`);
        const contentPreview = (oai.choices[0]?.message?.content as string | null | undefined) ?? "";
        console.log(`[RES] content   : ${contentPreview.slice(0, 200)}${contentPreview.length > 200 ? "..." : ""}`);
        console.log(`[RES] raw SSE   : ${sseText.length} chars, ${sseText.split("\n").filter(l => l.startsWith("data:")).length} data lines`);
        console.log(`[RES] ══════════════════════════════`);

        if (oai.usage.total_tokens > 0) {
          await Promise.all([
            dbService.tunnel.findByIdAndUpdate(tunnel._id, { $inc: { tokensUsed: oai.usage.total_tokens } }),
            dbService.account.findByIdAndUpdate(account._id, { $inc: { tokensUsed: oai.usage.total_tokens } }),
          ]);
        }

        // Trả về SSE stream nếu client yêu cầu
        if (isStream) {
          console.log(`[RES] → trả về stream (SSE)`);
          return new Response(buildStreamResponse(sseText, model), {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              "Connection": "keep-alive",
              "X-Accel-Buffering": "no",
            },
          });
        }

        console.log(`[RES] → trả về JSON`);
        return NextResponse.json(oai);
      }

      lastStatus = res.status;
      lastError = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
      console.log(`[RES] ❌ upstream ${url} → HTTP ${res.status}`, JSON.stringify(lastError)?.slice(0, 200));

      // 401: force refresh rồi retry
      if (res.status === 401) {
        console.log(`[TOKEN] ⚠️ Upstream 401 cho ${account.email} — force refresh...`);
        const refreshed = await getValidAccessToken({ ...account.toObject(), accessToken: "", tokenExpiresAt: new Date(0) });
        if (refreshed && refreshed !== accessToken) {
          console.log(`[TOKEN] ✅ Force refresh OK. Retry...`);
          const retryHeaders = buildUpstreamHeaders(refreshed, model, account.email);
          const retryRes = await fetch(url, { method: "POST", headers: retryHeaders, body: JSON.stringify(v1Body) });
          if (retryRes.ok) {
            const sseText = await retryRes.text();
            const oai = parseSseResponse(sseText, model);
            if (oai.usage.total_tokens > 0) {
              await Promise.all([
                dbService.tunnel.findByIdAndUpdate(tunnel._id, { $inc: { tokensUsed: oai.usage.total_tokens } }),
                dbService.account.findByIdAndUpdate(account._id, { $inc: { tokensUsed: oai.usage.total_tokens } }),
              ]);
            }
            if (isStream) {
              return new Response(buildStreamResponse(sseText, model), {
                headers: {
                  "Content-Type": "text/event-stream",
                  "Cache-Control": "no-cache",
                  "Connection": "keep-alive",
                  "X-Accel-Buffering": "no",
                },
              });
            }
            return NextResponse.json(oai);
          }
          lastStatus = retryRes.status;
          lastError = await retryRes.json().catch(() => ({ message: `HTTP ${retryRes.status}` }));
          console.log(`[TOKEN] ❌ Retry sau refresh vẫn lỗi: ${retryRes.status}`);
        }
        break;
      }

      // 429: fetch real quotas thay vì blindly set = 0
      if (res.status === 429) {
        fetchQuotas(accessToken, projectId).then(({ quotas, resets }) => {
          const update: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(quotas)) update[`quotas.${k}`] = v;
          for (const [k, v] of Object.entries(resets)) update[`quotaResets.${k}`] = v;
          if (Object.keys(update).length > 0) {
            dbService.account.findByIdAndUpdate(account._id, update).exec();
          }
        }).catch(() => { });
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
