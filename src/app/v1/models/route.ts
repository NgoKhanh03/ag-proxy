import { NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";
import { listModels } from "@/lib/cloud-code";

export async function GET() {
  try {
    await dbService.connect();
    const account = await dbService.account.findOne({ status: "active", rotationEnabled: true }).sort({ rotationPriority: -1 });
    if (!account?.accessToken) {
      return NextResponse.json({ object: "list", data: [] });
    }
    const models = await listModels(account.accessToken);
    return NextResponse.json(models);
  } catch {
    return NextResponse.json({ object: "list", data: [] });
  }
}
