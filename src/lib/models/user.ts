import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
  username: string;
  password: string;
  role: "admin" | "user";
  createdAt: Date;
}

const UserSchema = new Schema<IUser>({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["admin", "user"], default: "user" },
  createdAt: { type: Date, default: Date.now },
});

export const User = mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
