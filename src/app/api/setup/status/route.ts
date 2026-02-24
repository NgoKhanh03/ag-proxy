import { NextResponse } from "next/server";
import { hasAnyUsers } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { Account } from "@/lib/models/account";

export async function GET() {
  await connectDB();
  const hasUsers = await hasAnyUsers();
  const accountCount = await Account.countDocuments();
  return NextResponse.json({ needsSetup: !hasUsers, hasAccounts: accountCount > 0 });
}
