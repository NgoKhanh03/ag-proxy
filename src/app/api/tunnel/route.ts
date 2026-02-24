import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Tunnel } from "@/lib/models/tunnel";

export async function GET() {
  await connectDB();
  const tunnels = await Tunnel.find().sort({ createdAt: -1 });
  return NextResponse.json(tunnels);
}
