import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Account } from "@/lib/models/account";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const { id } = await params;
  const account = await Account.findById(id).populate("proxyId");
  if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(account);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const { id } = await params;
  const body = await request.json();
  const account = await Account.findByIdAndUpdate(id, body, { new: true });
  if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(account);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const { id } = await params;
  await Account.findByIdAndDelete(id);
  return NextResponse.json({ ok: true });
}
