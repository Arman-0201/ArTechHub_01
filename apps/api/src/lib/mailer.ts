import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from './logger.js';

/**
 * Mail delivery.
 *
 * `console` transport writes the message (including the action link) to the log
 * so the whole verification/reset flow is testable locally with no SMTP server.
 * `assertProductionSecrets` refuses to boot production with that transport.
 */

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? 587,
    secure: env.SMTP_SECURE,
    auth:
      env.SMTP_USER && env.SMTP_PASSWORD
        ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
        : undefined,
  });
  return transporter;
}

export async function sendMail(message: MailMessage): Promise<void> {
  if (env.MAIL_TRANSPORT === 'console') {
    logger.info(
      { to: message.to, subject: message.subject, preview: message.text },
      'Outgoing email (console transport)',
    );
    return;
  }

  try {
    await getTransporter().sendMail({
      from: env.MAIL_FROM,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
  } catch (error) {
    // Delivery failure must not turn a successful registration into a 500 —
    // the user can always request another email.
    logger.error({ err: error, to: message.to }, 'Failed to send email');
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function layout(title: string, bodyHtml: string): string {
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    `<title>${escapeHtml(title)}</title></head>`,
    '<body style="margin:0;padding:32px 16px;background:#f5f7fb;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#091540;">',
    '<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;padding:40px;box-shadow:0 8px 32px rgba(9,21,64,0.08);">',
    bodyHtml,
    '<hr style="border:none;border-top:1px solid #e6ebf5;margin:32px 0 16px;">',
    '<p style="font-size:12px;color:#68738f;margin:0;">If you did not request this email you can safely ignore it.</p>',
    '</div></body></html>',
  ].join('');
}

function button(label: string, url: string): string {
  return [
    `<a href="${escapeHtml(url)}"`,
    'style="display:inline-block;background:#1B2CC1;color:#ffffff;text-decoration:none;',
    'padding:14px 28px;border-radius:10px;font-weight:600;font-size:15px;">',
    `${escapeHtml(label)}</a>`,
  ].join('');
}

export function buildVerificationEmail(name: string, url: string, siteName: string): MailMessage {
  return {
    to: '',
    subject: `Verify your ${siteName} account`,
    html: layout(
      'Verify your email',
      [
        `<h1 style="font-size:22px;margin:0 0 16px;">Welcome, ${escapeHtml(name)}</h1>`,
        `<p style="line-height:1.6;margin:0 0 24px;color:#3c4663;">Confirm your email address to activate your ${escapeHtml(siteName)} account and start learning.</p>`,
        button('Verify email address', url),
        `<p style="font-size:13px;color:#68738f;margin:24px 0 0;">This link expires in 24 hours.</p>`,
      ].join(''),
    ),
    text: `Welcome, ${name}. Verify your email address: ${url} (expires in 24 hours)`,
  };
}

export function buildPasswordResetEmail(name: string, url: string, siteName: string): MailMessage {
  return {
    to: '',
    subject: `Reset your ${siteName} password`,
    html: layout(
      'Reset your password',
      [
        `<h1 style="font-size:22px;margin:0 0 16px;">Password reset</h1>`,
        `<p style="line-height:1.6;margin:0 0 24px;color:#3c4663;">Hi ${escapeHtml(name)}, use the button below to choose a new password.</p>`,
        button('Choose a new password', url),
        `<p style="font-size:13px;color:#68738f;margin:24px 0 0;">This link expires in 1 hour and can be used once.</p>`,
      ].join(''),
    ),
    text: `Password reset for ${name}: ${url} (expires in 1 hour)`,
  };
}

export function buildOtpEmail(name: string, code: string, siteName: string): MailMessage {
  return {
    to: '',
    subject: `Your ${siteName} verification code`,
    html: layout(
      'Verification code',
      [
        `<h1 style="font-size:22px;margin:0 0 16px;">Your verification code</h1>`,
        `<p style="line-height:1.6;margin:0 0 24px;color:#3c4663;">Hi ${escapeHtml(name)}, enter this code to continue.</p>`,
        `<p style="font-size:34px;letter-spacing:10px;font-weight:700;margin:0 0 8px;color:#1B2CC1;">${escapeHtml(code)}</p>`,
        `<p style="font-size:13px;color:#68738f;margin:16px 0 0;">The code expires in 10 minutes.</p>`,
      ].join(''),
    ),
    text: `Your ${siteName} verification code is ${code}. It expires in 10 minutes.`,
  };
}

export function buildContactNotificationEmail(
  payload: { name: string; email: string; subject: string; message: string },
  siteName: string,
): MailMessage {
  return {
    to: '',
    subject: `[${siteName}] ${payload.subject}`,
    html: layout(
      'New contact message',
      [
        '<h1 style="font-size:20px;margin:0 0 16px;">New contact message</h1>',
        `<p style="margin:0 0 8px;"><strong>From:</strong> ${escapeHtml(payload.name)} (${escapeHtml(payload.email)})</p>`,
        `<p style="margin:0 0 16px;"><strong>Subject:</strong> ${escapeHtml(payload.subject)}</p>`,
        `<p style="white-space:pre-wrap;line-height:1.6;color:#3c4663;">${escapeHtml(payload.message)}</p>`,
      ].join(''),
    ),
    text: `From: ${payload.name} <${payload.email}>\nSubject: ${payload.subject}\n\n${payload.message}`,
  };
}
