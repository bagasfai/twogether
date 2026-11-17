import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Text,
} from "npm:@react-email/components@^1";
import * as React from "npm:react@^19";

interface RecoveryEmailProps {
  fullName: string | null;
  resetUrl: string;
}

export const RecoveryEmail = ({ fullName, resetUrl }: RecoveryEmailProps) => (
  <Html lang="id">
    <Head />
    <Preview>Atur ulang kata sandi akun Jakbar Twogether kamu</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>Jakbar Twogether</Text>
        <Heading style={h1}>Atur ulang kata sandi</Heading>
        <Text style={text}>
          Hai{fullName ? ` ${fullName}` : ""}, kami menerima permintaan untuk mengatur ulang kata
          sandi akun kamu. Klik tombol di bawah untuk membuat kata sandi baru. Tautan ini berlaku
          selama 1 jam dan hanya bisa dipakai sekali.
        </Text>
        <Link href={resetUrl} target="_blank" style={button}>
          Buat kata sandi baru
        </Link>
        <Text style={mutedText}>
          Atau salin tautan ini ke browser: <br />
          {resetUrl}
        </Text>
        <Hr style={hr} />
        <Text style={mutedText}>
          Kalau kamu tidak meminta ini, abaikan saja email ini. Kata sandi kamu tidak berubah.
        </Text>
      </Container>
    </Body>
  </Html>
);

RecoveryEmail.PreviewProps = {
  fullName: "Bagas",
  resetUrl: "https://twogether.example.com/auth/confirm?token_hash=abc123&type=recovery",
} as RecoveryEmailProps;

export default RecoveryEmail;

const main = {
  backgroundColor: "#f4f6f5",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  padding: "24px 0",
};

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "32px",
  borderRadius: "8px",
  maxWidth: "480px",
};

const brand = {
  color: "#15803d",
  fontSize: "14px",
  fontWeight: "700",
  letterSpacing: "0.02em",
  textTransform: "uppercase" as const,
  margin: "0 0 16px",
};

const h1 = {
  color: "#111827",
  fontSize: "22px",
  fontWeight: "700",
  margin: "0 0 16px",
};

const text = {
  color: "#374151",
  fontSize: "15px",
  lineHeight: "24px",
  margin: "0 0 24px",
};

const button = {
  backgroundColor: "#15803d",
  borderRadius: "6px",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "15px",
  fontWeight: "600",
  padding: "12px 20px",
  textDecoration: "none",
  marginBottom: "16px",
};

const mutedText = {
  color: "#6b7280",
  fontSize: "13px",
  lineHeight: "20px",
  wordBreak: "break-all" as const,
};

const hr = {
  borderColor: "#e5e7eb",
  margin: "24px 0 16px",
};
