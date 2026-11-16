import { Text } from "@react-email/components";
import { EmailLayout } from "@/lib/email/templates/layout";
import type { EmailContext } from "@/lib/email/templates/registry";

export function RegistrationWaitlisted({ ctx }: { ctx: EmailContext }) {
  const position = ctx.payload.waitlist_position;
  return (
    <EmailLayout preview="Kamu masuk daftar tunggu" heading="Kamu masuk daftar tunggu" name={ctx.name} ctx={ctx}>
      <Text>Sesi ini sudah penuh, jadi kamu masuk daftar tunggu. Kalau ada slot kosong, kamu akan otomatis naik.</Text>
      {typeof position === "number" ? <Text>{`Urutan daftar tunggu: ${position}`}</Text> : null}
    </EmailLayout>
  );
}
