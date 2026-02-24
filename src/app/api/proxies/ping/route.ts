import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { host, port, protocol, username, password } = await req.json();
    if (!host || !port) {
      return NextResponse.json({ error: "host and port required" }, { status: 400 });
    }
    const auth = username ? `${username}:${password}@` : "";
    const proxyUrl = `${protocol || "http"}://${auth}${host}:${port}`;
    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch("https://httpbin.org/ip", {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const ping = Date.now() - start;
      const data = await res.json().catch(() => ({}));
      return NextResponse.json({
        ok: true,
        ping,
        ip: data.origin || null,
        proxyUrl,
      });
    } catch (e: any) {
      clearTimeout(timeout);
      return NextResponse.json({
        ok: false,
        ping: Date.now() - start,
        error: e.name === "AbortError" ? "Timeout (10s)" : e.message,
        proxyUrl,
      });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
