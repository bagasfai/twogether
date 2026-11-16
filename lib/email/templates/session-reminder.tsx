import { Link, Text } from "@react-email/components";
import { EmailLayout } from "@/lib/email/templates/layout";
import type { EmailContext } from "@/lib/email/templates/registry";

export function SessionReminder({ ctx }: { ctx: EmailContext }) {
  return (
    <EmailLayout
      preview="Sesi kamu besok"
      heading="Sesi kamu besok"
      name={ctx.name}
      ctx={ctx}
      footer={
        <Text style={{ fontSize: "12px" }}>
          <Link href={ctx.profileUrl}>Tidak ingin menerima pengingat? Matikan di halaman profil.</Link>
        </Text>
      }
    >
      <Text>Pengingat: kamu terdaftar di sesi ini besok.</Text>
    </EmailLayout>
  );
}
