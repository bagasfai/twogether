import { Body, Container, Head, Heading, Hr, Html, Link, Preview, Text } from "@react-email/components";

export type PartnerInquiryEmailProps = {
  name: string;
  organisation: string;
  email: string;
  whatsapp: string;
  inquiryType: string;
  message: string;
  adminUrl: string | null;
};

export function PartnerInquiryEmail(p: PartnerInquiryEmailProps) {
  const waDigits = p.whatsapp.replace(/\D/g, "");
  return (
    <Html lang="en">
      <Head />
      <Preview>
        New partner inquiry from {p.organisation} ({p.inquiryType})
      </Preview>
      <Body style={{ backgroundColor: "#f6f6f6", fontFamily: "Arial, sans-serif" }}>
        <Container style={{ backgroundColor: "#ffffff", padding: "24px", maxWidth: "560px" }}>
          <Heading as="h1" style={{ fontSize: "20px" }}>
            New partner inquiry
          </Heading>
          <Text>Name: {p.name}</Text>
          <Text>Organisation: {p.organisation}</Text>
          <Text>Email: {p.email}</Text>
          <Text>WhatsApp: {p.whatsapp}</Text>
          <Text>Type: {p.inquiryType}</Text>
          <Text style={{ whiteSpace: "pre-wrap" }}>Message: {p.message}</Text>
          <Hr />
          <Text>
            <Link href={`mailto:${p.email}`}>Reply by email</Link>
            {" | "}
            <Link href={`https://wa.me/${waDigits}`}>Reply on WhatsApp</Link>
          </Text>
          {p.adminUrl ? (
            <Text>
              <Link href={p.adminUrl}>Open the admin inbox</Link>
            </Text>
          ) : null}
        </Container>
      </Body>
    </Html>
  );
}
