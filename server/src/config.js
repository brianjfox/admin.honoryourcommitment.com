import 'dotenv/config'
import crypto from 'node:crypto'

function required(name, devFallback) {
  const v = process.env[name]
  if (v === undefined || v === '') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Missing required environment variable: ${name}`)
    }
    return devFallback
  }
  return v
}

const bool = (v, def = false) =>
  v === undefined ? def : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase())

const DB_URL = required('DATABASE_URL', 'postgres://phyc:phyc@localhost:5432/phyc')

export const config = {
  env: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  host: process.env.HOST || '127.0.0.1',
  port: parseInt(process.env.PORT || '4000', 10),

  databaseUrl: DB_URL,
  jwtSecret: required('JWT_SECRET', 'dev-insecure-change-me'),
  cookieSecure: bool(process.env.COOKIE_SECURE, false),

  // Public origin of the API, used to build unsubscribe links in broadcasts.
  apiPublicUrl: (process.env.API_PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, ''),

  // Must match the API's UNSUBSCRIBE_SECRET so the links it generates verify.
  // If unset, both derive the same value from the shared DATABASE_URL.
  unsubscribeSecret:
    process.env.UNSUBSCRIBE_SECRET ||
    crypto.createHash('sha256').update(`${DB_URL}:unsubscribe`).digest('hex'),

  // Broadcast send pacing: a small delay between messages keeps us within the
  // transactional provider's rate limits.
  broadcast: {
    delayMs: parseInt(process.env.BROADCAST_DELAY_MS || '200', 10),
  },

  superAdmin: {
    email: (process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase(),
    password: process.env.SUPER_ADMIN_PASSWORD || '',
  },

  // Public origin of the admin site, used to build password-reset links.
  publicUrl: (process.env.ADMIN_PUBLIC_URL || 'http://localhost:5180').replace(/\/$/, ''),

  // SMTP for password-reset emails (reuse the API's transactional provider).
  email: {
    disabled: bool(process.env.DISABLE_EMAIL, false),
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: bool(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from:
      process.env.EMAIL_FROM ||
      'Honor Your Commitment <no-reply@honoryourcommitment.com>',
    replyTo: process.env.EMAIL_REPLY_TO || '',
  },
}
