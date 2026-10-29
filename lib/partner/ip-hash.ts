import { createHash } from "node:crypto";

// SHA-256 hex of `${salt}:${ip}`. A null or empty IP hashes the literal
// "unknown", so requests without x-forwarded-for share one rate-limit bucket.
// The raw IP is never stored.
export function hashIp(ip: string | null, salt: string): string {
  return createHash("sha256").update(`${salt}:${ip || "unknown"}`).digest("hex");
}
