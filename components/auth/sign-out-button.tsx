"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/actions/auth";

export function SignOutButton() {
  const [pending, startTransition] = useTransition();

  return (
    <Button variant="ghost" size="sm" disabled={pending} onClick={() => startTransition(() => signOut())}>
      Sign out
    </Button>
  );
}
