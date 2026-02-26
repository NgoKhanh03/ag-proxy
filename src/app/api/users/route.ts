import { NextRequest, NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";
import { requireAdmin, registerUser } from "@/lib/auth";

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await dbService.connect();
  const users = await dbService.user.find().select("-password").sort({ createdAt: -1 });
  return NextResponse.json(users);
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { username, password, role } = await request.json();
  try {
    const user = await registerUser(username, password, role || "user");
    return NextResponse.json({ id: user._id, username: user.username, role: user.role }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Username already exists" }, { status: 400 });
  }
}
