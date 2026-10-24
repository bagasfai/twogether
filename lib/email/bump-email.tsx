import { Body, Button, Container, Head, Heading, Html, Preview, Text } from "@react-email/components";

export type BumpEmailProps = {
  name: string | null;
  sessionTitle: string;
  startsAt: string;
  sessionUrl: string;
};

function formatStart(startsAt: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(startsAt));
}

export function BumpEmail({ name, sessionTitle, startsAt, sessionUrl }: BumpEmailProps) {
  return (
    <Html lang="id">
      <Head />
      <Preview>Kamu dipindah ke daftar tunggu {sessionTitle}</Preview>
      <Body style={{ backgroundColor: "#f6f6f6", fontFamily: "Arial, sans-serif" }}>
        <Container style={{ backgroundColor: "#ffffff", padding: "24px", maxWidth: "480px" }}>
          <Heading as="h1" style={{ fontSize: "20px" }}>
            Kamu dipindah ke daftar tunggu
          </Heading>
          <Text>Halo{name ? ` ${name}` : ""},</Text>
          <Text>
            Slot kamu di sesi {sessionTitle} ({formatStart(startsAt)}) diambil oleh anggota premium yang baru
            bergabung, sehingga kamu dipindah ke daftar tunggu.
          </Text>
          <Text>
            Kamu tetap berada di urutan pertama di antara anggota reguler. Kalau ada slot kosong, kamu akan
            otomatis naik ke daftar peserta.
          </Text>
          <Button
            href={sessionUrl}
            style={{ backgroundColor: "#111111", color: "#ffffff", padding: "10px 16px", borderRadius: "6px" }}
          >
            Lihat sesi
          </Button>
        </Container>
      </Body>
    </Html>
  );
}
