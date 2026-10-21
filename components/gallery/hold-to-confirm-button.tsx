"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { isConfirmed, remainingSeconds } from "@/lib/gallery/hold-timer";

// Destructive, irreversible actions (hard delete) per design.md's CTA voice: a
// danger outline that fills while held, no confirm dialog. Pointer and
// keyboard (Enter/Space) holds both work; releasing early, leaving the button
// or losing focus cancels. Under reduced motion the fill is not animated but
// the hold is still required.
export function HoldToConfirmButton({
  onConfirm,
  label,
  holdMs = 600,
  disabled = false,
}: {
  onConfirm: () => void | Promise<void>;
  label: string;
  holdMs?: number;
  disabled?: boolean;
}) {
  const t = useTranslations("gallery");
  const [holding, setHolding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const startRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastSecondsRef = useRef<number | null>(null);
  const onConfirmRef = useRef(onConfirm);

  useEffect(() => {
    onConfirmRef.current = onConfirm;
  }, [onConfirm]);

  const stopTimer = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    startRef.current = null;
    lastSecondsRef.current = null;
  }, []);

  useEffect(() => stopTimer, [stopTimer]);

  const confirm = useCallback(async () => {
    stopTimer();
    setHolding(false);
    setAnnouncement("");
    setBusy(true);
    try {
      await onConfirmRef.current();
    } finally {
      setBusy(false);
    }
  }, [stopTimer]);

  const start = useCallback(() => {
    if (disabled || busy || startRef.current !== null) return;
    startRef.current = performance.now();
    setHolding(true);

    const tick = () => {
      if (startRef.current === null) return;
      const held = performance.now() - startRef.current;
      if (isConfirmed(held, holdMs)) {
        void confirm();
        return;
      }
      const seconds = remainingSeconds(held, holdMs);
      if (seconds !== lastSecondsRef.current) {
        lastSecondsRef.current = seconds;
        setAnnouncement(t("holdRemaining", { seconds }));
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
  }, [busy, confirm, disabled, holdMs, t]);

  const cancel = useCallback(() => {
    if (startRef.current === null) return;
    stopTimer();
    setHolding(false);
    setAnnouncement(t("holdCancelled"));
  }, [stopTimer, t]);

  return (
    <>
      <button
        type="button"
        // Busy uses aria-disabled rather than disabled so keyboard focus stays
        // on the button while onConfirm runs; start() already ignores input
        // while busy.
        disabled={disabled}
        aria-disabled={busy || undefined}
        aria-label={label}
        title={t("holdHint")}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          start();
        }}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onPointerCancel={cancel}
        onBlur={cancel}
        // A long press on touch opens the context menu around 500ms, which
        // would cut the hold short.
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          if (!event.repeat) start();
        }}
        onKeyUp={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          cancel();
        }}
        style={{ "--hold-duration": `${holdMs}ms` } as CSSProperties}
        className="relative inline-flex h-9 touch-none select-none items-center justify-center overflow-hidden rounded-full border border-destructive px-4 text-sm font-medium text-destructive outline-none focus-visible:ring-[3px] focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
      >
        <span>{label}</span>
        {/* The filled state is a clipped copy of the label, so the text flips
            to paper colour exactly where the fill has reached. Linear on
            purpose: the fill shows elapsed hold time, which is linear. The
            reset uses the system's micro duration. Under reduced motion the
            clip is not animated: the whole fill fades in over --dur-micro
            (opacity only, <=150ms) while held, and the hold is still timed. */}
        <span
          aria-hidden="true"
          className={cn(
            "absolute inset-0 flex items-center justify-center bg-destructive text-primary-foreground",
            "motion-reduce:[clip-path:inset(0_0_0_0)] motion-reduce:transition-opacity motion-reduce:duration-[var(--dur-micro)] motion-reduce:ease-[var(--ease-out)]",
            holding
              ? "[clip-path:inset(0_0_0_0)] transition-[clip-path] duration-[var(--hold-duration)] ease-linear motion-reduce:opacity-100"
              : "[clip-path:inset(0_100%_0_0)] transition-[clip-path] duration-[var(--dur-micro)] ease-[var(--ease-out)] motion-reduce:opacity-0",
          )}
        >
          {label}
        </span>
      </button>
      <span aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </>
  );
}
