import { NextResponse } from "next/server";

const MODELS = [
  "gemini-3.1-pro-high",
  "gemini-3.1-pro-low",
  "gemini-3-flash",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "claude-sonnet-4-6",
  "claude-sonnet-4-6-thinking",
  "claude-opus-4-6-thinking",
];

export async function GET() {
  return NextResponse.json({
    object: "list",
    data: MODELS.map((id) => ({
      id,
      object: "model",
      created: 1700000000,
      owned_by: "ag-proxy",
    })),
  });
}
