import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <>
      <section className="flex flex-1 flex-col justify-center px-6 py-20 md:py-28">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          <p className="text-sm font-medium text-accent">West Jakarta · badminton community</p>
          <h1 className="text-[clamp(2.5rem,4vw+1rem,4.25rem)] font-semibold leading-[1.05] tracking-tight text-balance">
            Court time, sorted before you show up.
          </h1>
          <p className="max-w-[42ch] text-lg text-muted-foreground">
            Registration, waitlist, check-in, and rotation for Jakbar Twogether sessions —
            no more counting names in a WhatsApp thread.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button asChild size="lg">
              <Link href="/sessions">See upcoming sessions</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/signup">Join the community</Link>
            </Button>
          </div>
        </div>
      </section>

      <hr className="border-t-2 border-border" />

      <section className="px-6 py-16">
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">What&rsquo;s running</h2>
          <p className="max-w-[52ch] text-base">
            Every session — open registration, waitlist status, courts — lives on one
            page.{" "}
            <Link href="/sessions" className="font-medium text-accent hover:underline">
              Browse upcoming sessions →
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}
