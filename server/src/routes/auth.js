import crypto from 'node:crypto'
import { verifyPassword, hashPassword } from '../lib/auth.js'
import { query } from '../lib/db.js'
import { sendPasswordReset } from '../lib/email.js'
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

  // Request a reset link. Always returns ok (never reveals whether the email
  // exists). Rate-limited.
  fastify.post(
    '/api/auth/forgot',
    { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } },
    async (req) => {
      const email = String(req.body?.email || '').trim().toLowerCase()
      if (email) {
        const { rows } = await query(
          'SELECT id FROM admin.users WHERE email = $1 AND active = true',
          [email]
        )
        if (rows[0]) {
          const token = crypto.randomBytes(32).toString('base64url')
          const hash = crypto.createHash('sha256').update(token).digest('hex')
          await query(
            `UPDATE admin.users
             SET reset_token_hash = $1, reset_expires_at = now() + interval '1 hour'
             WHERE id = $2`,
            [hash, rows[0].id]
          )
          const url = `${config.publicUrl}/reset?token=${encodeURIComponent(token)}`
          try {
            await sendPasswordReset(email, url, req.log)
          } catch (err) {
            req.log.warn({ err: err.message }, 'password reset email failed')
          }
        }
      }
      return { ok: true }
    }
  )

  // Complete a reset with a valid, unexpired token.
  fastify.post('/api/auth/reset', async (req, reply) => {
    const token = String(req.body?.token || '')
    const password = String(req.body?.password || '')
    if (!token || password.length < 10) {
      return reply.code(400).send({ error: 'invalid' })
    }
    const hash = crypto.createHash('sha256').update(token).digest('hex')
    const { rows } = await query(
      `SELECT id FROM admin.users
       WHERE reset_token_hash = $1 AND reset_expires_at > now() AND active = true`,
      [hash]
    )
    if (!rows[0]) return reply.code(400).send({ error: 'invalid_or_expired' })
    await query(
      `UPDATE admin.users
       SET password_hash = $1, reset_token_hash = NULL, reset_expires_at = NULL
       WHERE id = $2`,
      [hashPassword(password), rows[0].id]
    )
    return { ok: true }
  })
}
