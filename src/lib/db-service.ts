import { connectDB } from "./db";
import { Account } from "./models/account";
import { Proxy } from "./models/proxy";
import { Tunnel } from "./models/tunnel";
import { User } from "./models/user";

export const dbService = {
  connect: connectDB,
  account: Account,
  proxy: Proxy,
  tunnel: Tunnel,
  user: User,
};
