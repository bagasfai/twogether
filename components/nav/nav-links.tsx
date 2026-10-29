"use client";

import type { ComponentType, ReactNode } from "react";
import NextLink from "next/link";
import { usePathname as useNextPathname } from "next/navigation";
import { Link as IntlLink, usePathname as useIntlPathname } from "@/i18n/navigation";
import { activeHref } from "@/lib/nav/active-href";
import { cn } from "@/lib/utils";

type NavAnchor = ComponentType<{
  href: string;
  className?: string;
  "aria-current"?: "page";
  children?: ReactNode;
}>;

type Item = { href: string; label: string };

type Props = {
  items: Item[];
  localized?: boolean;
  className?: string;
  linkClassName?: string;
  activeClassName?: string;
};

// Two variants so the locale-aware pathname hook only runs under the
// marketing tree (the (app) tree has no next-intl context).
export function NavLinks({ localized = false, ...props }: Props) {
  return localized ? <LocalizedNav {...props} /> : <PlainNav {...props} />;
}

function PlainNav(props: Omit<Props, "localized">) {
  return <NavList {...props} pathname={useNextPathname() ?? ""} Link={NextLink as NavAnchor} />;
}

function LocalizedNav(props: Omit<Props, "localized">) {
  return <NavList {...props} pathname={useIntlPathname() ?? ""} Link={IntlLink as NavAnchor} />;
}

function NavList({
  items,
  pathname,
  Link,
  className,
  linkClassName,
  activeClassName = "font-medium text-accent-text",
}: Omit<Props, "localized"> & { pathname: string; Link: NavAnchor }) {
  const active = activeHref(pathname, items.map((i) => i.href));
  return (
    <nav aria-label="Main" className={className}>
      {items.map((item) => {
        const isActive = item.href === active;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(linkClassName, isActive && activeClassName)}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
