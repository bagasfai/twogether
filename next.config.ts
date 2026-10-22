import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Gallery photos are served from the public `gallery` Storage bucket. Derived
// from the env so local (http://127.0.0.1:<port>) and hosted
// (https://<ref>.supabase.co) both work without editing this file.
// Unset (e.g. a tooling run without .env) means no pattern rather than a
// config-load throw from new URL(undefined).
const rawSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseUrl = rawSupabaseUrl ? new URL(rawSupabaseUrl) : null;

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  images: {
    remotePatterns: supabaseUrl
      ? [
          {
            protocol: supabaseUrl.protocol === "https:" ? "https" : "http",
            hostname: supabaseUrl.hostname,
            port: supabaseUrl.port,
            pathname: "/storage/v1/object/public/gallery/**",
            search: "",
          },
        ]
      : [],
    // The local Supabase stack lives on 127.0.0.1, which the optimizer blocks
    // by default (400). Allowed in dev only: in production it would open an
    // SSRF path to private addresses.
    dangerouslyAllowLocalIP: process.env.NODE_ENV !== "production",
  },
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
