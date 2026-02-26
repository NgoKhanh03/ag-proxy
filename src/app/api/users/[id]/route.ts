import { NextRequest, NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";
import { requireAdmin } from "@/lib/auth";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await dbService.connect();
  const { id } = await params;
  const body = await request.json();
  const user = await dbService.user.findByIdAndUpdate(id, { role: body.role }, { new: true }).select("-password");
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(user);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await dbService.connect();
  const { id } = await params;
  await dbService.user.findByIdAndDelete(id);
  return NextResponse.json({ ok: true });
}
