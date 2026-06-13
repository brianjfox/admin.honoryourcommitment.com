import { query } from '../lib/db.js'

export default async function groupsRoutes(fastify) {
  const view = { preHandler: [fastify.authenticate, fastify.requireCap('view')] }
  const create = { preHandler: [fastify.authenticate, fastify.requireCap('group')] }
  const curate = { preHandler: [fastify.authenticate, fastify.requireCap('curate')] }
  const del = { preHandler: [fastify.authenticate, fastify.requireCap('delete_group')] }

  fastify.get('/api/groups', view, async () => {
    const { rows } = await query(
      `SELECT g.id, g.name, g.description, g.created_at,
              (SELECT count(*)::int FROM admin.group_members m WHERE m.group_id = g.id) AS count
       FROM admin.groups g ORDER BY g.name`
    )
    return { groups: rows }
  })

  fastify.post('/api/groups', create, async (req, reply) => {
    const name = String(req.body?.name || '').trim()
    if (!name) return reply.code(400).send({ error: 'name_required' })
    try {
      const { rows } = await query(
        `INSERT INTO admin.groups (name, description, created_by)
         VALUES ($1, $2, $3) RETURNING id, name, description, created_at`,
        [name, req.body?.description || null, req.user.id]
      )
      return reply.code(201).send({ group: rows[0] })
    } catch (e) {
      if (e.code === '23505') return reply.code(409).send({ error: 'group_exists' })
      throw e
    }
  })

  fastify.delete('/api/groups/:id', del, async (req) => {
    await query('DELETE FROM admin.groups WHERE id = $1', [req.params.id])
    return { ok: true }
  })

  // Members of a group (joined to the unified person for display).
  fastify.get('/api/groups/:id/members', view, async (req) => {
    const { rows } = await query(
      `SELECT m.person_email AS email, p.name, p.country, p.confirmed, p.sources
       FROM admin.group_members m
       LEFT JOIN admin.people p ON p.email = m.person_email
       WHERE m.group_id = $1 ORDER BY m.created_at DESC`,
      [req.params.id]
    )
    return { members: rows }
  })

  // Add a single person, or many at once (e.g. everyone matching a filter).
  fastify.post('/api/groups/:id/members', curate, async (req, reply) => {
    const emails = (req.body?.emails || (req.body?.email ? [req.body.email] : []))
      .map((e) => String(e).toLowerCase().trim())
      .filter(Boolean)
    if (!emails.length) return reply.code(400).send({ error: 'email_required' })
    for (const email of emails) {
      await query(
        `INSERT INTO admin.group_members (group_id, person_email, created_by)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [req.params.id, email, req.user.id]
      )
    }
    return { ok: true, added: emails.length }
  })

  fastify.delete('/api/groups/:id/members/:email', curate, async (req) => {
    await query(
      'DELETE FROM admin.group_members WHERE group_id = $1 AND person_email = $2',
      [req.params.id, String(req.params.email).toLowerCase()]
    )
    return { ok: true }
  })
}
