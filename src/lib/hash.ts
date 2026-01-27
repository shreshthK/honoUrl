import { createHash } from "crypto";

const salt = process.env.IP_HASH_SALT ?? "dev-salt";

export const hashIp = (ip: string | null): string | null => {
  if (!ip) return null;
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
};