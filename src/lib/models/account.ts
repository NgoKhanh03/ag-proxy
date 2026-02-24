import mongoose, { Schema, Document } from "mongoose";

export interface IAccount extends Document {
  email: string;
  name: string;
  avatar: string;
  tier: "free" | "pro" | "ultra";
  type: "google" | "anthropic";
  accessToken: string;
  refreshToken: string;
  projectId: string;
  quotas: Record<string, number>;
  quotaResets: Record<string, string>;
  tokensUsed: number;
  rotationPriority: number;
  rotationEnabled: boolean;
  proxyId?: mongoose.Types.ObjectId;
  status: "active" | "suspended" | "expired";
  lastSyncAt: Date;
  createdAt: Date;
}

const AccountSchema = new Schema<IAccount>({
  email: { type: String, required: true },
  name: { type: String, default: "" },
  avatar: { type: String, default: "" },
  tier: { type: String, enum: ["free", "pro", "ultra"], default: "free" },
  type: { type: String, enum: ["google", "anthropic"], default: "google" },
  accessToken: { type: String, default: "" },
  refreshToken: { type: String, default: "" },
  projectId: { type: String, default: "" },
  quotas: { type: Schema.Types.Mixed, default: () => ({}) },
  quotaResets: { type: Schema.Types.Mixed, default: () => ({}) },
  tokensUsed: { type: Number, default: 0 },
  rotationPriority: { type: Number, default: 0 },
  rotationEnabled: { type: Boolean, default: true },
  proxyId: { type: Schema.Types.ObjectId, ref: "Proxy", default: null },
  status: { type: String, enum: ["active", "suspended", "expired"], default: "active" },
  lastSyncAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});

if (mongoose.models.Account) {
  delete mongoose.models.Account;
  const schemas = (mongoose as any).modelSchemas;
  if (schemas) delete schemas.Account;
}
export const Account = mongoose.model<IAccount>("Account", AccountSchema);
