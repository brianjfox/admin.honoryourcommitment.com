import 'dotenv/config'

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

export const config = {
  env: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  host: process.env.HOST || '127.0.0.1',
  port: parseInt(process.env.PORT || '4000', 10),

  databaseUrl: required('DATABASE_URL', 'postgres://phyc:phyc@localhost:5432/phyc'),
  jwtSecret: required('JWT_SECRET', 'dev-insecure-change-me'),
  cookieSecure: bool(process.env.COOKIE_SECURE, false),

  superAdmin: {
    email: (process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase(),
    password: process.env.SUPER_ADMIN_PASSWORD || '',
  },
}
