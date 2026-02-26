import { NextRequest, NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await dbService.connect();
  const { id } = await params;
  const body = await request.json();
  if (body.apiKey) {
    const existing = await dbService.tunnel.findOne({ apiKey: body.apiKey, _id: { $ne: id } });
    if (existing) {
      return NextResponse.json({ error: "API key already exists" }, { status: 409 });
    }
  }
  const tunnel = await dbService.tunnel.findByIdAndUpdate(id, body, { new: true });
  if (!tunnel) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(tunnel);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await dbService.connect();
  const { id } = await params;
  await dbService.tunnel.findByIdAndDelete(id);
  return NextResponse.json({ ok: true });
}
