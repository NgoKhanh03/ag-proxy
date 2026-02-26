import { NextRequest, NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";

export async function GET() {
  await dbService.connect();
  const tunnels = await dbService.tunnel.find().populate("tiedAccountId", "email name avatar").sort({ createdAt: -1 });
  return NextResponse.json(tunnels);
}

export async function POST(request: NextRequest) {
  await dbService.connect();
  const body = await request.json();
  const existing = await dbService.tunnel.findOne({ apiKey: body.apiKey });
  if (existing) {
    return NextResponse.json({ error: "API key already exists" }, { status: 409 });
  }
  const tunnel = await dbService.tunnel.create(body);
  return NextResponse.json(tunnel, { status: 201 });
}
