import * as vscode from "vscode";
import * as http from "http";
import * as path from "path";
import * as fs from "fs";

let server: http.Server | null = null;
let statusBarItem: vscode.StatusBarItem;

interface DeviceProfile {
  machineId: string;
  macMachineId: string;
  devDeviceId: string;
  sqmId: string;
}

interface SwitchPayload {
  accessToken: string;
  refreshToken: string;
  expiryTimestamp: number;
  email: string;
  deviceProfile?: DeviceProfile;
}

function encodeVarint(value: number): Buffer {
  const bytes: number[] = [];
  let v = value >>> 0;
  while (v >= 0x80) {
    bytes.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  bytes.push(v);
  return Buffer.from(bytes);
}

function encodeLenDelimField(fieldNum: number, data: Buffer): Buffer {
  const tag = encodeVarint((fieldNum << 3) | 2);
  const len = encodeVarint(data.length);
  return Buffer.concat([tag, len, data]);
}

function encodeStringField(fieldNum: number, value: string): Buffer {
  return encodeLenDelimField(fieldNum, Buffer.from(value, "utf8"));
}

function createOAuthInfo(accessToken: string, refreshToken: string, expiry: number): Buffer {
  const field1 = encodeStringField(1, accessToken);
  const field2 = encodeStringField(2, "Bearer");
  const field3 = encodeStringField(3, refreshToken);
  const timestampTag = encodeVarint((1 << 3) | 0);
  const timestampVal = encodeVarint(expiry);
  const timestampMsg = Buffer.concat([timestampTag, timestampVal]);
  const field4 = encodeLenDelimField(4, timestampMsg);
  return Buffer.concat([field1, field2, field3, field4]);
}

function injectTokenNewFormat(dbPath: string, accessToken: string, refreshToken: string, expiry: number): void {
  const Database = require("better-sqlite3");
  const db = new Database(dbPath);
  try {
    db.exec("CREATE TABLE IF NOT EXISTS ItemTable (key TEXT PRIMARY KEY, value TEXT)");
    const oauthInfo = createOAuthInfo(accessToken, refreshToken, expiry);
    const oauthInfoB64 = oauthInfo.toString("base64");
    const inner2 = encodeStringField(1, oauthInfoB64);
    const inner1 = encodeStringField(1, "oauthTokenInfoSentinelKey");
    const inner = Buffer.concat([inner1, encodeLenDelimField(2, inner2)]);
    const outer = encodeLenDelimField(1, inner);
    const outerB64 = outer.toString("base64");
    db.prepare("INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)").run("antigravityUnifiedStateSync.oauthToken", outerB64);
    db.prepare("INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)").run("antigravityOnboarding", "true");
  } finally {
    db.close();
  }
}

function writeDeviceProfile(storagePath: string, profile: DeviceProfile): void {
  if (!fs.existsSync(storagePath)) {
    return;
  }
  const content = fs.readFileSync(storagePath, "utf8");
  const json = JSON.parse(content);
  if (!json.telemetry || typeof json.telemetry !== "object") {
    json.telemetry = {};
  }
  json.telemetry.machineId = profile.machineId;
  json.telemetry.macMachineId = profile.macMachineId;
  json.telemetry.devDeviceId = profile.devDeviceId;
  json.telemetry.sqmId = profile.sqmId;
  json["telemetry.machineId"] = profile.machineId;
  json["telemetry.macMachineId"] = profile.macMachineId;
  json["telemetry.devDeviceId"] = profile.devDeviceId;
  json["telemetry.sqmId"] = profile.sqmId;
  json["storage.serviceMachineId"] = profile.devDeviceId;
  fs.writeFileSync(storagePath, JSON.stringify(json, null, 2));
  syncServiceMachineId(path.join(path.dirname(storagePath), "state.vscdb"), profile.devDeviceId);
}

function syncServiceMachineId(dbPath: string, serviceId: string): void {
  if (!fs.existsSync(dbPath)) {
    return;
  }
  try {
    const Database = require("better-sqlite3");
    const db = new Database(dbPath);
    db.exec("CREATE TABLE IF NOT EXISTS ItemTable (key TEXT PRIMARY KEY, value TEXT)");
    db.prepare("INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)").run("storage.serviceMachineId", serviceId);
    db.close();
  } catch {
  }
}

function getGlobalStoragePath(context: vscode.ExtensionContext): string {
  return path.dirname(context.globalStorageUri.fsPath);
}

function performSwitch(context: vscode.ExtensionContext, payload: SwitchPayload): { ok: boolean; error?: string } {
  try {
    const globalStorage = getGlobalStoragePath(context);
    const storagePath = path.join(globalStorage, "storage.json");
    const dbPath = path.join(globalStorage, "state.vscdb");
    if (payload.deviceProfile) {
      writeDeviceProfile(storagePath, payload.deviceProfile);
    }
    injectTokenNewFormat(dbPath, payload.accessToken, payload.refreshToken, payload.expiryTimestamp);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message || String(e) };
  }
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => (body += chunk.toString()));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function startServer(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration("ag-switch");
  const port = config.get<number>("port", 23816);

  server = http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const json = (res: http.ServerResponse, status: number, data: any) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };

    if (req.method === "GET" && req.url === "/health") {
      json(res, 200, { ok: true, version: "0.1.0" });
      return;
    }

    if (req.method === "POST" && req.url === "/switch") {
      try {
        const body = await readBody(req);
        const payload: SwitchPayload = JSON.parse(body);
        if (!payload.accessToken || !payload.refreshToken || !payload.email) {
          json(res, 400, { error: "Missing required fields: accessToken, refreshToken, email" });
          return;
        }
        const result = performSwitch(context, payload);
        if (result.ok) {
          json(res, 200, { ok: true, message: `Switched to ${payload.email}` });
          vscode.window.showInformationMessage(`AG Switch: Switching to ${payload.email}...`);
          setTimeout(() => {
            vscode.commands.executeCommand("workbench.action.reloadWindow");
          }, 800);
        } else {
          json(res, 500, { error: result.error });
        }
      } catch (e: any) {
        json(res, 500, { error: e.message || String(e) });
      }
      return;
    }

    json(res, 404, { error: "Not found" });
  });

  server.on("error", (err: any) => {
    if (err.code === "EADDRINUSE") {
      vscode.window.showWarningMessage(`AG Switch: Port ${port} is in use. Change ag-switch.port in settings.`);
    } else {
      vscode.window.showErrorMessage(`AG Switch: Server error: ${err.message}`);
    }
  });

  server.listen(port, "127.0.0.1", () => {
    statusBarItem.text = "$(plug) AG Switch";
    statusBarItem.tooltip = `AG Switch listening on port ${port}`;
    statusBarItem.show();
  });
}

export function activate(context: vscode.ExtensionContext) {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
  statusBarItem.command = "ag-switch.showStatus";
  context.subscriptions.push(statusBarItem);

  context.subscriptions.push(
    vscode.commands.registerCommand("ag-switch.showStatus", () => {
      const config = vscode.workspace.getConfiguration("ag-switch");
      const port = config.get<number>("port", 23816);
      const globalStorage = getGlobalStoragePath(context);
      vscode.window.showInformationMessage(
        `AG Switch: Listening on port ${port}\nStorage: ${globalStorage}`
      );
    })
  );

  startServer(context);
}

export function deactivate() {
  if (server) {
    server.close();
    server = null;
  }
}
