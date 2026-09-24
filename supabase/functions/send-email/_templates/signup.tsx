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

interface SignUpEmailProps {
  fullName: string | null;
  confirmUrl: string;
}

export const SignUpEmail = ({ fullName, confirmUrl }: SignUpEmailProps) => (
  <Html lang="id">
    <Head />
    <Preview>Konfirmasi email untuk mulai pakai Jakbar Twogether</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>Jakbar Twogether</Text>
        <Heading style={h1}>Konfirmasi email kamu</Heading>
        <Text style={text}>
          Hai{fullName ? ` ${fullName}` : ""}, terima kasih sudah daftar. Klik tombol di bawah
          untuk mengonfirmasi email dan mulai daftar sesi badminton.
        </Text>
        <Link href={confirmUrl} target="_blank" style={button}>
          Konfirmasi email
        </Link>
        <Text style={mutedText}>
          Atau salin tautan ini ke browser: <br />
          {confirmUrl}
        </Text>
        <Hr style={hr} />
        <Text style={mutedText}>
          Kalau kamu tidak merasa mendaftar, abaikan saja email ini.
        </Text>
      </Container>
    </Body>
  </Html>
);

SignUpEmail.PreviewProps = {
  fullName: "Bagas",
  confirmUrl: "https://twogether.example.com/auth/confirm?token_hash=abc123&type=email&next=/dashboard",
} as SignUpEmailProps;

export default SignUpEmail;

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
