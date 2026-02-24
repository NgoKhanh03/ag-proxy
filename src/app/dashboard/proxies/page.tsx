"use client";

import { useEffect, useState, useCallback } from "react";
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
import { Plus, MoreHorizontal, Pencil, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

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

export default function ProxiesPage() {
  const [proxies, setProxies] = useState<Proxy[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyProxy);

  const fetchData = useCallback(async () => {
    const data = await fetch("/api/proxies").then((r) => r.json());
    setProxies(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

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

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-pulse text-muted-foreground">Loading...</div></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Network Proxies</h1>
          <p className="text-muted-foreground mt-1">Manage network proxies for account connections</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={fetchData}>
            <RefreshCw className="h-4 w-4" />
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
                <DialogTitle>{editingId ? "Edit Proxy" : "Add Proxy"}</DialogTitle>
                <DialogDescription>Configure a network proxy for routing account traffic</DialogDescription>
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
                <TableHead>Status</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {proxies.map((proxy) => (
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
                    <Switch checked={proxy.enabled} onCheckedChange={() => toggleEnabled(proxy)} />
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(proxy)}>
                          <Pencil className="mr-2 h-4 w-4" />Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDelete(proxy._id)} className="text-destructive">
                          <Trash2 className="mr-2 h-4 w-4" />Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {proxies.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No proxies configured yet
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
