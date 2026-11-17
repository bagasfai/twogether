import { loadEnvConfig } from "@next/env";

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

const LOCAL_HOSTS = ["127.0.0.1", "localhost"];

export function assertLocalStack(): void {
  const url = env.supabaseUrl;
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(`NEXT_PUBLIC_SUPABASE_URL is not a URL: ${url}`);
  }
  if (!LOCAL_HOSTS.includes(host)) {
    throw new Error(
      `Refusing to run e2e tests against ${host}. The suite creates and deletes users with the service-role key and only runs against the local Supabase stack (127.0.0.1 or localhost).`,
    );
  }
}
