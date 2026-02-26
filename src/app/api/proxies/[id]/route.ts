import { NextRequest, NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await dbService.connect();
  const { id } = await params;
  const proxy = await dbService.proxy.findById(id);
  if (!proxy) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(proxy);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await dbService.connect();
  const { id } = await params;
  const body = await request.json();
  const proxy = await dbService.proxy.findByIdAndUpdate(id, body, { new: true });
  if (!proxy) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(proxy);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await dbService.connect();
  const { id } = await params;
  await dbService.proxy.findByIdAndDelete(id);
  return NextResponse.json({ ok: true });
}
