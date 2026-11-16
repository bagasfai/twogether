import { Text } from "@react-email/components";
import { EmailLayout } from "@/lib/email/templates/layout";
import type { EmailContext } from "@/lib/email/templates/registry";

export function WaitlistPromoted({ ctx }: { ctx: EmailContext }) {
  return (
    <EmailLayout preview="Kamu dapat slot" heading="Kamu dapat slot" name={ctx.name} ctx={ctx}>
      <Text>Ada slot kosong dan kamu naik dari daftar tunggu ke daftar peserta. Sampai jumpa di lapangan.</Text>
    </EmailLayout>
  );
}
