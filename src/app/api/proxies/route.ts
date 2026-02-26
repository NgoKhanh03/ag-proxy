import { NextRequest, NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";

export async function GET() {
  await dbService.connect();
  const proxies = await dbService.proxy.find().sort({ createdAt: -1 });
  return NextResponse.json(proxies);
}

export async function POST(request: NextRequest) {
  await dbService.connect();
  const body = await request.json();
  const proxy = await dbService.proxy.create(body);
  return NextResponse.json(proxy, { status: 201 });
}
