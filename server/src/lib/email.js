import nodemailer from 'nodemailer'
import { config } from '../config.js'

export function makeTransport() {
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

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

/* Turn the plain-text body an admin typed into a simple branded HTML email and
   a matching text version, each with an unsubscribe footer. Blank lines start a
   new paragraph; single newlines become <br>. */
export function renderBroadcast({ subject, body, unsubUrl }) {
  const paras = String(body)
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
  const htmlBody = paras
    .map((p) => `<p style="margin:0 0 1em;line-height:1.55">${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('')
  const html = `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;background:#f4f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#15212e">
  <div style="max-width:600px;margin:0 auto;padding:24px">
    <div style="font-weight:800;color:#0a2342;margin-bottom:16px">Honor Your Commitment</div>
    <div style="background:#fff;border:1px solid #dde4ec;border-radius:10px;padding:24px">
      <h1 style="font-size:1.25rem;color:#0a2342;margin:0 0 16px">${esc(subject)}</h1>
      ${htmlBody}
    </div>
    <p style="color:#8595a8;font-size:12px;margin:16px 4px 0;line-height:1.5">
      You are receiving this because you asked to be kept informed about this campaign.
      <a href="${esc(unsubUrl)}" style="color:#8595a8">Unsubscribe</a>.
    </p>
  </div>
</body></html>`
  const text = `${paras.join('\n\n')}\n\n— Honor Your Commitment\n\nUnsubscribe: ${unsubUrl}`
  return { html, text }
}

// Send a single broadcast message on an existing transport (so the connection
// is reused across a run). Adds RFC 8058 one-click unsubscribe headers.
export function sendBroadcastMessage(transport, { to, subject, html, text, unsubUrl }) {
  return transport.sendMail({
    from: config.email.from,
    replyTo: config.email.replyTo || undefined,
    to,
    subject,
    html,
    text,
    headers: {
      'List-Unsubscribe': `<${unsubUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
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
