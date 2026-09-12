import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

const REASONS: Record<string, string> = {
  invalid_link: "That confirmation link is invalid or has expired.",
  oauth_failed: "We could not complete that sign-in.",
};

export default async function AuthErrorPage({ searchParams }: PageProps<"/auth/error">) {
  const { reason } = await searchParams;
  const key = typeof reason === "string" ? reason : "";

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign-in problem</CardTitle>
          <CardDescription>{REASONS[key] ?? "Something went wrong signing you in."}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild className="w-full"><Link href="/login">Back to login</Link></Button>
        </CardFooter>
      </Card>
    </div>
  );
}
