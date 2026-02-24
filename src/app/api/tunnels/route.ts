import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Tunnel } from "@/lib/models/tunnel";
import "@/lib/models/account";

export async function GET() {
  await connectDB();
  const tunnels = await Tunnel.find().populate("tiedAccountId", "email name avatar").sort({ createdAt: -1 });
  return NextResponse.json(tunnels);
}

export async function POST(request: NextRequest) {
  await connectDB();
  const body = await request.json();
  const existing = await Tunnel.findOne({ apiKey: body.apiKey });
  if (existing) {
    return NextResponse.json({ error: "API key already exists" }, { status: 409 });
  }
  const tunnel = await Tunnel.create(body);
  return NextResponse.json(tunnel, { status: 201 });
}
