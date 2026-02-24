import { NextRequest, NextResponse } from "next/server";
import { loginUser, registerUser, createToken, hasAnyUsers } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action, username, password } = body;

  if (action === "register") {
    const exists = await hasAnyUsers();
    const role = exists ? "user" : "admin";
    try {
      const user = await registerUser(username, password, role);
      const token = await createToken({ userId: user._id.toString(), username: user.username, role: user.role });
      const res = NextResponse.json({ user: { id: user._id, username: user.username, role: user.role } });
      res.cookies.set("session", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 60 * 60 * 24 * 7, path: "/" });
      return res;
    } catch {
      return NextResponse.json({ error: "Username already exists" }, { status: 400 });
    }
  }

  if (action === "login") {
    const user = await loginUser(username, password);
    if (!user) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }
    const token = await createToken({ userId: user._id.toString(), username: user.username, role: user.role });
    const res = NextResponse.json({ user: { id: user._id, username: user.username, role: user.role } });
    res.cookies.set("session", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 60 * 60 * 24 * 7, path: "/" });
    return res;
  }

  if (action === "logout") {
    const res = NextResponse.json({ ok: true });
    res.cookies.delete("session");
    return res;
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
