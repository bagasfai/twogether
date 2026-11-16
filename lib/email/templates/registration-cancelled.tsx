import { Text } from "@react-email/components";
import { EmailLayout } from "@/lib/email/templates/layout";
import type { EmailContext } from "@/lib/email/templates/registry";

export function RegistrationCancelled({ ctx }: { ctx: EmailContext }) {
  return (
    <EmailLayout preview="Pendaftaran kamu dibatalkan" heading="Pendaftaran kamu dibatalkan" name={ctx.name} ctx={ctx}>
      <Text>Pendaftaran kamu di sesi ini sudah dibatalkan. Kamu bisa mendaftar lagi selama sesi masih dibuka.</Text>
    </EmailLayout>
  );
}
