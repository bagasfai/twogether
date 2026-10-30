"use client"; // Error boundaries must be Client Components

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

// Hooks-free so it can be rendered and inspected without a React runtime.
export function AppErrorView({
  offline,
  onRetry,
}: {
  offline: boolean;
  onRetry: () => void;
}) {
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-start gap-3 py-12">
      <h1 className="font-display text-4xl font-extrabold uppercase italic leading-none tracking-tight">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">
        We could not load this page. Try again, and if it keeps happening, come back in a few
        minutes.
      </p>
      {offline ? (
        <p className="text-sm text-muted-foreground">Check your connection.</p>
      ) : null}
      <Button onClick={onRetry}>Try again</Button>
    </div>
  );
}

export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  // Start online so server render and hydration agree; the effect corrects it.
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    // The digest matches this error to the server-side log entry.
    console.error("App route error", error.digest ?? error.message);
  }, [error]);

  return <AppErrorView offline={offline} onRetry={retry} />;
}
