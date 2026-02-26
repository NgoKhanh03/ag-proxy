import { NextRequest, NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await dbService.connect();
  const { id } = await params;
  const account = await dbService.account.findById(id).populate("proxyId");
  if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(account);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await dbService.connect();
  const { id } = await params;
  const body = await request.json();
  const account = await dbService.account.findByIdAndUpdate(id, body, { new: true });
  if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(account);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await dbService.connect();
  const { id } = await params;
  await dbService.account.findByIdAndDelete(id);
  return NextResponse.json({ ok: true });
}
