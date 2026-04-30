import * as React from 'react';
import {
  EmailButton,
  EmailHeading,
  EmailLayout,
  EmailMuted,
  EmailText,
} from './EmailLayout';

export interface WelcomeEmailProps {
  name: string;
  dashboardUrl: string;
}

export function WelcomeEmail({ name, dashboardUrl }: WelcomeEmailProps) {
  return (
    <EmailLayout preview="Welcome to AI Aggregator — let's get you started">
      <EmailHeading>Welcome, {name}!</EmailHeading>
      <EmailText>
        Your account is ready. One API key gets you Banana, Veo, Kling and more behind a
        single stable contract — billed transparently in USD.
      </EmailText>
      <EmailButton href={dashboardUrl}>Open dashboard</EmailButton>
      <EmailText>From the dashboard you can:</EmailText>
      <ul style={list}>
        <li style={listItem}>Create your first API key</li>
        <li style={listItem}>Top up your balance (from $5)</li>
        <li style={listItem}>Try a request in the API explorer</li>
      </ul>
      <EmailMuted>Need help? Reply to this email and we'll get back to you.</EmailMuted>
    </EmailLayout>
  );
}

const list: React.CSSProperties = {
  margin: '8px 0 14px',
  padding: '0 0 0 20px',
  fontSize: 14,
  lineHeight: '22px',
  color: '#f8fafc',
};

const listItem: React.CSSProperties = {
  margin: '4px 0',
};

export default WelcomeEmail;
