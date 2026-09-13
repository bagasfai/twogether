import type { ReactNode } from "react";

// LayoutProps<"/"> would be wrong here even though it type-checks: Next's
// typegen only emits a route literal for a layout.tsx sitting directly on
// that route, and "/" belongs to (marketing)/page.tsx, not this group. This
// layout applies to /login and /signup, no single route literal fits, so a
// plain children prop is the honest type.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <div className="flex flex-1 items-center justify-center p-6">{children}</div>;
}
