import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

export interface VerifyEmailProps {
  name: string;
  verifyUrl: string;
}

export function VerifyEmail({ name, verifyUrl }: VerifyEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Confirm your email address for AI API Aggregator</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Hi {name},</Heading>
          <Section>
            <Text style={text}>
              Welcome to AI API Aggregator. Please confirm your email address by clicking the link
              below.
            </Text>
            <Text style={text}>
              <Link href={verifyUrl} style={button}>
                Verify email
              </Link>
            </Text>
            <Text style={muted}>If you did not create this account, you can ignore this email.</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const main: React.CSSProperties = {
  backgroundColor: '#f6f9fc',
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
};

const container: React.CSSProperties = {
  margin: '40px auto',
  padding: '24px',
  maxWidth: '480px',
  backgroundColor: '#ffffff',
  borderRadius: '8px',
};

const h1: React.CSSProperties = {
  fontSize: '20px',
  fontWeight: 600,
  margin: '0 0 16px',
  color: '#111',
};

const text: React.CSSProperties = {
  fontSize: '14px',
  lineHeight: '22px',
  color: '#444',
};

const muted: React.CSSProperties = {
  ...text,
  color: '#999',
  fontSize: '12px',
};

const button: React.CSSProperties = {
  display: 'inline-block',
  padding: '10px 18px',
  backgroundColor: '#111',
  color: '#fff',
  textDecoration: 'none',
  borderRadius: '6px',
  fontWeight: 500,
};

export default VerifyEmail;
