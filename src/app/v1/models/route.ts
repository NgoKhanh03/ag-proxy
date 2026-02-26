import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Account } from "@/lib/models/account";
import { listModels } from "@/lib/cloud-code";

export async function GET() {
  try {
    await connectDB();
    const account = await Account.findOne({ status: "active", rotationEnabled: true }).sort({ rotationPriority: -1 });
    if (!account?.accessToken) {
      return NextResponse.json({ object: "list", data: [] });
    }
    const models = await listModels(account.accessToken);
    return NextResponse.json(models);
  } catch {
    return NextResponse.json({ object: "list", data: [] });
  }
}
