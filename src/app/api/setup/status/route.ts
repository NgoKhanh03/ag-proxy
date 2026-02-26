import { NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";
import { hasAnyUsers } from "@/lib/auth";

export async function GET() {
  await dbService.connect();
  const hasUsers = await hasAnyUsers();
  const accountCount = await dbService.account.countDocuments();
  return NextResponse.json({ needsSetup: !hasUsers, hasAccounts: accountCount > 0 });
}
