import type { ReactNode } from "react";
import { AuthShell } from "@/components/auth/auth-shell";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main id="main" className="flex flex-1 flex-col">
      <AuthShell>{children}</AuthShell>
    </main>
  );
}
