import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SessionActionsMenu } from "@/components/sessions/session-actions-menu";
import type { HostedSession } from "@/lib/dal/sessions";
import { formatDateTime } from "@/lib/format/datetime";

export function HostedSessionsList({ sessions }: { sessions: HostedSession[] }) {
  return (
    <div className="flex flex-col gap-3">
      {sessions.map((session) => (
        <Card key={session.id}>
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <CardTitle>
                <Link href={`/sessions/${session.id}/manage`} className="inline-flex min-h-11 items-center underline-offset-4 hover:underline">{session.title}</Link>
              </CardTitle>
              <SessionActionsMenu session={session} />
            </div>
            <CardDescription>
              {formatDateTime(session.startsAt)} · {session.location}
            </CardDescription>
            <div className="flex flex-wrap gap-2 pt-1">
              <Badge variant={session.status === "live" ? "success" : "secondary"} className="capitalize">
                {session.status}
              </Badge>
              <Badge variant="outline">Registration {session.registrationState}</Badge>
            </div>
          </CardHeader>
          <CardContent className="text-sm tabular-nums text-muted-foreground">
            {session.maxParticipants} capacity · {session.waitlistCapacity} waitlist
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
