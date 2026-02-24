import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const secret = new TextEncoder().encode(process.env.JWT_SECRET || "fallback-secret-change-me");

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/dashboard") || pathname.startsWith("/api/accounts") || pathname.startsWith("/api/proxies") || pathname.startsWith("/api/tunnel") || pathname.startsWith("/api/users")) {
    const token = request.cookies.get("session")?.value;
    if (!token) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.redirect(new URL("/login", request.url));
    }
    try {
      await jwtVerify(token, secret);
    } catch {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Invalid session" }, { status: 401 });
      }
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/accounts/:path*", "/api/proxies/:path*", "/api/tunnel/:path*", "/api/tunnels/:path*", "/api/users/:path*"],
};
