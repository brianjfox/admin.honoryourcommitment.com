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

/* Double opt-in confirmation copy — kept in sync with the public API's
   email.js so a resent link reads exactly like the original. */
const CONFIRM_COPY = {
  en: {
    subject: 'Please confirm — Portugal Must Honor Its Commitments',
    line1: 'Thank you for taking action.',
    line2:
      'Please confirm your submission by clicking the button below. Your record only counts once confirmed.',
    button: 'Confirm',
    ignore: "If you didn't make this request, you can safely ignore this email.",
  },
  pt: {
    subject: 'Confirme, por favor — Portugal Deve Honrar os Seus Compromissos',
    line1: 'Obrigado por agir.',
    line2:
      'Confirme a sua submissão clicando no botão abaixo. O seu registo só conta depois de confirmado.',
    button: 'Confirmar',
    ignore: 'Se não fez este pedido, pode ignorar este email com segurança.',
  },
  es: {
    subject: 'Confirme, por favor — Portugal Debe Honrar Sus Compromisos',
    line1: 'Gracias por actuar.',
    line2:
      'Confirme su envío haciendo clic en el botón de abajo. Su registro solo cuenta una vez confirmado.',
    button: 'Confirmar',
    ignore: 'Si no realizó esta solicitud, puede ignorar este correo.',
  },
  zh: {
    subject: '请确认 — 葡萄牙必须信守承诺',
    line1: '感谢您采取行动。',
    line2: '请点击下方按钮确认您的提交。您的记录仅在确认后才计入。',
    button: '确认',
    ignore: '如果您并未发起此请求，可以安全地忽略此邮件。',
  },
}

/* Resend a double opt-in confirmation link for one record. `url` points at the
   public API's /api/confirm. No-op (logs) when email is disabled. */
export async function sendConfirmation(to, url, locale, log) {
  const c = CONFIRM_COPY[locale] || CONFIRM_COPY.en
  if (config.email.disabled) {
    log?.info({ to, url }, 'EMAIL DISABLED — confirmation link')
    return { sent: false }
  }
  await makeTransport().sendMail({
    from: config.email.from,
    replyTo: config.email.replyTo || undefined,
    to,
    subject: c.subject,
    text: `${c.line1}\n\n${c.line2}\n\n${url}\n\n${c.ignore}`,
    html: `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#15212e;line-height:1.6">
  <div style="max-width:520px;margin:0 auto;padding:24px">
    <h2 style="color:#0a2342">Portugal Must Honor Its Commitments</h2>
    <p>${esc(c.line1)}</p>
    <p>${esc(c.line2)}</p>
    <p style="margin:28px 0"><a href="${esc(url)}" style="background:#c9a14a;color:#061a30;font-weight:bold;padding:12px 22px;border-radius:6px;text-decoration:none;display:inline-block">${esc(c.button)}</a></p>
    <p style="font-size:13px;color:#46586a">${esc(c.ignore)}</p>
    <p style="font-size:12px;color:#8a98a6;word-break:break-all">${esc(url)}</p>
  </div></body></html>`,
  })
  return { sent: true }
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
