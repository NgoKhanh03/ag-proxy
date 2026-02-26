import { NextRequest, NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";

export async function GET() {
  await dbService.connect();
  const accounts = await dbService.account.find().populate("proxyId").sort({ createdAt: -1 });
  return NextResponse.json(accounts);
}

export async function POST(request: NextRequest) {
  await dbService.connect();
  const body = await request.json();
  const account = await dbService.account.create(body);
  return NextResponse.json(account, { status: 201 });
}
