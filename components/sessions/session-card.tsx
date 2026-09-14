import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PublicSession } from "@/lib/dal/public-sessions";

export function SessionCard({ session }: { session: PublicSession }) {
  return (
    <Card className="transition-[transform,border-color] duration-[var(--dur-short)] ease-[var(--ease-out)] hover:-translate-y-0.5 hover:border-accent/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link href={`/sessions/${session.id}`} className="hover:underline">
            {session.title}
          </Link>
          {session.registrationState === "open" ? (
            <Badge variant="success">Registration open</Badge>
          ) : (
            <Badge variant="outline">Registration closed</Badge>
          )}
        </CardTitle>
        <CardDescription>
          {new Date(session.startsAt).toLocaleString()} · {session.location}
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        {/* capacity, not spots remaining -- see the comment on the detail page */}
        <span className="font-mono tabular-nums">
          {session.maxParticipants} spots · {session.waitlistCapacity} waitlist · {session.courtCount} courts
        </span>
      </CardContent>
    </Card>
  );
}
