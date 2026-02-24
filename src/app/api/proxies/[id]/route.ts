import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Proxy } from "@/lib/models/proxy";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const { id } = await params;
  const proxy = await Proxy.findById(id);
  if (!proxy) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(proxy);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const { id } = await params;
  const body = await request.json();
  const proxy = await Proxy.findByIdAndUpdate(id, body, { new: true });
  if (!proxy) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(proxy);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const { id } = await params;
  await Proxy.findByIdAndDelete(id);
  return NextResponse.json({ ok: true });
}
