/**
 * Next.js Instrumentation Hook
 * Chạy một lần duy nhất khi server khởi động (Node.js runtime).
 * Dùng để khởi động background token refresher.
 *
 * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
    // Chỉ chạy trong Node.js runtime (server-side), không chạy trên Edge
    if (process.env.NEXT_RUNTIME === "nodejs") {
        const { startBackgroundTokenRefresher } = await import("./lib/token-refresher");
        startBackgroundTokenRefresher();
    }
}
