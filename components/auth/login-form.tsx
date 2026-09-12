"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { signIn } from "@/lib/actions/auth";
import { signInSchema, type SignInInput } from "@/lib/validation/auth";
import { GoogleButton } from "@/components/auth/google-button";

export function LoginForm({ next }: { next?: string }) {
  const [pending, startTransition] = useTransition();
  const form = useForm<SignInInput>({
    // same schema the Server Action re-parses with
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await signIn(values, next);
      // A successful sign-in calls redirect(), which Next resolves this
      // promise to `undefined` for rather than returning an ActionResult --
      // so reaching here with a value means failure, and reaching here at
      // all does not guarantee a value.
      if (result && !result.ok) {
        for (const [field, messages] of Object.entries(result.fieldErrors ?? {})) {
          if (field !== "_form") form.setError(field as keyof SignInInput, { message: messages[0] });
        }
        form.setError("root", { message: result.message });
      }
    }),
  );

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Log in</CardTitle>
        <CardDescription>Welcome back to Jakbar Twogether.</CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={onSubmit}>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" autoComplete="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="current-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {form.formState.errors.root ? (
              <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
            ) : null}
          </CardContent>
          <CardFooter className="flex-col gap-3">
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Logging in…" : "Log in"}
            </Button>
            <GoogleButton next={next} />
            <p className="text-sm text-muted-foreground">
              No account? <Link href="/signup" className="underline">Sign up</Link>
            </p>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
