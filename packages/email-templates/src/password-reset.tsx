import * as React from 'react';
import {
  EmailButton,
  EmailHeading,
  EmailLayout,
  EmailMuted,
  EmailText,
  EmailUrlBox,
} from './EmailLayout';

export interface PasswordResetEmailProps {
  name: string;
  resetUrl: string;
  ttlHours?: number;
}

export function PasswordResetEmail({
  name,
  resetUrl,
  ttlHours = 1,
}: PasswordResetEmailProps) {
  return (
    <EmailLayout preview="Reset your Aigenway password">
      <EmailHeading>Reset your password</EmailHeading>
      <EmailText>Hi {name},</EmailText>
      <EmailText>
        Someone requested a password reset for your Aigenway account. Click the button
        below to choose a new password. The link expires in {ttlHours} hour
        {ttlHours === 1 ? '' : 's'}.
      </EmailText>
      <EmailButton href={resetUrl}>Reset password</EmailButton>
      <EmailText>If the button doesn't work, paste this link into your browser:</EmailText>
      <EmailUrlBox url={resetUrl} />
      <EmailMuted>
        If you didn't request a password reset, you can safely ignore this email — your
        password will not change.
      </EmailMuted>
    </EmailLayout>
  );
}

export default PasswordResetEmail;
