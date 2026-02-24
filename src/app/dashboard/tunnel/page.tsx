"use client";

import { useEffect, useState, useCallback } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Plus, MoreHorizontal, Pencil, Trash2, RefreshCw, Copy, Key, Shuffle, Play, Loader2 } from "lucide-react";
import { toast } from "sonner";

const AVAILABLE_MODELS = [
  { value: "gemini-3.1-pro-high", label: "Gemini 3.1 Pro High" },
  { value: "gemini-3.1-pro-low", label: "Gemini 3.1 Pro Low" },
  { value: "gemini-3-flash", label: "Gemini 3 Flash" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { value: "claude-sonnet-4-6-thinking", label: "Claude Sonnet 4.6 TK" },
  { value: "claude-opus-4-6-thinking", label: "Claude Opus 4.6 TK" },
];

interface Account {
  _id: string;
  email: string;
  name: string;
  avatar: string;
  tier: string;
}

interface Tunnel {
  _id: string;
  name: string;
  model: string;
  apiKey: string;
  tokenLimit: number;
  tokensUsed: number;
  accountMode: string;
  tiedAccountId: Account | string | null;
  enabled: boolean;
  createdAt: string;
}

const emptyForm = {
  name: "",
  model: "gemini-2.5-flash",
  apiKey: "",
  tokenLimit: 0,
  accountMode: "pool",
  tiedAccountId: null as string | null,
  enabled: true,
};

function formatTokens(n: number) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}



export default function TunnelsPage() {
  const [tunnels, setTunnels] = useState<Tunnel[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [testOpen, setTestOpen] = useState(false);
  const [testTunnel, setTestTunnel] = useState<Tunnel | null>(null);
  const [testPrompt, setTestPrompt] = useState("Hello, how are you?");
  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(null);
  const [testLoading, setTestLoading] = useState(false);

  const fetchData = useCallback(async () => {
    const [data, accs] = await Promise.all([
      fetch("/api/tunnels").then((r) => r.json()),
      fetch("/api/accounts").then((r) => r.json()),
    ]);
    setTunnels(data);
    setAccounts(accs);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(t: Tunnel) {
    setEditingId(t._id);
    setForm({
      name: t.name,
      model: t.model,
      apiKey: t.apiKey,
      tokenLimit: t.tokenLimit,
      accountMode: t.accountMode || "pool",
      tiedAccountId: typeof t.tiedAccountId === "object" && t.tiedAccountId ? (t.tiedAccountId as Account)._id : (t.tiedAccountId as string | null),
      enabled: t.enabled,
    });
    setDialogOpen(true);
  }

  function generateKey() {
    const hex = Array.from(crypto.getRandomValues(new Uint8Array(24)))
      .map((b) => b.toString(16).padStart(2, "0")).join("");
    setForm({ ...form, apiKey: `sk-${hex}` });
  }

  async function handleSave() {
    if (!form.name.trim() || !form.model) {
      toast.error("Name and model are required");
      return;
    }
    const payload = { ...form };
    if (!payload.apiKey) delete (payload as Record<string, unknown>).apiKey;
    try {
      if (editingId) {
        const res = await fetch(`/api/tunnels/${editingId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (res.status === 409) { toast.error("API key already exists"); return; }
        toast.success("Tunnel updated");
      } else {
        const res = await fetch("/api/tunnels", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (res.status === 409) { toast.error("API key already exists"); return; }
        toast.success("Tunnel created");
      }
      setDialogOpen(false);
      fetchData();
    } catch {
      toast.error("Failed to save");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this tunnel?")) return;
    await fetch(`/api/tunnels/${id}`, { method: "DELETE" });
    toast.success("Tunnel deleted");
    fetchData();
  }

  async function toggleEnabled(t: Tunnel) {
    await fetch(`/api/tunnels/${t._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !t.enabled }),
    });
    fetchData();
  }

  async function resetUsage(id: string) {
    await fetch(`/api/tunnels/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tokensUsed: 0 }),
    });
    toast.success("Usage reset");
    fetchData();
  }


  function openTest(t: Tunnel) {
    setTestTunnel(t);
    setTestResult(null);
    setTestPrompt("Hello, how are you?");
    setTestOpen(true);
  }

  async function runTest() {
    if (!testTunnel) return;
    setTestLoading(true);
    setTestResult(null);
    try {
      const res = await fetch("/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${testTunnel.apiKey}`,
        },
        body: JSON.stringify({ messages: [{ role: "user", content: testPrompt }] }),
      });
      const data = await res.json();
      setTestResult(data);
      if (data.error) {
        toast.error(data.error.message || "Test failed");
      } else {
        toast.success("Test successful");
        fetchData();
      }
    } catch {
      setTestResult({ error: { message: "Network error" } });
      toast.error("Network error");
    } finally {
      setTestLoading(false);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-pulse text-muted-foreground">Loading...</div></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tunnels</h1>
          <p className="text-muted-foreground mt-1">Manage API tunnels with per-key token limits</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={fetchData}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate} className="bg-primary text-primary-foreground">
                <Plus className="mr-2 h-4 w-4" />
                Create Tunnel
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editingId ? "Edit Tunnel" : "Create Tunnel"}</DialogTitle>
                <DialogDescription>
                  {editingId ? "Update tunnel settings" : "Create a new API tunnel with its own key and token limit"}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Production, Dev Team" />
                </div>
                <div className="space-y-2">
                  <Label>Model</Label>
                  <Select value={form.model} onValueChange={(v) => setForm({ ...form, model: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {AVAILABLE_MODELS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>API Key</Label>
                  <div className="flex gap-2">
                    <Input value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder="Leave empty to auto-generate" className="font-mono text-sm" />
                    <Button variant="outline" size="icon" onClick={generateKey} title="Generate random key">
                      <Shuffle className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Must be unique. Leave empty to auto-generate on save.</p>
                </div>
                <div className="space-y-2">
                  <Label>Account Mode</Label>
                  <Select value={form.accountMode} onValueChange={(v) => setForm({ ...form, accountMode: v, tiedAccountId: v === "pool" ? null : form.tiedAccountId })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pool">Account Pool</SelectItem>
                      <SelectItem value="tied">Tied Account</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{form.accountMode === "pool" ? "Auto-select best account from pool" : "Always use a specific account"}</p>
                </div>
                {form.accountMode === "tied" && (
                  <div className="space-y-2">
                    <Label>Account</Label>
                    <Select value={form.tiedAccountId || ""} onValueChange={(v) => setForm({ ...form, tiedAccountId: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select account" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((a) => {
                          const tierLabel = a.tier ? a.tier.replace(/^g1-/i, "").replace(/-tier$/i, "") : "";
                          return (
                            <SelectItem key={a._id} value={a._id} textValue={a.email}>
                              <div className="flex items-center gap-3">
                                {a.avatar ? (
                                  <img src={a.avatar} alt="" className="w-8 h-8 rounded-full shrink-0" referrerPolicy="no-referrer" />
                                ) : (
                                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium shrink-0">
                                    {(a.name || a.email)[0].toUpperCase()}
                                  </div>
                                )}
                                <div className="flex flex-col min-w-0">
                                  <span className="text-sm font-medium truncate">{a.name || a.email.split("@")[0]}</span>
                                  <div className="flex items-center gap-1.5">
                                    {tierLabel && tierLabel !== "free" && (
                                      <span className={`text-[10px] font-semibold uppercase px-1 rounded ${tierLabel.includes("ultra") ? "bg-amber-500/20 text-amber-500" : "bg-primary/20 text-primary"
                                        }`}>{tierLabel}</span>
                                    )}
                                    <span className="text-xs text-muted-foreground truncate">{a.email}</span>
                                  </div>
                                </div>
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Token Limit</Label>
                  <Input type="number" value={form.tokenLimit} onChange={(e) => setForm({ ...form, tokenLimit: parseInt(e.target.value) || 0 })} />
                  <p className="text-xs text-muted-foreground">{form.tokenLimit === 0 ? "Unlimited" : `${formatTokens(form.tokenLimit)} tokens`}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
                  <Label>Enabled</Label>
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
          <CardTitle>Active Tunnels</CardTitle>
          <CardDescription>{tunnels.length} tunnel{tunnels.length !== 1 ? "s" : ""} configured</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>API Key</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Usage</TableHead>

                <TableHead>Enabled</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tunnels.map((t) => {
                const pct = t.tokenLimit > 0 ? Math.min(100, (t.tokensUsed / t.tokenLimit) * 100) : 0;

                return (
                  <TableRow key={t._id}>
                    <TableCell>
                      <p className="font-medium">{t.name}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">
                        {AVAILABLE_MODELS.find((m) => m.value === t.model)?.label || t.model}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono max-w-[140px] truncate">{t.apiKey}</code>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { navigator.clipboard.writeText(t.apiKey); toast.success("Copied"); }}>
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      {t.accountMode === "tied" && t.tiedAccountId ? (
                        <div className="flex items-center gap-2">
                          {typeof t.tiedAccountId === "object" && (t.tiedAccountId as Account).avatar ? (
                            <img src={(t.tiedAccountId as Account).avatar} alt="" className="w-5 h-5 rounded-full" referrerPolicy="no-referrer" />
                          ) : null}
                          <span className="text-xs truncate max-w-[100px]">{typeof t.tiedAccountId === "object" ? ((t.tiedAccountId as Account).name || (t.tiedAccountId as Account).email) : "Tied"}</span>
                        </div>
                      ) : (
                        <Badge variant="secondary" className="text-xs">Pool</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="w-32 space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{formatTokens(t.tokensUsed)}</span>
                          <span className="font-medium">{t.tokenLimit === 0 ? "∞" : formatTokens(t.tokenLimit)}</span>
                        </div>
                        <Progress value={pct} className="h-1.5" />
                      </div>
                    </TableCell>

                    <TableCell>
                      <Switch checked={t.enabled} onCheckedChange={() => toggleEnabled(t)} />
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openTest(t)}>
                            <Play className="mr-2 h-4 w-4" />Test
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openEdit(t)}>
                            <Pencil className="mr-2 h-4 w-4" />Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => resetUsage(t._id)}>
                            <RefreshCw className="mr-2 h-4 w-4" />Reset Usage
                          </DropdownMenuItem>

                          <DropdownMenuItem onClick={() => handleDelete(t._id)} className="text-destructive">
                            <Trash2 className="mr-2 h-4 w-4" />Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
              {tunnels.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    No tunnels yet. Click &quot;Create Tunnel&quot; to get started.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>


      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Test Tunnel: {testTunnel?.name}</DialogTitle>
            <DialogDescription>
              Send a test message through {AVAILABLE_MODELS.find((m) => m.value === testTunnel?.model)?.label || testTunnel?.model}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Prompt</Label>
              <Textarea value={testPrompt} onChange={(e) => setTestPrompt(e.target.value)} rows={3} placeholder="Type your message..." />
            </div>
            <Button onClick={runTest} disabled={testLoading || !testPrompt.trim()} className="w-full bg-primary text-primary-foreground">
              {testLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending...</> : <><Play className="mr-2 h-4 w-4" />Send Test</>}
            </Button>
            {testResult && (
              <div className="space-y-2">
                {testResult.error ? (
                  <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                    <p className="text-sm font-medium text-destructive">Error</p>
                    <p className="text-xs text-destructive/80 mt-1">{(testResult.error as Record<string, string>).message}</p>
                  </div>
                ) : (
                  <>
                    <div className="bg-muted/50 rounded-lg p-3 max-h-48 overflow-y-auto">
                      <p className="text-sm whitespace-pre-wrap">{(testResult.choices as Array<Record<string, Record<string, string>>>)?.[0]?.message?.content || "No content"}</p>
                    </div>
                    {testResult.usage && (
                      <div className="flex gap-3 text-xs text-muted-foreground">
                        <span>Prompt: <strong className="text-foreground">{(testResult.usage as Record<string, number>).prompt_tokens}</strong></span>
                        <span>Completion: <strong className="text-foreground">{(testResult.usage as Record<string, number>).completion_tokens}</strong></span>
                        <span>Total: <strong className="text-foreground">{(testResult.usage as Record<string, number>).total_tokens}</strong></span>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
