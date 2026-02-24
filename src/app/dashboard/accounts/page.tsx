"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, MoreHorizontal, Pencil, Trash2, RefreshCw, RotateCw, Chrome, Sparkles, Bot, ArrowLeftRight } from "lucide-react";
import { toast } from "sonner";

const MODEL_LABELS: Record<string, string> = {
  "gemini-3.1-pro-high": "G3.1 Pro High",
  "gemini-3.1-pro-low": "G3.1 Pro Low",
  "gemini-3-flash": "G3 Flash",
  "gemini-2.5-pro": "G2.5 Pro",
  "gemini-2.5-flash": "G2.5 Flash",
  "gemini-2.5-flash-lite": "G2.5 Flash Lite",
  "claude-sonnet-4-6": "Sonnet 4.6",
  "claude-sonnet-4-6-thinking": "Sonnet 4.6 TK",
  "claude-opus-4-6-thinking": "Opus 4.6 TK",
};

const PROVIDERS = [
  { id: "gemini", label: "Gemini", icon: Sparkles, color: "#4285f4", prefix: "gemini-" },
  { id: "claude", label: "Claude", icon: Bot, color: "#d97706", prefix: "claude-" },
];

function getProviderModels(quotas: Record<string, number>, resets: Record<string, string>, prefix: string) {
  return Object.entries(quotas)
    .filter(([k]) => k.startsWith(prefix))
    .map(([k, v]) => ({ id: k, label: MODEL_LABELS[k] || k, value: v, resetTime: resets?.[k] || null }));
}

function getProviderMin(quotas: Record<string, number>, prefix: string) {
  const vals = Object.entries(quotas).filter(([k]) => k.startsWith(prefix)).map(([, v]) => v);
  return vals.length ? Math.min(...vals) : 100;
}

function CircularQuota({ value, color, icon: Icon }: { value: number; color: string; icon: React.ElementType }) {
  const r = 16;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  return (
    <svg width="40" height="40" viewBox="0 0 40 40">
      <circle cx="20" cy="20" r={r} fill="none" stroke="currentColor" strokeWidth="3" className="text-muted/30" />
      <circle
        cx="20" cy="20" r={r} fill="none" stroke={color} strokeWidth="3"
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" transform="rotate(-90 20 20)"
        className="transition-all duration-500"
      />
      <foreignObject x="10" y="10" width="20" height="20">
        <div className="flex items-center justify-center w-full h-full">
          <Icon className="w-3 h-3" style={{ color }} />
        </div>
      </foreignObject>
    </svg>
  );
}

function formatResetTime(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "Refilling...";
  const min = Math.floor(diff / 60000);
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0 || parts.length === 0) parts.push(`${m}m`);
  return `Refills in ${parts.join(" ")}`;
}

function QuotaCell({ quotas, quotaResets }: { quotas: Record<string, number>; quotaResets?: Record<string, string> }) {
  return (
    <TooltipProvider>
      <div className="flex items-center gap-1">
        {PROVIDERS.map((p) => {
          const models = getProviderModels(quotas, quotaResets || {}, p.prefix);
          if (models.length === 0) return null;
          const min = getProviderMin(quotas, p.prefix);
          return (
            <Popover key={p.id}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <button className="cursor-pointer hover:scale-110 transition-transform">
                      <CircularQuota value={min} color={p.color} icon={p.icon} />
                    </button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{p.label}</p>
                </TooltipContent>
              </Tooltip>
              <PopoverContent className="w-56 p-3" side="bottom">
                <p className="text-sm font-semibold mb-2">{p.label} Models</p>
                <div className="space-y-2">
                  {models.map((m) => (
                    <div key={m.id}>
                      <div className="flex items-center justify-between text-xs mb-0.5">
                        <span className="text-muted-foreground">{m.label}</span>
                        <span className="font-medium" style={{ color: m.value > 20 ? undefined : "#ef4444" }}>{m.value}%</span>
                      </div>
                      <Progress value={m.value} className="h-1.5" />
                      {m.resetTime && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">{formatResetTime(m.resetTime)}</p>
                      )}
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

interface Proxy {
  _id: string;
  name: string;
}

interface Account {
  _id: string;
  email: string;
  name: string;
  avatar: string;
  tier: string;
  type: string;
  status: string;
  accessToken: string;
  refreshToken: string;
  quotas: Record<string, number>;
  quotaResets: Record<string, string>;
  rotationPriority: number;
  rotationEnabled: boolean;
  proxyId: Proxy | null;
  lastSyncAt: string;
}

const emptyAccount = {
  email: "",
  name: "",
  type: "google",
  accessToken: "",
  refreshToken: "",
  quotas: {} as Record<string, number>,
  rotationPriority: 0,
  rotationEnabled: true,
  proxyId: null as string | null,
  status: "active",
};

function AccountsContent() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [proxies, setProxies] = useState<Proxy[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyAccount);

  const fetchData = useCallback(async () => {
    const [accs, prxs] = await Promise.all([
      fetch("/api/accounts").then((r) => r.json()),
      fetch("/api/proxies").then((r) => r.json()),
    ]);
    setAccounts(accs);
    setProxies(prxs);
    setLoading(false);
  }, []);

  const searchParams = useSearchParams();

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (searchParams.get("success") === "1") toast.success("Google account added successfully");
    if (searchParams.get("error")) toast.error(`OAuth failed: ${searchParams.get("error")}`);
  }, [searchParams]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyAccount);
    setDialogOpen(true);
  }

  function openEdit(acc: Account) {
    setEditingId(acc._id);
    setForm({
      email: acc.email,
      name: acc.name,
      type: acc.type,
      accessToken: acc.accessToken,
      refreshToken: acc.refreshToken,
      quotas: { ...acc.quotas },
      rotationPriority: acc.rotationPriority,
      rotationEnabled: acc.rotationEnabled,
      proxyId: acc.proxyId?._id || null,
      status: acc.status,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    const { quotas: _q, ...rest } = form;
    const payload = { ...rest, proxyId: rest.proxyId || null };
    try {
      if (editingId) {
        await fetch(`/api/accounts/${editingId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        toast.success("Account updated");
      } else {
        await fetch("/api/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        toast.success("Account added");
      }
      setDialogOpen(false);
      fetchData();
    } catch {
      toast.error("Failed to save");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this account?")) return;
    await fetch(`/api/accounts/${id}`, { method: "DELETE" });
    toast.success("Account deleted");
    fetchData();
  }

  async function toggleRotation(acc: Account) {
    await fetch(`/api/accounts/${acc._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rotationEnabled: !acc.rotationEnabled }),
    });
    fetchData();
  }

  async function handleSwitch(id: string) {
    try {
      toast.loading("Switching account...", { id: "switch" });
      const res = await fetch("/api/accounts/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: id }),
      });
      const payload = await res.json();
      if (!res.ok) {
        toast.error(payload.error || "Failed to prepare switch", { id: "switch" });
        return;
      }
      const extRes = await fetch("http://127.0.0.1:23816/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => null);
      if (!extRes || !extRes.ok) {
        toast.error("AG Switch extension is not running. Install and enable it in Antigravity.", { id: "switch" });
        return;
      }
      const result = await extRes.json();
      toast.success(result.message || "Account switched!", { id: "switch" });
    } catch {
      toast.error("Failed to connect", { id: "switch" });
    }
  }

  async function handleSync(id: string) {
    try {
      toast.loading("Syncing account...", { id: "sync" });
      const res = await fetch("/api/accounts/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: id }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Synced: ${data.tier} tier`, { id: "sync" });
        fetchData();
      } else {
        toast.error(data.error || "Sync failed", { id: "sync" });
      }
    } catch {
      toast.error("Failed to sync", { id: "sync" });
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-pulse text-muted-foreground">Loading...</div></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Accounts</h1>
          <p className="text-muted-foreground mt-1">Manage connected Google AI accounts</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={fetchData}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={() => window.location.href = "/api/oauth/google"}>
            <Chrome className="mr-2 h-4 w-4" />
            Sign in with Google
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Edit Account</DialogTitle>
                <DialogDescription>Update account settings</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="user@gmail.com" />
                  </div>
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="My Account" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="google">Google</SelectItem>
                        <SelectItem value="anthropic">Anthropic</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="suspended">Suspended</SelectItem>
                        <SelectItem value="expired">Expired</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Access Token</Label>
                  <Input value={form.accessToken} onChange={(e) => setForm({ ...form, accessToken: e.target.value })} placeholder="Paste access token" />
                </div>
                <div className="space-y-2">
                  <Label>Refresh Token</Label>
                  <Input value={form.refreshToken} onChange={(e) => setForm({ ...form, refreshToken: e.target.value })} placeholder="Paste refresh token" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Proxy</Label>
                    <Select value={form.proxyId || "none"} onValueChange={(v) => setForm({ ...form, proxyId: v === "none" ? null : v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No proxy</SelectItem>
                        {proxies.map((p) => (
                          <SelectItem key={p._id} value={p._id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Rotation Priority</Label>
                    <Input type="number" value={form.rotationPriority} onChange={(e) => setForm({ ...form, rotationPriority: parseInt(e.target.value) || 0 })} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={form.rotationEnabled} onCheckedChange={(v) => setForm({ ...form, rotationEnabled: v })} />
                  <Label>Enable rotation</Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleSave} className="bg-primary text-primary-foreground">Save</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
        <CardHeader>
          <CardTitle>Connected Accounts</CardTitle>
          <CardDescription>{accounts.length} account{accounts.length !== 1 ? "s" : ""} configured</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Quotas</TableHead>
                <TableHead>Proxy</TableHead>
                <TableHead>Rotation</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((acc) => (
                <TableRow key={acc._id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {acc.avatar ? (
                        <img src={acc.avatar} alt="" className="w-8 h-8 rounded-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold">
                          {acc.email.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="font-medium">{acc.name || acc.email}</p>
                        <p className="text-xs text-muted-foreground">{acc.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-xs capitalize ${acc.tier === "ultra" ? "border-amber-500/50 text-amber-500 bg-amber-500/10" :
                      acc.tier === "pro" ? "border-primary/50 text-primary bg-primary/10" :
                        "border-muted-foreground/30"
                      }`}>{acc.tier || "free"}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={acc.status === "active" ? "default" : "destructive"} className="text-xs">
                      {acc.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <QuotaCell quotas={acc.quotas} quotaResets={acc.quotaResets} />
                  </TableCell>
                  <TableCell>
                    {acc.proxyId ? (
                      <Badge variant="secondary">{(acc.proxyId as Proxy).name}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Direct</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch checked={acc.rotationEnabled} onCheckedChange={() => toggleRotation(acc)} />
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleSync(acc._id)}>
                          <RotateCw className="mr-2 h-4 w-4" />Sync
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleSwitch(acc._id)}>
                          <ArrowLeftRight className="mr-2 h-4 w-4" />Switch To
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openEdit(acc)}>
                          <Pencil className="mr-2 h-4 w-4" />Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDelete(acc._id)} className="text-destructive">
                          <Trash2 className="mr-2 h-4 w-4" />Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {accounts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    No accounts yet. Click &quot;Add Account&quot; to get started.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AccountsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="animate-pulse text-muted-foreground">Loading...</div></div>}>
      <AccountsContent />
    </Suspense>
  );
}
