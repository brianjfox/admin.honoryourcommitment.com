import nodemailer from 'nodemailer'
import { config } from '../config.js'

function makeTransport() {
  if (!config.email.host) throw new Error('SMTP_HOST is not configured')
  return nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    secure: config.email.secure,
    auth:
      config.email.user || config.email.pass
        ? { user: config.email.user, pass: config.email.pass }
        : undefined,
  })
}

// Email a password-reset link. No-op (logs the link) when email is disabled.
export async function sendPasswordReset(to, url, log) {
  if (config.email.disabled) {
    log?.info({ to, url }, 'EMAIL DISABLED — password reset link')
    return
  }
  await makeTransport().sendMail({
    from: config.email.from,
    replyTo: config.email.replyTo || undefined,
    to,
    subject: 'Reset your admin password — Honor Your Commitment',
    text: `Reset your admin password using the link below (expires in 1 hour):\n\n${url}\n\nIf you didn't request this, you can ignore this email.`,
    html: `<p>Reset your admin password using the link below (expires in 1 hour):</p><p><a href="${url}">${url}</a></p><p>If you didn't request this, you can safely ignore this email.</p>`,
  })
}
