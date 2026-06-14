import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { config } from './config.js'
import { pool, closePool, query } from './lib/db.js'
import { can, hashPassword } from './lib/auth.js'
import authRoutes from './routes/auth.js'
import peopleRoutes from './routes/people.js'
import tagsRoutes from './routes/tags.js'
import groupsRoutes from './routes/groups.js'
import statsRoutes from './routes/stats.js'
import usersRoutes from './routes/users.js'
import recordsRoutes from './routes/records.js'

export async function buildServer() {
  const app = Fastify({
    trustProxy: true,
    bodyLimit: 256 * 1024,
    logger: {
      level: config.isProd ? 'info' : 'debug',
      transport: config.isProd
        ? undefined
        : { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } },
    },
  })

  await app.register(helmet, { contentSecurityPolicy: false })
  await app.register(cookie)
  await app.register(jwt, {
    secret: config.jwtSecret,
    cookie: { cookieName: 'admin_token', signed: false },
  })
  await app.register(rateLimit, { global: false })

  // Auth: verify the JWT from the cookie (populates req.user).
  app.decorate('authenticate', async (req, reply) => {
    try {
      await req.jwtVerify()
    } catch {
      return reply.code(401).send({ error: 'unauthorized' })
    }
  })
  // RBAC: require a capability for the authenticated user's role.
  app.decorate('requireCap', (capability) => async (req, reply) => {
    if (!req.user || !can(req.user.role, capability)) {
      return reply.code(403).send({ error: 'forbidden' })
    }
  })

  app.get('/api/health', async () => {
    await pool.query('SELECT 1')
    return { ok: true, service: 'admin.honoryourcommitment.com' }
  })

  await app.register(authRoutes)
  await app.register(peopleRoutes)
  await app.register(tagsRoutes)
  await app.register(groupsRoutes)
  await app.register(statsRoutes)
  await app.register(usersRoutes)
  await app.register(recordsRoutes)

  app.setErrorHandler((err, req, reply) => {
    req.log.error(err)
    if (err.validation) return reply.code(400).send({ error: 'validation_failed' })
    if (err.statusCode === 429) return reply.code(429).send({ error: 'rate_limited' })
    return reply.code(err.statusCode || 500).send({ error: 'server_error' })
  })

  return app
}

// Seed the first SUPER_ADMIN from env if there are no admin users yet.
export async function seedSuperAdminIfEmpty(log) {
  const { email, password } = config.superAdmin
  if (!email || !password) return
  const n = (await query('SELECT count(*)::int AS n FROM admin.users')).rows[0].n
  if (n > 0) return
  await query(
    `INSERT INTO admin.users (email, name, password_hash, role)
     VALUES ($1, $2, $3, 'SUPER_ADMIN')`,
    [email, 'Super Admin', hashPassword(password)]
  )
  log?.info(`Seeded initial SUPER_ADMIN: ${email}`)
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  const app = await buildServer()
  try {
    await seedSuperAdminIfEmpty(app.log)
  } catch (err) {
    app.log.error(err, 'seed failed (continuing)')
  }

  const shutdown = async (sig) => {
    app.log.info(`Received ${sig}, shutting down…`)
    try {
      await app.close()
      await closePool()
      process.exit(0)
    } catch (err) {
      app.log.error(err)
      process.exit(1)
    }
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))

  try {
    await app.listen({ host: config.host, port: config.port })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}
