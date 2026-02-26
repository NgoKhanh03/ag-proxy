const FALLBACK_ANTIGRAVITY_VERSION = "1.19.5";

let cachedUserAgent: string | null = null;

export function getAntigravityVersion(): string {
  return FALLBACK_ANTIGRAVITY_VERSION;
}

export function getAntigravityUserAgent(): string {
  if (cachedUserAgent) return cachedUserAgent;
  const osName = process.platform === "darwin" ? "darwin" : process.platform === "win32" ? "win32" : "linux";
  cachedUserAgent = `antigravity/${FALLBACK_ANTIGRAVITY_VERSION} ${osName}/${process.arch}`;
  return cachedUserAgent;
}
