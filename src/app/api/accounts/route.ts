import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Account } from "@/lib/models/account";

export async function GET() {
  await connectDB();
  const accounts = await Account.find().populate("proxyId").sort({ createdAt: -1 });
  return NextResponse.json(accounts);
}

export async function POST(request: NextRequest) {
  await connectDB();
  const body = await request.json();
  const account = await Account.create(body);
  return NextResponse.json(account, { status: 201 });
}
