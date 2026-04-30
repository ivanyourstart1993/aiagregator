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

export interface PasswordResetEmailProps {
  name: string;
  resetUrl: string;
  ttlHours?: number;
}

export function PasswordResetEmail({ name, resetUrl, ttlHours = 1 }: PasswordResetEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Reset your AI API Aggregator password</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Hi {name},</Heading>
          <Section>
            <Text style={text}>
              Someone requested a password reset for your AI API Aggregator account. Click the
              button below to choose a new password. The link expires in {ttlHours} hour
              {ttlHours === 1 ? '' : 's'}.
            </Text>
            <Text style={text}>
              <Link href={resetUrl} style={button}>
                Reset password
              </Link>
            </Text>
            <Text style={muted}>
              If you did not request a password reset, you can safely ignore this email — your
              password will not change.
            </Text>
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

export default PasswordResetEmail;
