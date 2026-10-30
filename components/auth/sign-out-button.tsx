"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/actions/auth";

export function SignOutButton() {
  const [pending, startTransition] = useTransition();

  return (
    <Button variant="outline" size="sm" className="border-white/60 bg-transparent text-white shadow-none hover:bg-white hover:text-navy focus-visible:ring-white" disabled={pending} onClick={() => startTransition(() => signOut())}>
      Sign out
    </Button>
  );
}
