import type { ReactNode } from "react";
import { Body, Button, Container, Head, Heading, Html, Preview, Text } from "@react-email/components";
import type { EmailContext } from "@/lib/email/templates/registry";

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(iso));
}

type EmailLayoutProps = {
  preview: string;
  heading: string;
  name: string | null;
  ctx: EmailContext;
  children?: ReactNode;
  cta?: boolean;
  footer?: ReactNode;
};

export function EmailLayout({ preview, heading, name, ctx, children, cta = true, footer }: EmailLayoutProps) {
  return (
    <Html lang="id">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: "#f6f6f6", fontFamily: "Arial, sans-serif" }}>
        <Container style={{ backgroundColor: "#ffffff", padding: "24px", maxWidth: "480px" }}>
          <Heading as="h1" style={{ fontSize: "20px" }}>
            {heading}
          </Heading>
          <Text>{`Halo${name ? ` ${name}` : ""},`}</Text>
          {children}
          <Text style={{ margin: "16px 0" }}>
            <strong>{ctx.sessionTitle}</strong>
            <br />
            {formatDateTime(ctx.startsAt)}
            <br />
            {ctx.location}
          </Text>
          {cta ? (
            <Button
              href={ctx.sessionUrl}
              style={{ backgroundColor: "#111111", color: "#ffffff", padding: "10px 16px", borderRadius: "6px" }}
            >
              Lihat sesi
            </Button>
          ) : null}
          {footer}
        </Container>
      </Body>
    </Html>
  );
}
