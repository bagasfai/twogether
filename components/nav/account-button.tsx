"use client";

import { useEffect, useState } from "react";
import NextLink from "next/link";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

// Resolved in the browser so the marketing layout never reads cookies: a
// cookie read there makes every page in the group render dynamically and
// breaks ISR on the session detail route. Visitors see the login link until
// the session check finishes.
export function AccountButton({
  loginLabel,
  dashboardLabel,
}: {
  loginLabel: string;
  dashboardLabel: string;
}) {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let active = true;
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (active) setSignedIn(Boolean(data.user));
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <Button asChild size="sm" className="bg-white text-navy shadow-none hover:bg-white/90 focus-visible:ring-white">
      {/* /dashboard and /login live outside app/[locale] -- plain Link, no locale prefix */}
      <NextLink href={signedIn ? "/dashboard" : "/login"}>
        {signedIn ? dashboardLabel : loginLabel}
      </NextLink>
    </Button>
  );
}
