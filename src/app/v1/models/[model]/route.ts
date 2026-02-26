import { NextRequest, NextResponse } from "next/server";

const MODELS = new Set([
  "gemini-3.1-pro-high",
  "gemini-3.1-pro-low",
  "gemini-3-flash",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "claude-sonnet-4-6",
  "claude-sonnet-4-6-thinking",
  "claude-opus-4-6-thinking",
]);

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ model: string }> }
) {
  const { model } = await params;
  if (!MODELS.has(model)) {
    return NextResponse.json(
      { error: { message: `Model '${model}' not found`, type: "invalid_request_error" } },
      { status: 404 }
    );
  }
  return NextResponse.json({
    id: model,
    object: "model",
    created: 1700000000,
    owned_by: "ag-proxy",
  });
}
