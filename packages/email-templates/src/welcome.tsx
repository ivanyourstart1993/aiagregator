import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

export interface WelcomeEmailProps {
  name: string;
  dashboardUrl: string;
}

export function WelcomeEmail({ name, dashboardUrl }: WelcomeEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Welcome to AI API Aggregator</Preview>
      <Body style={{ fontFamily: 'sans-serif', backgroundColor: '#f6f9fc' }}>
        <Container style={{ margin: '40px auto', padding: '24px', maxWidth: 480, background: '#fff', borderRadius: 8 }}>
          <Heading>Welcome, {name}!</Heading>
          <Section>
            <Text>Your account is ready. Open your dashboard to create an API key and explore the docs.</Text>
            <Text>
              <a href={dashboardUrl}>Open dashboard</a>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default WelcomeEmail;
