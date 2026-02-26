import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Account } from "@/lib/models/account";
import { isValidModel } from "@/lib/cloud-code";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ model: string }> }
) {
  const { model } = await params;

  try {
    await connectDB();
    const account = await Account.findOne({ status: "active", rotationEnabled: true }).sort({ rotationPriority: -1 });
    if (account?.accessToken) {
      const valid = await isValidModel(model, account.accessToken);
      if (!valid) {
        return NextResponse.json(
          { error: { message: `Model '${model}' not found`, type: "invalid_request_error" } },
          { status: 404 }
        );
      }
    }
  } catch {
    // pass
  }

  return NextResponse.json({
    id: model,
    object: "model",
    created: Math.floor(Date.now() / 1000),
    owned_by: "anthropic",
  });
}
