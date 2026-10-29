import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { CourtLines } from "@/components/marketing/court-lines";

// Signed-out utility screens: the sky court field, the logo sticker, one white
// card. The caller supplies the main landmark. Not localized (these routes sit outside app/[locale]).
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="court-field relative isolate flex flex-1 flex-col items-center justify-center gap-6 overflow-hidden p-6"
    >
      <CourtLines className="absolute inset-0 -z-10 size-full text-white/20" />
      <Link
        href="/"
        className="rounded-3xl outline-none focus-visible:ring-[3px] focus-visible:ring-white"
      >
        <Image
          src="/brand/jakbar-twogether.jpeg"
          alt="Jakbar Twogether"
          width={112}
          height={112}
          className="size-28 -rotate-3 rounded-3xl border-4 border-white object-cover shadow-[0_16px_32px_-12px_oklch(20%_0.13_264/0.7)]"
        />
      </Link>
      {children}
    </div>
  );
}
