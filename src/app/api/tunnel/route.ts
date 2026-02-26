import { NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";

export async function GET() {
  await dbService.connect();
  const tunnels = await dbService.tunnel.find().sort({ createdAt: -1 });
  return NextResponse.json(tunnels);
}
