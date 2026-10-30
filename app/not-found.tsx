import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex flex-1 flex-col items-center justify-center gap-3 px-6 py-24 text-center">
      <h1 className="font-display text-8xl font-extrabold italic leading-none tracking-tight text-sky-deep">404</h1>
      <p className="text-muted-foreground">We could not find that page.</p>
      <Link href="/" className={buttonVariants()}>
        Back to home
      </Link>
    </main>
  );
}
