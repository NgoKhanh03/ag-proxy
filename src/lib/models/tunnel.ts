import mongoose, { Schema } from "mongoose";
import crypto from "crypto";

export interface ITunnel {
  _id: mongoose.Types.ObjectId;
  name: string;
  model: string;
  apiKey: string;
  tokenLimit: number;
  tokensUsed: number;
  accountMode: "pool" | "tied";
  tiedAccountId?: mongoose.Types.ObjectId;
  enabled: boolean;
  createdAt: Date;
}

const TunnelSchema = new Schema<ITunnel>({
  name: { type: String, required: true },
  model: { type: String, required: true },
  apiKey: { type: String, required: true, unique: true, index: true, default: () => "sk-" + crypto.randomBytes(24).toString("hex") },
  tokenLimit: { type: Number, default: 0 },
  tokensUsed: { type: Number, default: 0 },
  accountMode: { type: String, enum: ["pool", "tied"], default: "pool" },
  tiedAccountId: { type: Schema.Types.ObjectId, ref: "Account", default: null },
  enabled: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

export const Tunnel = mongoose.models.Tunnel || mongoose.model<ITunnel>("Tunnel", TunnelSchema);
