import { query } from '../lib/db.js'
import { hashPassword, ROLES } from '../lib/auth.js'

// All admin-user management requires the manage_users capability (SUPER_ADMIN).
export default async function usersRoutes(fastify) {
  const guard = { preHandler: [fastify.authenticate, fastify.requireCap('manage_users')] }

  fastify.get('/api/users', guard, async () => {
    const { rows } = await query(
      `SELECT id, email, name, role, active, created_at, last_login_at
       FROM admin.users ORDER BY created_at`
    )
    return { users: rows }
  })

  fastify.post('/api/users', guard, async (req, reply) => {
    const email = String(req.body?.email || '').trim().toLowerCase()
    const password = String(req.body?.password || '')
    const role = String(req.body?.role || '')
    const name = req.body?.name ? String(req.body.name).trim() : null
    if (!email || !password) return reply.code(400).send({ error: 'email_password_required' })
    if (password.length < 10)
      return reply.code(400).send({ error: 'password_too_short' })
    if (!ROLES.includes(role)) return reply.code(400).send({ error: 'invalid_role' })
    try {
      const { rows } = await query(
        `INSERT INTO admin.users (email, name, password_hash, role)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, name, role, active, created_at`,
        [email, name, hashPassword(password), role]
      )
      return reply.code(201).send({ user: rows[0] })
    } catch (e) {
      if (e.code === '23505') return reply.code(409).send({ error: 'user_exists' })
      throw e
    }
  })

  fastify.patch('/api/users/:id', guard, async (req, reply) => {
    const sets = []
    const params = []
    const P = (v) => {
      params.push(v)
      return '$' + params.length
    }
    if (req.body?.name !== undefined) sets.push(`name = ${P(String(req.body.name).trim())}`)
    if (req.body?.active !== undefined) sets.push(`active = ${P(!!req.body.active)}`)
    if (req.body?.role !== undefined) {
      if (!ROLES.includes(req.body.role))
        return reply.code(400).send({ error: 'invalid_role' })
      sets.push(`role = ${P(req.body.role)}`)
    }
    if (req.body?.password) {
      if (String(req.body.password).length < 10)
        return reply.code(400).send({ error: 'password_too_short' })
      sets.push(`password_hash = ${P(hashPassword(String(req.body.password)))}`)
    }
    if (!sets.length) return reply.code(400).send({ error: 'nothing_to_update' })
    // Don't let an admin lock themselves out by self-deactivating / demoting.
    if (req.params.id === req.user.id && (req.body?.active === false || req.body?.role)) {
      return reply.code(400).send({ error: 'cannot_modify_own_role_or_status' })
    }
    const { rows } = await query(
      `UPDATE admin.users SET ${sets.join(', ')} WHERE id = ${P(req.params.id)}
       RETURNING id, email, name, role, active, created_at, last_login_at`,
      params
    )
    if (!rows[0]) return reply.code(404).send({ error: 'not_found' })
    return { user: rows[0] }
  })

  fastify.delete('/api/users/:id', guard, async (req, reply) => {
    if (req.params.id === req.user.id)
      return reply.code(400).send({ error: 'cannot_delete_self' })
    // Keep at least one SUPER_ADMIN.
    const supers = (
      await query(
        `SELECT count(*)::int AS n FROM admin.users WHERE role = 'SUPER_ADMIN' AND active`
      )
    ).rows[0].n
    const target = (
      await query('SELECT role FROM admin.users WHERE id = $1', [req.params.id])
    ).rows[0]
    if (target?.role === 'SUPER_ADMIN' && supers <= 1)
      return reply.code(400).send({ error: 'cannot_delete_last_super_admin' })
    await query('DELETE FROM admin.users WHERE id = $1', [req.params.id])
    return { ok: true }
  })
}
