"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { TablePagination, usePagination } from "@/components/ui/table-pagination";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, MoreHorizontal, Pencil, Trash2, Upload, Wifi, WifiOff, GripVertical, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";

interface Proxy {
  _id: string;
  name: string;
  host: string;
  port: number;
  protocol: string;
  username: string;
  password: string;
  enabled: boolean;
  createdAt: string;
}

const emptyProxy = {
  name: "",
  host: "",
  port: 8080,
  protocol: "http",
  username: "",
  password: "",
  enabled: true,
};

const ALL_COLUMNS = ["host", "port", "username", "password", "protocol", "name"] as const;
type ColumnId = typeof ALL_COLUMNS[number];

const COLUMN_LABELS: Record<ColumnId, string> = {
  host: "Host",
  port: "Port",
  username: "Username",
  password: "Password",
  protocol: "Protocol",
  name: "Name",
};

function detectDelimiter(text: string): string {
  const firstLine = text.split("\n")[0] || "";
  const counts: Record<string, number> = { ":": 0, ",": 0, "\t": 0, ";": 0, "|": 0 };
  for (const ch of Object.keys(counts)) {
    counts[ch] = (firstLine.match(new RegExp(ch === "|" ? "\\|" : ch, "g")) || []).length;
  }
  let best = ":";
  let max = 0;
  for (const [ch, n] of Object.entries(counts)) {
    if (n > max) { max = n; best = ch; }
  }
  return best;
}

function parseLines(text: string, delimiter: string): string[][] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => l.split(delimiter).map((c) => c.trim()));
}

export default function ProxiesPage() {
  const { t } = useI18n();
  const [proxies, setProxies] = useState<Proxy[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyProxy);
  const [importOpen, setImportOpen] = useState(false);
  const [rawText, setRawText] = useState("");
  const [delimiter, setDelimiter] = useState(":");
  const [columns, setColumns] = useState<ColumnId[]>(["host", "port", "username", "password"]);
  const [parsedRows, setParsedRows] = useState<string[][]>([]);
  const [importing, setImporting] = useState(false);
  const [pinging, setPinging] = useState<Record<string, { loading: boolean; ok?: boolean; ping?: number; error?: string }>>({});
  const dragItem = useRef<number | null>(null);
  const dragOver = useRef<number | null>(null);

  const fetchData = useCallback(async () => {
    const data = await fetch("/api/proxies").then((r) => r.json());
    setProxies(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const { page, setPage, totalPages, paged, total, pageSize } = usePagination(proxies, 10);

  function openCreate() {
    setEditingId(null);
    setForm(emptyProxy);
    setDialogOpen(true);
  }

  function openEdit(proxy: Proxy) {
    setEditingId(proxy._id);
    setForm({
      name: proxy.name,
      host: proxy.host,
      port: proxy.port,
      protocol: proxy.protocol,
      username: proxy.username,
      password: proxy.password,
      enabled: proxy.enabled,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    try {
      if (editingId) {
        await fetch(`/api/proxies/${editingId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
        toast.success("Proxy updated");
      } else {
        await fetch("/api/proxies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
        toast.success("Proxy added");
      }
      setDialogOpen(false);
      fetchData();
    } catch {
      toast.error("Failed to save");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this proxy?")) return;
    await fetch(`/api/proxies/${id}`, { method: "DELETE" });
    toast.success("Proxy deleted");
    fetchData();
  }

  async function toggleEnabled(proxy: Proxy) {
    await fetch(`/api/proxies/${proxy._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !proxy.enabled }),
    });
    fetchData();
  }

  function openImport() {
    setRawText("");
    setParsedRows([]);
    setColumns(["host", "port", "username", "password"]);
    setImportOpen(true);
  }

  function handleFileSelect() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".txt,.csv,.tsv";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      file.text().then((text) => {
        setRawText(text);
        const det = detectDelimiter(text);
        setDelimiter(det);
        setParsedRows(parseLines(text, det));
      });
    };
    input.click();
  }

  useEffect(() => {
    if (rawText) {
      setParsedRows(parseLines(rawText, delimiter));
    }
  }, [delimiter, rawText]);

  function handleDragStart(idx: number) {
    dragItem.current = idx;
  }

  function handleDragEnter(idx: number) {
    dragOver.current = idx;
  }

  function handleDragEnd() {
    if (dragItem.current === null || dragOver.current === null) return;
    const updated = [...columns];
    const [item] = updated.splice(dragItem.current, 1);
    updated.splice(dragOver.current, 0, item);
    setColumns(updated);
    dragItem.current = null;
    dragOver.current = null;
  }

  function addColumn(col: ColumnId) {
    if (!columns.includes(col)) {
      setColumns([...columns, col]);
    }
  }

  function removeColumn(idx: number) {
    setColumns(columns.filter((_, i) => i !== idx));
  }

  async function handleImport() {
    const items = parsedRows.map((row) => {
      const obj: Record<string, string> = {};
      columns.forEach((col, i) => {
        if (row[i] !== undefined) obj[col] = row[i];
      });
      return obj;
    });
    setImporting(true);
    try {
      const res = await fetch("/api/proxies/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(items),
      });
      const result = await res.json();
      if (res.ok) {
        toast.success(`Imported ${result.created}, skipped ${result.skipped}`);
        setImportOpen(false);
        fetchData();
      } else {
        toast.error(result.error || "Import failed");
      }
    } catch {
      toast.error("Import failed");
    } finally {
      setImporting(false);
    }
  }

  async function handlePing(proxy: Proxy) {
    setPinging((s) => ({ ...s, [proxy._id]: { loading: true } }));
    try {
      const res = await fetch("/api/proxies/ping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: proxy.host,
          port: proxy.port,
          protocol: proxy.protocol,
          username: proxy.username,
          password: proxy.password,
        }),
      });
      const data = await res.json();
      setPinging((s) => ({ ...s, [proxy._id]: { loading: false, ok: data.ok, ping: data.ping, error: data.error } }));
    } catch {
      setPinging((s) => ({ ...s, [proxy._id]: { loading: false, ok: false, error: "Request failed" } }));
    }
  }

  async function handlePingAll() {
    for (const proxy of proxies) {
      handlePing(proxy);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-pulse text-muted-foreground">{t.common.loading}</div></div>;
  }

  const unusedColumns = ALL_COLUMNS.filter((c) => !columns.includes(c));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t.proxies.title}</h1>
          <p className="text-muted-foreground mt-1">{t.proxies.subtitle}</p>
        </div>
        <div className="flex gap-2">
          {proxies.length > 0 && (
            <Button variant="outline" onClick={handlePingAll}>
              <Wifi className="mr-2 h-4 w-4" />
              {t.proxies.pingAll}
            </Button>
          )}
          <Button variant="outline" onClick={openImport}>
            <Upload className="mr-2 h-4 w-4" />
            {t.common.import}
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate} className="bg-primary text-primary-foreground">
                <Plus className="mr-2 h-4 w-4" />
                Add Proxy
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingId ? t.proxies.editProxy : t.proxies.addProxy}</DialogTitle>
                <DialogDescription>{t.proxies.configureProxy}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="US Proxy 1" />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2 col-span-1">
                    <Label>Protocol</Label>
                    <Select value={form.protocol} onValueChange={(v) => setForm({ ...form, protocol: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="http">HTTP</SelectItem>
                        <SelectItem value="https">HTTPS</SelectItem>
                        <SelectItem value="socks5">SOCKS5</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 col-span-1">
                    <Label>Host</Label>
                    <Input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="proxy.example.com" />
                  </div>
                  <div className="space-y-2 col-span-1">
                    <Label>Port</Label>
                    <Input type="number" value={form.port} onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) || 0 })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Username (optional)</Label>
                    <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Password (optional)</Label>
                    <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
                  <Label>{t.common.enabled}</Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>{t.common.cancel}</Button>
                <Button onClick={handleSave} className="bg-primary text-primary-foreground">{t.common.save}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t.proxies.importProxies}</DialogTitle>
            <DialogDescription>{t.proxies.importDesc}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleFileSelect}>
                <Upload className="mr-2 h-4 w-4" />
                {t.proxies.chooseFile}
              </Button>
              <div className="flex items-center gap-2">
                <Label className="text-sm whitespace-nowrap">Delimiter:</Label>
                <Select value={delimiter} onValueChange={setDelimiter}>
                  <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value=":">: (colon)</SelectItem>
                    <SelectItem value=",">, (comma)</SelectItem>
                    <SelectItem value="	">Tab</SelectItem>
                    <SelectItem value=";">; (semi)</SelectItem>
                    <SelectItem value="|">| (pipe)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Column Mapping (drag to reorder)</Label>
              <div className="flex flex-wrap gap-2 items-center min-h-[40px] p-2 border rounded-md bg-muted/30">
                {columns.map((col, idx) => (
                  <div
                    key={col}
                    draggable
                    onDragStart={() => handleDragStart(idx)}
                    onDragEnter={() => handleDragEnter(idx)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(e) => e.preventDefault()}
                    className="flex items-center gap-1 px-2 py-1 bg-background border rounded-md cursor-grab active:cursor-grabbing select-none text-sm"
                  >
                    <GripVertical className="h-3 w-3 text-muted-foreground" />
                    <span className="font-medium">{COLUMN_LABELS[col]}</span>
                    <button onClick={() => removeColumn(idx)} className="ml-1 text-muted-foreground hover:text-destructive text-xs">×</button>
                  </div>
                ))}
                {unusedColumns.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                        <Plus className="h-3 w-3 mr-1" />Add
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      {unusedColumns.map((col) => (
                        <DropdownMenuItem key={col} onClick={() => addColumn(col)}>{COLUMN_LABELS[col]}</DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Columns left to right map to each field in your file. Drag to reorder.
              </p>
            </div>

            {parsedRows.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Preview ({parsedRows.length} rows)</Label>
                <div className="border rounded-md overflow-auto max-h-60">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10 text-xs">#</TableHead>
                        {columns.map((col) => (
                          <TableHead key={col} className="text-xs">{COLUMN_LABELS[col]}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parsedRows.slice(0, 10).map((row, ri) => (
                        <TableRow key={ri}>
                          <TableCell className="text-xs text-muted-foreground">{ri + 1}</TableCell>
                          {columns.map((col, ci) => (
                            <TableCell key={col} className="text-xs font-mono">
                              {col === "password" && row[ci] ? "••••" : (row[ci] || <span className="text-muted-foreground">—</span>)}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                      {parsedRows.length > 10 && (
                        <TableRow>
                          <TableCell colSpan={columns.length + 1} className="text-center text-xs text-muted-foreground">
                            ...and {parsedRows.length - 10} more rows
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-sm font-medium">Or paste directly</Label>
              <textarea
                className="w-full h-24 p-2 text-sm font-mono border rounded-md bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder={"host:port:user:pass\n192.168.1.1:8080:admin:secret"}
                value={rawText}
                onChange={(e) => {
                  const text = e.target.value;
                  setRawText(text);
                  if (text.trim()) {
                    const det = detectDelimiter(text);
                    setDelimiter(det);
                    setParsedRows(parseLines(text, det));
                  } else {
                    setParsedRows([]);
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>{t.common.cancel}</Button>
            <Button onClick={handleImport} disabled={parsedRows.length === 0 || importing}>
              {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t.common.import} {parsedRows.length} Proxies
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
        <CardHeader>
          <CardTitle>Proxy List</CardTitle>
          <CardDescription>{proxies.length} prox{proxies.length !== 1 ? "ies" : "y"} configured</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Protocol</TableHead>
                <TableHead>Auth</TableHead>
                <TableHead>Ping</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((proxy) => {
                const ps = pinging[proxy._id];
                return (
                  <TableRow key={proxy._id}>
                    <TableCell className="font-medium">{proxy.name}</TableCell>
                    <TableCell className="font-mono text-sm">{proxy.host}:{proxy.port}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="uppercase text-xs">{proxy.protocol}</Badge>
                    </TableCell>
                    <TableCell>
                      {proxy.username ? (
                        <Badge variant="secondary" className="text-xs">Authenticated</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">None</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {ps?.loading ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : ps?.ok !== undefined ? (
                        <div className="flex items-center gap-1.5">
                          {ps.ok ? (
                            <Wifi className="h-3.5 w-3.5 text-green-500" />
                          ) : (
                            <WifiOff className="h-3.5 w-3.5 text-destructive" />
                          )}
                          <span className={`text-xs font-mono ${ps.ok ? "text-green-500" : "text-destructive"}`}>
                            {ps.ok ? `${ps.ping}ms` : ps.error}
                          </span>
                        </div>
                      ) : (
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => handlePing(proxy)}>
                          Test
                        </Button>
                      )}
                    </TableCell>
                    <TableCell>
                      <Switch checked={proxy.enabled} onCheckedChange={() => toggleEnabled(proxy)} />
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handlePing(proxy)}>
                            <Wifi className="mr-2 h-4 w-4" />{t.proxies.ping}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openEdit(proxy)}>
                            <Pencil className="mr-2 h-4 w-4" />{t.common.edit}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDelete(proxy._id)} className="text-destructive">
                            <Trash2 className="mr-2 h-4 w-4" />{t.common.delete}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
              {proxies.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    {t.proxies.noProxies}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <TablePagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPageChange={setPage} />
        </CardContent>
      </Card>
    </div>
  );
}
