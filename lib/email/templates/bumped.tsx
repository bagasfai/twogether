import { Text } from "@react-email/components";
import { EmailLayout } from "@/lib/email/templates/layout";
import type { EmailContext } from "@/lib/email/templates/registry";

export function Bumped({ ctx }: { ctx: EmailContext }) {
  return (
    <EmailLayout
      preview={`Kamu dipindah ke daftar tunggu ${ctx.sessionTitle}`}
      heading="Kamu dipindah ke daftar tunggu"
      name={ctx.name}
      ctx={ctx}
    >
      <Text>
        Slot kamu di sesi {ctx.sessionTitle} diambil oleh anggota premium yang baru bergabung, sehingga kamu dipindah
        ke daftar tunggu.
      </Text>
      <Text>
        Kamu tetap berada di urutan pertama di antara anggota reguler. Kalau ada slot kosong, kamu akan otomatis naik
        ke daftar peserta.
      </Text>
    </EmailLayout>
  );
}
