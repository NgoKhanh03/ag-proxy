import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Account } from "@/lib/models/account";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const items = Array.isArray(body) ? body : body.accounts;
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Expected an array of accounts" }, { status: 400 });
    }
    await connectDB();
    let created = 0;
    let skipped = 0;
    const errors: string[] = [];
    for (const item of items) {
      if (!item.email || !item.refreshToken) {
        errors.push(`Missing email or refreshToken`);
        skipped++;
        continue;
      }
      const exists = await Account.findOne({ email: item.email });
      if (exists) {
        skipped++;
        continue;
      }
      await Account.create({
        email: item.email,
        name: item.name || "",
        refreshToken: item.refreshToken,
        type: item.type || "google",
        rotationPriority: item.rotationPriority ?? 0,
        rotationEnabled: item.rotationEnabled ?? true,
        status: item.status || "active",
      });
      created++;
    }
    return NextResponse.json({ created, skipped, errors });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Import failed" }, { status: 500 });
  }
}
