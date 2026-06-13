import { query } from '../lib/db.js'

export default async function tagsRoutes(fastify) {
  const view = { preHandler: [fastify.authenticate, fastify.requireCap('view')] }
  const create = { preHandler: [fastify.authenticate, fastify.requireCap('tag')] }
  const curate = { preHandler: [fastify.authenticate, fastify.requireCap('curate')] }
  const del = { preHandler: [fastify.authenticate, fastify.requireCap('delete_tag')] }

  // List tags with usage counts.
  fastify.get('/api/tags', view, async () => {
    const { rows } = await query(
      `SELECT t.id, t.name, t.color, t.description, t.created_at,
              (SELECT count(*)::int FROM admin.taggings tg WHERE tg.tag_id = t.id) AS count
       FROM admin.tags t ORDER BY t.name`
    )
    return { tags: rows }
  })

  fastify.post('/api/tags', create, async (req, reply) => {
    const name = String(req.body?.name || '').trim()
    if (!name) return reply.code(400).send({ error: 'name_required' })
    try {
      const { rows } = await query(
        `INSERT INTO admin.tags (name, color, description, created_by)
         VALUES ($1, $2, $3, $4) RETURNING id, name, color, description, created_at`,
        [name, req.body?.color || null, req.body?.description || null, req.user.id]
      )
      return reply.code(201).send({ tag: rows[0] })
    } catch (e) {
      if (e.code === '23505') return reply.code(409).send({ error: 'tag_exists' })
      throw e
    }
  })

  fastify.delete('/api/tags/:id', del, async (req) => {
    await query('DELETE FROM admin.tags WHERE id = $1', [req.params.id])
    return { ok: true }
  })

  // Apply / remove a tag on a person.
  fastify.post('/api/people/:email/tags', curate, async (req, reply) => {
    const email = String(req.params.email).toLowerCase()
    const tagId = req.body?.tagId
    if (!tagId) return reply.code(400).send({ error: 'tagId_required' })
    await query(
      `INSERT INTO admin.taggings (tag_id, person_email, created_by)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [tagId, email, req.user.id]
    )
    return { ok: true }
  })

  fastify.delete('/api/people/:email/tags/:tagId', curate, async (req) => {
    await query('DELETE FROM admin.taggings WHERE tag_id = $1 AND person_email = $2', [
      req.params.tagId,
      String(req.params.email).toLowerCase(),
    ])
    return { ok: true }
  })
}
