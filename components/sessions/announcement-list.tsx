import { AnnouncementForm } from "@/components/sessions/announcement-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AnnouncementRow } from "@/lib/dal/announcements";
import { formatDateTime } from "@/lib/format/datetime";

export function AnnouncementList({
  sessionId,
  announcements,
}: {
  sessionId: string | null;
  announcements: AnnouncementRow[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-2xl font-bold uppercase italic leading-none tracking-tight">Announcements</h2>
        <AnnouncementForm sessionId={sessionId} />
      </div>

      {announcements.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing posted yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {announcements.map((announcement) => (
            <Card key={announcement.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle>{announcement.title}</CardTitle>
                  <AnnouncementForm sessionId={sessionId} announcement={announcement} />
                </div>
                <CardDescription>{formatDateTime(announcement.publishedAt)}</CardDescription>
              </CardHeader>
              <CardContent className="whitespace-pre-wrap text-sm">{announcement.body}</CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
