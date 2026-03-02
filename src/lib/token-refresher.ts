/**
 * Background Token Refresher
 *
 * - Proactive refresh token cho tất cả active accounts
 * - Random jitter 15–35 phút để tránh Google detect bot
 * - Dùng getValidAccessToken() của upstream (đã có mutex bên trong)
 * - Delay ngẫu nhiên 2–8 giây giữa mỗi account để tránh burst
 */

// ============================================================
// Background refresher (chạy 1 lần duy nhất trong process)
// ============================================================

let backgroundRefresherStarted = false;

/** Trả về số ms ngẫu nhiên trong khoảng [minMin, maxMin] phút */
function randomDelayMs(minMin: number, maxMin: number): number {
    const minMs = minMin * 60 * 1000;
    const maxMs = maxMin * 60 * 1000;
    return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

/**
 * Khởi động background refresher.
 * Chỉ chạy 1 lần duy nhất trong lifetime của process.
 *
 * - Lần đầu: delay 30–90 giây sau khi server start
 * - Sau mỗi chu kỳ: chờ ngẫu nhiên 15–35 phút
 */
export function startBackgroundTokenRefresher() {
    if (backgroundRefresherStarted) return;
    backgroundRefresherStarted = true;

    console.log("[Refresher] 🚀 Background token refresher đã khởi động");

    async function scheduleNextRun() {
        const delayMs = randomDelayMs(15, 35);
        const delayMin = Math.round(delayMs / 60000);
        console.log(`[Refresher] ⏳ Chu kỳ tiếp theo sau ${delayMin} phút`);

        setTimeout(async () => {
            await runRefreshCycle();
            scheduleNextRun();
        }, delayMs);
    }

    // Lần đầu: delay ngắn để tránh chạy ngay khi server vừa boot
    const initialDelay = randomDelayMs(0.5, 1.5);
    console.log(`[Refresher] ⏳ Lần đầu chạy sau ${Math.round(initialDelay / 1000)}s`);
    setTimeout(async () => {
        await runRefreshCycle();
        scheduleNextRun();
    }, initialDelay);
}

/**
 * 1 chu kỳ refresh: duyệt tất cả active accounts có token sắp hết hạn (< 20 phút).
 * Dùng getValidAccessToken() của upstream — đã có mutex bên trong.
 */
async function runRefreshCycle() {
    console.log("\n[Refresher] 🔄 Bắt đầu chu kỳ refresh proactive...");

    const { connectDB } = await import("./db");
    const { Account } = await import("./models/account");
    const { getValidAccessToken } = await import("./google-account");

    try {
        await connectDB();

        const now = new Date();
        // Refresh nếu token còn < 20 phút
        const threshold = new Date(now.getTime() + 20 * 60 * 1000);

        const accounts = await Account.find({
            status: "active",
            refreshToken: { $exists: true, $ne: "" },
            $or: [
                { tokenExpiresAt: { $lt: threshold } }, // sắp hết hoặc đã hết
                { tokenExpiresAt: new Date(0) },        // chưa có (default)
                { tokenExpiresAt: null },
            ],
        });

        if (accounts.length === 0) {
            console.log("[Refresher] ✅ Không có account nào cần refresh");
            return;
        }

        console.log(`[Refresher] 📋 ${accounts.length} account(s) cần refresh`);

        for (const account of accounts) {
            const expiresAt = account.tokenExpiresAt;
            const remainingMs = expiresAt ? expiresAt.getTime() - now.getTime() : -1;
            const remainingMin = Math.round(remainingMs / 60000);

            console.log(
                `[Refresher] 🔑 ${account.email} — ${remainingMs <= 0 ? "ĐÃ HẾT HẠN" : `còn ${remainingMin} phút`
                }`
            );

            try {
                // Force refresh bằng cách set tokenExpiresAt = 0 trong object tạm
                // getValidAccessToken() đã có mutex nên an toàn khi gọi concurrent
                const accountObj = account.toObject();
                await getValidAccessToken({
                    ...accountObj,
                    accessToken: "",          // force refresh
                    tokenExpiresAt: new Date(0),
                });
                console.log(`[Refresher] ✅ ${account.email} — refresh thành công`);
            } catch (err: any) {
                console.log(`[Refresher] ❌ ${account.email} — lỗi: ${err.message}`);
            }

            // Delay ngẫu nhiên 2–8 giây giữa mỗi account
            const jitter = Math.floor(Math.random() * 6000) + 2000;
            await new Promise((r) => setTimeout(r, jitter));
        }

        console.log("[Refresher] ✅ Chu kỳ hoàn tất\n");
    } catch (err: any) {
        console.log(`[Refresher] ❌ Lỗi chu kỳ: ${err.message}`);
    }
}
