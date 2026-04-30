import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

/**
 * Shared dark-themed email shell. Mirrors the site palette:
 * - body bg matches www.aigenway.com `--background`
 * - inner card matches `--card` (slightly lighter)
 * - info-blue accent for buttons/links matches `--info`
 *
 * Email-client gotchas we work around:
 * - Inline styles only (no CSS classes; many clients strip them).
 * - HEX colors only (no oklch/hsl).
 * - System font stack (no @font-face).
 * - color-scheme meta so Apple Mail / Outlook render as designed.
 */

export interface EmailLayoutProps {
  preview: string;
  children: React.ReactNode;
}

export function EmailLayout({ preview, children }: EmailLayoutProps) {
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="dark light" />
        <meta name="supported-color-schemes" content="dark light" />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={outer}>
          {/* Brand header */}
          <Section style={header}>
            <table cellPadding={0} cellSpacing={0} style={headerTable}>
              <tbody>
                <tr>
                  <td style={brandLogo}>✦</td>
                  <td style={brandName}>AI Aggregator</td>
                </tr>
              </tbody>
            </table>
          </Section>

          {/* Card */}
          <Section style={card}>{children}</Section>

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              You're receiving this because you have an account at{' '}
              <Link href="https://www.aigenway.com" style={footerLink}>
                aigenway.com
              </Link>
              .
            </Text>
            <Hr style={footerHr} />
            <Text style={footerSmall}>
              © {new Date().getFullYear()} AI API Aggregator · Single API gateway over leading
              AI providers.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

/** Primary CTA button. Use as `<EmailButton href={url}>Label</EmailButton>`. */
export function EmailButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <table cellPadding={0} cellSpacing={0} style={{ margin: '24px 0' }}>
      <tbody>
        <tr>
          <td style={buttonOuter}>
            <Link href={href} style={buttonInner}>
              {children}
            </Link>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/** Heading at the top of the card. */
export function EmailHeading({ children }: { children: React.ReactNode }) {
  return <h1 style={h1}>{children}</h1>;
}

/** Standard body paragraph. */
export function EmailText({ children }: { children: React.ReactNode }) {
  return <p style={p}>{children}</p>;
}

/** Muted small print (used for "if you didn't request..." disclaimers). */
export function EmailMuted({ children }: { children: React.ReactNode }) {
  return <p style={muted}>{children}</p>;
}

/** Boxed "code-style" pre-block, useful for fallback URLs. */
export function EmailUrlBox({ url }: { url: string }) {
  return (
    <Text style={urlBox}>
      <Link href={url} style={urlLink}>
        {url}
      </Link>
    </Text>
  );
}

// ---- Palette (must match apps/web/src/app/globals.css `.dark`) ----
const COLORS = {
  bg: '#08101a', // ~ hsl(224 47% 5%)
  card: '#10141d', // ~ hsl(224 30% 8%)
  border: '#1f2937', // ~ hsl(217 25% 18%)
  fg: '#f8fafc',
  muted: '#9ca8b8',
  info: '#3b82f6',
  infoFg: '#ffffff',
  brand: '#60a5fa',
};

const body: React.CSSProperties = {
  margin: 0,
  padding: 0,
  backgroundColor: COLORS.bg,
  color: COLORS.fg,
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
};

const outer: React.CSSProperties = {
  margin: '0 auto',
  padding: '32px 16px',
  maxWidth: 560,
};

const header: React.CSSProperties = {
  marginBottom: 16,
};

const headerTable: React.CSSProperties = {
  borderCollapse: 'collapse',
};

const brandLogo: React.CSSProperties = {
  width: 28,
  height: 28,
  paddingRight: 8,
  textAlign: 'center',
  verticalAlign: 'middle',
  fontSize: 16,
  color: COLORS.brand,
  backgroundColor: 'rgba(59,130,246,0.15)',
  borderRadius: 6,
  fontWeight: 700,
  lineHeight: '28px',
};

const brandName: React.CSSProperties = {
  paddingLeft: 10,
  verticalAlign: 'middle',
  fontSize: 14,
  fontWeight: 600,
  color: COLORS.fg,
  letterSpacing: '-0.01em',
};

const card: React.CSSProperties = {
  backgroundColor: COLORS.card,
  borderRadius: 10,
  padding: '32px 28px',
  border: `1px solid ${COLORS.border}`,
};

const h1: React.CSSProperties = {
  margin: '0 0 16px',
  fontSize: 22,
  fontWeight: 600,
  lineHeight: '28px',
  color: COLORS.fg,
  letterSpacing: '-0.01em',
};

const p: React.CSSProperties = {
  margin: '0 0 14px',
  fontSize: 14,
  lineHeight: '22px',
  color: COLORS.fg,
};

const muted: React.CSSProperties = {
  margin: '20px 0 0',
  fontSize: 12,
  lineHeight: '18px',
  color: COLORS.muted,
};

const buttonOuter: React.CSSProperties = {
  borderRadius: 8,
  backgroundColor: COLORS.info,
  textAlign: 'center',
  padding: 0,
};

const buttonInner: React.CSSProperties = {
  display: 'inline-block',
  padding: '12px 22px',
  color: COLORS.infoFg,
  fontSize: 14,
  fontWeight: 600,
  textDecoration: 'none',
  letterSpacing: '-0.005em',
};

const urlBox: React.CSSProperties = {
  margin: '12px 0 0',
  padding: '10px 12px',
  fontSize: 12,
  lineHeight: '18px',
  fontFamily: 'ui-monospace,SFMono-Regular,Menlo,Monaco,"Cascadia Code","Source Code Pro",monospace',
  color: COLORS.muted,
  backgroundColor: COLORS.bg,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 6,
  wordBreak: 'break-all',
};

const urlLink: React.CSSProperties = {
  color: COLORS.brand,
  textDecoration: 'none',
};

const footer: React.CSSProperties = {
  marginTop: 24,
  padding: '0 4px',
};

const footerText: React.CSSProperties = {
  margin: '0 0 8px',
  fontSize: 12,
  lineHeight: '18px',
  color: COLORS.muted,
};

const footerLink: React.CSSProperties = {
  color: COLORS.brand,
  textDecoration: 'none',
};

const footerHr: React.CSSProperties = {
  margin: '12px 0',
  border: 'none',
  borderTop: `1px solid ${COLORS.border}`,
};

const footerSmall: React.CSSProperties = {
  margin: 0,
  fontSize: 11,
  lineHeight: '16px',
  color: COLORS.muted,
};
