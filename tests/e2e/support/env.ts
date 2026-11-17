import { readFileSync } from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { localStackProblem } from "./local-guard";

loadEnvConfig(process.cwd());

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set; the e2e suite reads it from .env.local`);
  return value;
}

export const env = {
  get supabaseUrl(): string {
    return required("NEXT_PUBLIC_SUPABASE_URL");
  },
  get anonKey(): string {
    return required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  get serviceRoleKey(): string {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  baseUrl: "http://127.0.0.1:3000" as const,
};

function configuredApiPort(): string | null {
  try {
    const toml = readFileSync(path.join(process.cwd(), "supabase", "config.toml"), "utf8");
    return /^\[api\][^[]*?^port\s*=\s*(\d+)/m.exec(toml)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function assertLocalStack(): void {
  const problem = localStackProblem(env.supabaseUrl, configuredApiPort());
  if (problem) throw new Error(problem);
}
