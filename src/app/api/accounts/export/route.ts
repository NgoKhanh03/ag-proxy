import { NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";

export async function GET() {
  await dbService.connect();
  const accounts = await dbService.account.find({}, {
    email: 1, name: 1, refreshToken: 1, type: 1,
    rotationPriority: 1, rotationEnabled: 1, status: 1,
    _id: 0,
  }).lean();
  return NextResponse.json(accounts);
}
