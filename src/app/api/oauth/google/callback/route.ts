import { NextRequest, NextResponse } from "next/server";
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_TOKEN_URL, GOOGLE_USERINFO_URL } from "@/lib/google-oauth";
import { syncAccountData } from "@/lib/google-account";
import { headers } from "next/headers";
import { connectDB } from "@/lib/db";
import { Account } from "@/lib/models/account";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(new URL("/dashboard/accounts?error=oauth_denied", request.url));
  }

  const headerList = await headers();
  const host = headerList.get("host") || "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const redirectUri = `${protocol}://${host}/api/oauth/google/callback`;

  try {
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("Token exchange failed:", errText);
      return NextResponse.redirect(new URL("/dashboard/accounts?error=token_exchange", request.url));
    }

    const tokens = await tokenRes.json();

    const userRes = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userRes.ok) {
      return NextResponse.redirect(new URL("/dashboard/accounts?error=userinfo", request.url));
    }

    const userInfo = await userRes.json();
    const accountData = await syncAccountData(tokens.access_token);

    await connectDB();

    const existing = await Account.findOne({ email: userInfo.email });
    if (existing) {
      existing.accessToken = tokens.access_token;
      if (tokens.refresh_token) existing.refreshToken = tokens.refresh_token;
      if (userInfo.picture) existing.avatar = userInfo.picture;
      existing.status = "active";
      existing.tier = accountData.tier;
      existing.projectId = accountData.projectId;
      if (Object.keys(accountData.quotas).length > 0) {
        existing.quotas = accountData.quotas;
        existing.quotaResets = accountData.quotaResets;
      }
      existing.lastSyncAt = new Date();
      await existing.save();
    } else {
      await Account.create({
        email: userInfo.email,
        name: userInfo.name || userInfo.email,
        avatar: userInfo.picture || "",
        type: "google",
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || "",
        tier: accountData.tier,
        projectId: accountData.projectId,
        quotas: Object.keys(accountData.quotas).length > 0 ? accountData.quotas : undefined,
        quotaResets: Object.keys(accountData.quotaResets).length > 0 ? accountData.quotaResets : undefined,
        status: "active",
        lastSyncAt: new Date(),
      });
    }

    return NextResponse.redirect(new URL("/dashboard/accounts?success=1", request.url));
  } catch (err) {
    console.error("OAuth callback error:", err);
    return NextResponse.redirect(new URL("/dashboard/accounts?error=unknown", request.url));
  }
}
