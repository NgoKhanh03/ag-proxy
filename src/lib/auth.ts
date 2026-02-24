import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { connectDB } from "./db";
import { User } from "./models/user";
import bcrypt from "bcryptjs";

const secret = new TextEncoder().encode(process.env.JWT_SECRET || "fallback-secret-change-me");

export interface SessionPayload {
  userId: string;
  username: string;
  role: "admin" | "user";
}

export async function createToken(payload: SessionPayload) {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(secret);
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function requireAuth(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return session;
}

export async function requireAdmin(): Promise<SessionPayload> {
  const session = await requireAuth();
  if (session.role !== "admin") throw new Error("Forbidden");
  return session;
}

export async function hasAnyUsers(): Promise<boolean> {
  await connectDB();
  const count = await User.countDocuments();
  return count > 0;
}

export async function registerUser(username: string, password: string, role: "admin" | "user" = "user") {
  await connectDB();
  const hashed = await bcrypt.hash(password, 10);
  const user = await User.create({ username, password: hashed, role });
  return user;
}

export async function loginUser(username: string, password: string) {
  await connectDB();
  const user = await User.findOne({ username });
  if (!user) return null;
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return null;
  return user;
}
