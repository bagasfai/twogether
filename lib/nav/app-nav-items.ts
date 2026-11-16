import type { Role } from "@/lib/dal/user";

export type AppNavItem = { href: string; label: string };

export function appNavItems(role: Role): AppNavItem[] {
  const canHost = role === "host" || role === "admin";
  return [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/sessions", label: "Sessions" },
    ...(canHost ? [{ href: "/hosted", label: "Hosted" }] : []),
    { href: "/history", label: "History" },
    { href: "/leaderboard", label: "Leaderboard" },
    { href: "/profile", label: "Profile" },
    ...(role === "admin" ? [{ href: "/admin", label: "Admin" }] : []),
  ];
}
