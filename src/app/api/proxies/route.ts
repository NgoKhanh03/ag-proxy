import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Proxy } from "@/lib/models/proxy";

export async function GET() {
  await connectDB();
  const proxies = await Proxy.find().sort({ createdAt: -1 });
  return NextResponse.json(proxies);
}

export async function POST(request: NextRequest) {
  await connectDB();
  const body = await request.json();
  const proxy = await Proxy.create(body);
  return NextResponse.json(proxy, { status: 201 });
}
