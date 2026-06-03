import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { isProduction } from '../config/env.js';

export type EmailConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
};

const normalizeEnv = (value: string | undefined): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
};

const normalizePassword = (password: string | undefined, host?: string, user?: string): string | undefined => {
  const trimmed = normalizeEnv(password);
  if (!trimmed) return undefined;

  // Gmail app passwords are often displayed with spaces (e.g. xxxx xxxx xxxx xxxx).
  // If the user pasted it with spaces, auth will fail. We only remove *internal* whitespace
  // for obvious Gmail setups.
  const looksLikeGmail =
    (host || '').toLowerCase().includes('gmail') ||
    (user || '').toLowerCase().endsWith('@gmail.com') ||
    (user || '').toLowerCase().endsWith('@googlemail.com');

  return looksLikeGmail ? trimmed.replace(/\s+/g, '') : trimmed;
};

const requiredInProd = (name: string): string | undefined => {
  const value = process.env[name];
  if (isProduction && (!value || value.trim().length === 0)) {
    throw new Error(`[DEBUG ERROR] Missing required email environment variable: ${name} — email will not work without it`);
  }
  return value;
};

export const getEmailConfig = (): EmailConfig | null => {
  const host = normalizeEnv(requiredInProd('EMAIL_HOST'));
  const portRaw = normalizeEnv(requiredInProd('EMAIL_PORT'));
  const user = normalizeEnv(requiredInProd('EMAIL_USER'));
  const pass = normalizePassword(requiredInProd('EMAIL_PASS'), host, user);

  // If any are missing in non-prod, treat email as disabled.
  if (!host || !portRaw || !user || !pass) {
    const missing = [];
    if (!host) missing.push('EMAIL_HOST');
    if (!portRaw) missing.push('EMAIL_PORT');
    if (!user) missing.push('EMAIL_USER');
    if (!pass) missing.push('EMAIL_PASS');
    console.warn(`[DEBUG ERROR] Email not configured — missing: ${missing.join(', ')}. Emails will be silently skipped.`);
    return null;
  }

  const port = Number(portRaw);
  const secure = (process.env.EMAIL_SECURE || '').toLowerCase() === 'true' || port === 465;
  const from = normalizeEnv(process.env.EMAIL_FROM) || user;

  console.log(`[OK] Email configured — host: ${host}, port: ${port}, secure: ${secure}, from: ${from}, user: ${user}`);
  return { host, port, secure, user, pass, from };
};

let cachedTransporter: Transporter | null = null;

export const getMailer = (): Transporter | null => {
  if (cachedTransporter) return cachedTransporter;

  const cfg = getEmailConfig();
  if (!cfg) return null;

  cachedTransporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: {
      user: cfg.user,
      pass: cfg.pass
    },
    // Encourage TLS when not using SMTPS(465)
    requireTLS: !cfg.secure,
    tls: {
      minVersion: 'TLSv1.2'
    }
  });

  return cachedTransporter;
};

export const sendMail = async (args: {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}) => {
  const transporter = getMailer();
  const cfg = getEmailConfig();

  if (!transporter || !cfg) {
    throw new Error('Email is not configured');
  }

  return transporter.sendMail({
    from: cfg.from,
    to: args.to,
    subject: args.subject,
    text: args.text,
    html: args.html
  });
};

export const trySendMail = (args: {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}) => {
  // Best-effort: callers may await this (recommended for serverless runtimes).
  return sendMail(args).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);

    if (/\b535\b/.test(message) || /BadCredentials/i.test(message)) {
      // eslint-disable-next-line no-console
      console.error(
        '[ERROR] Email auth failed (535 BadCredentials). If using Gmail/Google Workspace, use an App Password (not your normal login password) and ensure EMAIL_USER is the full email address.'
      );
    }

    // In prod we still log the message so failures aren't silent.
    // In dev we log the full error for easier debugging.
    // eslint-disable-next-line no-console
    console.error('[ERROR] Email send failed:', isProduction ? message : error);
  });
};
