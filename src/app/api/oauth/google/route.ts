import { NextResponse } from "next/server";
import { GOOGLE_AUTH_URL, GOOGLE_CLIENT_ID, GOOGLE_SCOPES } from "@/lib/google-oauth";
import { headers } from "next/headers";
import crypto from "crypto";

export async function GET() {
  const headerList = await headers();
  const host = headerList.get("host") || "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const redirectUri = `${protocol}://${host}/api/oauth/google/callback`;
  const state = crypto.randomBytes(16).toString("hex");

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });

  const url = `${GOOGLE_AUTH_URL}?${params.toString()}`;
  return NextResponse.redirect(url);
}
