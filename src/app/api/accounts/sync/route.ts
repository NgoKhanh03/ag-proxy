import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Account } from "@/lib/models/account";
import { refreshAccessToken, syncAccountData } from "@/lib/google-account";

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const { accountId } = await req.json();
    if (!accountId) {
      return NextResponse.json({ error: "accountId is required" }, { status: 400 });
    }
    const account = await Account.findById(accountId);
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    let accessToken = account.accessToken;
    if (account.refreshToken) {
      const refreshed = await refreshAccessToken(account.refreshToken);
      if (refreshed?.access_token) {
        accessToken = refreshed.access_token;
        account.accessToken = accessToken;
      }
    }

    const data = await syncAccountData(accessToken);
    account.tier = data.tier;
    account.projectId = data.projectId;
    if (Object.keys(data.quotas).length > 0) {
      const wasEmpty = Object.values(account.quotas || {}).every((v) => v <= 0);
      const nowHasQuota = Object.values(data.quotas).some((v) => v > 0);
      if (wasEmpty && nowHasQuota) account.tokensUsed = 0;
      account.quotas = data.quotas;
      account.quotaResets = data.quotaResets;
    }
    account.lastSyncAt = new Date();
    await account.save();

    return NextResponse.json({
      tier: data.tier,
      quotas: data.quotas,
      quotaResets: data.quotaResets,
      projectId: data.projectId,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
