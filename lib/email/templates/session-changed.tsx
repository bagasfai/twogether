import { Text } from "@react-email/components";
import { EmailLayout, formatDateTime } from "@/lib/email/templates/layout";
import type { EmailContext } from "@/lib/email/templates/registry";

export function SessionChanged({ ctx }: { ctx: EmailContext }) {
  const { old_starts_at: oldStartsAt, old_location: oldLocation } = ctx.payload;
  return (
    <EmailLayout preview="Jadwal sesi berubah" heading="Jadwal sesi berubah" name={ctx.name} ctx={ctx}>
      <Text>Host mengubah jadwal atau lokasi sesi ini.</Text>
      <Text>
        <strong>Sebelumnya</strong>
        <br />
        {typeof oldStartsAt === "string" ? formatDateTime(oldStartsAt) : "-"}
        <br />
        {typeof oldLocation === "string" ? oldLocation : "-"}
      </Text>
      <Text>
        <strong>Sekarang</strong>
        <br />
        {formatDateTime(ctx.startsAt)}
        <br />
        {ctx.location}
      </Text>
    </EmailLayout>
  );
}
