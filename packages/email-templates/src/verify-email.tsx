import * as React from 'react';
import {
  EmailButton,
  EmailHeading,
  EmailLayout,
  EmailMuted,
  EmailText,
  EmailUrlBox,
} from './EmailLayout';

export interface VerifyEmailProps {
  name: string;
  verifyUrl: string;
}

export function VerifyEmail({ name, verifyUrl }: VerifyEmailProps) {
  return (
    <EmailLayout preview="Confirm your email — AI Aggregator">
      <EmailHeading>Confirm your email</EmailHeading>
      <EmailText>Hi {name},</EmailText>
      <EmailText>
        Welcome to AI Aggregator. Tap the button below to activate your account and start
        making API calls.
      </EmailText>
      <EmailButton href={verifyUrl}>Verify email</EmailButton>
      <EmailText>If the button doesn't work, paste this link into your browser:</EmailText>
      <EmailUrlBox url={verifyUrl} />
      <EmailMuted>
        If you didn't create an account, you can safely ignore this email.
      </EmailMuted>
    </EmailLayout>
  );
}

export default VerifyEmail;
