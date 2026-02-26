import { NextRequest, NextResponse } from "next/server";
import { dbService } from "@/lib/db-service";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const items = Array.isArray(body) ? body : body.proxies;
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Expected an array of proxies" }, { status: 400 });
    }
    await dbService.connect();
    let created = 0;
    let skipped = 0;
    for (const item of items) {
      if (!item.host || !item.port) {
        skipped++;
        continue;
      }
      const exists = await dbService.proxy.findOne({ host: item.host, port: item.port });
      if (exists) {
        skipped++;
        continue;
      }
      await dbService.proxy.create({
        name: item.name || `${item.host}:${item.port}`,
        host: item.host,
        port: parseInt(item.port) || 8080,
        protocol: item.protocol || "http",
        username: item.username || "",
        password: item.password || "",
        enabled: true,
      });
      created++;
    }
    return NextResponse.json({ created, skipped });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Import failed" }, { status: 500 });
  }
}
