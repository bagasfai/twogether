import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/components/auth/auth-shell";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Sign-in problem" };

const REASONS: Record<string, string> = {
  invalid_link: "That confirmation link is invalid or has expired.",
  oauth_failed: "We could not complete that sign-in.",
};

export default async function AuthErrorPage({ searchParams }: PageProps<"/auth/error">) {
  const { reason } = await searchParams;
  const key = typeof reason === "string" ? reason : "";

  return (
    <main id="main" className="flex flex-1 flex-col">
      <AuthShell>
      <Card className="w-full max-w-sm rounded-3xl border-0 shadow-[0_24px_48px_-16px_oklch(20%_0.13_264/0.6)]">
        <CardHeader>
          <CardTitle className="text-4xl font-extrabold uppercase italic"><h1>Sign-in problem</h1></CardTitle>
          <CardDescription>{REASONS[key] ?? "Something went wrong signing you in."}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild className="w-full"><Link href="/login">Back to login</Link></Button>
        </CardFooter>
      </Card>
      </AuthShell>
    </main>
  );
}
