"use client"; // Error boundaries must be Client Components

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

// Hooks-free so it can be rendered and inspected without a React runtime.
export function MarketingErrorView({
  title,
  body,
  offlineHint,
  retryLabel,
  offline,
  onRetry,
}: {
  title: string;
  body: string;
  offlineHint: string;
  retryLabel: string;
  offline: boolean;
  onRetry: () => void;
}) {
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-start gap-3 px-6 py-16">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">{body}</p>
      {offline ? <p className="text-sm text-muted-foreground">{offlineHint}</p> : null}
      <Button onClick={onRetry}>{retryLabel}</Button>
    </div>
  );
}

export default function MarketingError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const t = useTranslations("errors.generic");
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
    console.error("Marketing route error", error.digest ?? error.message);
  }, [error]);

  return (
    <MarketingErrorView
      title={t("title")}
      body={t("body")}
      offlineHint={t("offline")}
      retryLabel={t("retry")}
      offline={offline}
      onRetry={retry}
    />
  );
}
