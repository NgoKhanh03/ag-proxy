"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Network, Plus, Zap, Sparkles, Bot } from "lucide-react";

const MODEL_LABELS: Record<string, string> = {
  "gemini-3.1-pro-high": "Gemini 3.1 Pro High",
  "gemini-3.1-pro-low": "Gemini 3.1 Pro Low",
  "gemini-3-flash": "Gemini 3 Flash",
  "gemini-2.5-pro": "Gemini 2.5 Pro",
  "gemini-2.5-flash": "Gemini 2.5 Flash",
  "gemini-2.5-flash-lite": "Gemini 2.5 Flash Lite",
  "claude-sonnet-4-6": "Claude Sonnet 4.6",
  "claude-sonnet-4-6-thinking": "Claude Sonnet 4.6 Thinking",
  "claude-opus-4-6-thinking": "Claude Opus 4.6 Thinking",
};

function getModelColor(key: string): string {
  if (key.includes("opus")) return "#c026d3";
  if (key.includes("sonnet")) return "#d97706";
  if (key.includes("claude")) return "#d97706";
  if (key.includes("flash-lite")) return "#06b6d4";
  if (key.includes("flash")) return "#10b981";
  if (key.includes("pro-high")) return "#6366f1";
  if (key.includes("pro-low")) return "#818cf8";
  if (key.includes("pro")) return "#4f46e5";
  return "#6366f1";
}

function getModelIcon(key: string) {
  if (key.startsWith("claude")) return Bot;
  return Sparkles;
}

function QuotaRing({ value, size = 72, strokeWidth = 5, color, label, icon: Icon }: {
  value: number;
  size?: number;
  strokeWidth?: number;
  color: string;
  label: string;
  icon: React.ElementType;
}) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(value, 100) / 100) * circ;
  const center = size / 2;
  const textColor = value <= 20 ? "#ef4444" : value <= 50 ? "#f59e0b" : color;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle
            cx={center} cy={center} r={r}
            fill="none" stroke="currentColor" strokeWidth={strokeWidth}
            className="text-muted/20"
          />
          <circle
            cx={center} cy={center} r={r}
            fill="none" stroke={textColor} strokeWidth={strokeWidth}
            strokeDasharray={circ} strokeDashoffset={offset}
            strokeLinecap="round" transform={`rotate(-90 ${center} ${center})`}
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-sm font-bold" style={{ color: textColor }}>{value}%</span>
        </div>
      </div>
      <div className="flex items-center gap-1 text-center">
        <Icon className="w-3 h-3 shrink-0" style={{ color }} />
        <span className="text-xs text-muted-foreground leading-tight">{label}</span>
      </div>
    </div>
  );
}

interface Account {
  _id: string;
  email: string;
  name: string;
  avatar: string;
  tier: string;
  status: string;
  quotas: Record<string, number>;
  rotationEnabled: boolean;
}

interface Proxy {
  _id: string;
  name: string;
  enabled: boolean;
}

export default function DashboardPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [proxies, setProxies] = useState<Proxy[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/accounts").then((r) => r.json()),
      fetch("/api/proxies").then((r) => r.json()),
    ]).then(([accs, prxs]) => {
      setAccounts(accs);
      setProxies(prxs);
      setShowWizard(accs.length === 0);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-muted-foreground">Loading dashboard...</div>
      </div>
    );
  }

  if (showWizard) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-lg border-border/50 bg-card/80 backdrop-blur-xl shadow-2xl">
          <CardHeader className="text-center space-y-4">
            <div className="mx-auto w-20 h-20 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/25 animate-pulse">
              <Zap className="w-10 h-10 text-white" />
            </div>
            <CardTitle className="text-2xl font-bold">Welcome to AG Proxy</CardTitle>
            <CardDescription className="text-base">
              No accounts configured yet. Add your first Google AI account to start proxying API requests.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 text-sm text-muted-foreground">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold shrink-0 mt-0.5">1</div>
                <div><span className="font-medium text-foreground">Add Google Account</span> — Connect via OAuth or import tokens</div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <div className="w-6 h-6 rounded-full bg-blue-600/20 flex items-center justify-center text-blue-400 text-xs font-bold shrink-0 mt-0.5">2</div>
                <div><span className="font-medium text-foreground">Configure Tunnel</span> — Set up API auth, model routing & rotation</div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <div className="w-6 h-6 rounded-full bg-emerald-600/20 flex items-center justify-center text-emerald-400 text-xs font-bold shrink-0 mt-0.5">3</div>
                <div><span className="font-medium text-foreground">Start Proxying</span> — Use the OpenAI-compatible endpoint</div>
              </div>
            </div>
            <Button
              className="w-full bg-primary text-primary-foreground shadow-lg mt-4"
              onClick={() => router.push("/dashboard/accounts")}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add First Account
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const activeCount = accounts.filter((a) => a.status === "active").length;
  const suspendedCount = accounts.filter((a) => a.status === "suspended").length;
  const rotatingCount = accounts.filter((a) => a.rotationEnabled).length;

  const quotaKeys = [...new Set(accounts.flatMap((a) => Object.keys(a.quotas || {})))].sort();
  const avgQuotas = quotaKeys.map((key) => {
    const active = accounts.filter((a) => a.status === "active" && a.quotas?.[key] !== undefined);
    const vals = active.map((a) => a.quotas[key]);
    const avg = vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : 0;
    return {
      key,
      label: MODEL_LABELS[key] || key,
      value: avg,
      color: getModelColor(key),
      icon: getModelIcon(key),
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Overview of your AI proxy system</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Accounts</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{accounts.length}</div>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs text-emerald-500">{activeCount} active</span>
              {suspendedCount > 0 && <span className="text-xs text-destructive">{suspendedCount} suspended</span>}
              <span className="text-xs text-muted-foreground">{rotatingCount} rotating</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Proxies</CardTitle>
            <Network className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{proxies.length}</div>
            <p className="text-xs text-emerald-500 mt-1">
              {proxies.filter((p) => p.enabled).length} enabled
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Models Available</CardTitle>
            <Sparkles className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{quotaKeys.length}</div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-muted-foreground">
                {quotaKeys.filter((k) => k.startsWith("gemini")).length} Gemini
              </span>
              <span className="text-xs text-muted-foreground">
                {quotaKeys.filter((k) => k.startsWith("claude")).length} Claude
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {avgQuotas.length > 0 ? (
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {avgQuotas.map((q) => {
            const Icon = q.icon;
            return (
              <Card key={q.key} className="border-border/50 bg-card/80 backdrop-blur-sm">
                <CardContent className="pt-5 pb-4 flex flex-col items-center gap-3">
                  <QuotaRing value={q.value} color={q.color} label={q.label} icon={Icon} size={80} strokeWidth={6} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
          <CardContent className="py-12">
            <p className="text-sm text-muted-foreground text-center">No quota data available</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
