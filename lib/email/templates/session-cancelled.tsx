import { Text } from "@react-email/components";
import { EmailLayout } from "@/lib/email/templates/layout";
import type { EmailContext } from "@/lib/email/templates/registry";

export function SessionCancelled({ ctx }: { ctx: EmailContext }) {
  return (
    <EmailLayout preview="Sesi dibatalkan" heading="Sesi dibatalkan" name={ctx.name} ctx={ctx} cta={false}>
      <Text>Sesi ini dibatalkan oleh host. Pendaftaran kamu tidak berlaku lagi.</Text>
    </EmailLayout>
  );
}
