import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Account } from "@/lib/models/account";

export async function GET() {
  await connectDB();
  const accounts = await Account.find({}, {
    email: 1, name: 1, refreshToken: 1, type: 1,
    rotationPriority: 1, rotationEnabled: 1, status: 1,
    _id: 0,
  }).lean();
  return NextResponse.json(accounts);
}
