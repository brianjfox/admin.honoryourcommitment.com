import { verifyPassword } from '../lib/auth.js'
import { query } from '../lib/db.js'
import { config } from '../config.js'

export default async function authRoutes(fastify) {
  fastify.post(
    '/api/auth/login',
    { config: { rateLimit: { max: 10, timeWindow: '5 minutes' } } },
    async (req, reply) => {
      const email = String(req.body?.email || '').trim().toLowerCase()
      const password = String(req.body?.password || '')
      if (!email || !password)
        return reply.code(400).send({ error: 'missing_credentials' })

      const { rows } = await query(
        'SELECT * FROM admin.users WHERE email = $1 AND active = true',
        [email]
      )
      const user = rows[0]
      if (!user || !verifyPassword(password, user.password_hash)) {
        return reply.code(401).send({ error: 'invalid_credentials' })
      }

      await query('UPDATE admin.users SET last_login_at = now() WHERE id = $1', [
        user.id,
      ])
      const token = await reply.jwtSign(
        { id: user.id, email: user.email, role: user.role, name: user.name },
        { expiresIn: '12h' }
      )
      reply.setCookie('admin_token', token, {
        httpOnly: true,
        secure: config.cookieSecure,
        sameSite: 'lax',
        path: '/',
        maxAge: 12 * 60 * 60,
      })
      return {
        user: { id: user.id, email: user.email, role: user.role, name: user.name },
      }
    }
  )

  fastify.post('/api/auth/logout', async (req, reply) => {
    reply.clearCookie('admin_token', { path: '/' })
    return { ok: true }
  })

  fastify.get(
    '/api/auth/me',
    { preHandler: [fastify.authenticate] },
    async (req) => ({ user: req.user })
  )
}
