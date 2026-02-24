import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Account } from "@/lib/models/account";
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_TOKEN_URL } from "@/lib/google-oauth";

async function refreshAccessToken(token: string) {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: token,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) return null;
  return res.json();
}

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
    const refreshed = await refreshAccessToken(account.refreshToken);
    if (refreshed?.access_token) {
      accessToken = refreshed.access_token;
      account.accessToken = accessToken;
      await account.save();
    }

    return NextResponse.json({
      accessToken,
      refreshToken: account.refreshToken,
      expiryTimestamp: Math.floor(Date.now() / 1000) + 3600,
      email: account.email,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
