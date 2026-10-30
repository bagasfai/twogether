import { afterEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AppError, { AppErrorView } from "@/app/(app)/error";
import { Button } from "@/components/ui/button";

function findButton(node: ReactNode): ReactElement<{ onClick?: () => void }> | null {
  if (!isValidElement(node)) return null;
  if (node.type === Button) return node as ReactElement<{ onClick?: () => void }>;
  const children = (node.props as { children?: ReactNode }).children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = findButton(child);
    if (found) return found;
  }
  return null;
}

describe("AppError", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("renders the message and a Try again button without touching navigator", () => {
    // Node ships a global navigator; remove it so a render-time read would throw.
    vi.stubGlobal("navigator", undefined);
    expect(typeof navigator).toBe("undefined");
    const html = renderToStaticMarkup(<AppError error={new Error("boom")} retry={vi.fn()} />);
    expect(html).toContain("Something went wrong");
    expect(html).toContain("Try again");
    expect(html).not.toContain("Check your connection");
  });

  it("shows the offline hint only when offline", () => {
    const html = renderToStaticMarkup(<AppErrorView offline onRetry={vi.fn()} />);
    expect(html).toContain("Check your connection");
  });

  it("Try again button invokes retry", () => {
    const onRetry = vi.fn();
    const button = findButton(AppErrorView({ offline: false, onRetry }));
    expect(button).not.toBeNull();
    button!.props.onClick!();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("404 landmarks", () => {
  it("root not-found keeps main (root layout has none); (app) not-found has no nested main", async () => {
    const { readFileSync } = await import("node:fs");
    expect(readFileSync("app/layout.tsx", "utf8")).not.toContain("<main");
    expect(readFileSync("app/not-found.tsx", "utf8")).toContain("<main");
    const appNf = readFileSync("app/(app)/not-found.tsx", "utf8");
    expect(appNf).not.toContain("<main");
    expect(appNf).toContain("404");
  });
});
