import { Text } from "@react-email/components";
import { EmailLayout } from "@/lib/email/templates/layout";
import type { EmailContext } from "@/lib/email/templates/registry";

export function RegistrationConfirmed({ ctx }: { ctx: EmailContext }) {
  return (
    <EmailLayout preview="Pendaftaran kamu terkonfirmasi" heading="Pendaftaran kamu terkonfirmasi" name={ctx.name} ctx={ctx}>
      <Text>Kamu terdaftar di sesi ini. Sampai jumpa di lapangan.</Text>
    </EmailLayout>
  );
}
