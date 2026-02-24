import mongoose, { Schema, Document } from "mongoose";

export interface IProxy extends Document {
  name: string;
  host: string;
  port: number;
  protocol: "http" | "https" | "socks5";
  username: string;
  password: string;
  enabled: boolean;
  createdAt: Date;
}

const ProxySchema = new Schema<IProxy>({
  name: { type: String, required: true },
  host: { type: String, required: true },
  port: { type: Number, required: true },
  protocol: { type: String, enum: ["http", "https", "socks5"], default: "http" },
  username: { type: String, default: "" },
  password: { type: String, default: "" },
  enabled: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

export const Proxy = mongoose.models.Proxy || mongoose.model<IProxy>("Proxy", ProxySchema);
