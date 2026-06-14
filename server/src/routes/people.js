import { query } from '../lib/db.js'

// Build a parameterized WHERE from the supported demographic filters.
export function buildFilter(q) {
  const params = []
  const P = (v) => {
    params.push(v)
    return '$' + params.length
  }
  const conds = []
  if (q.q) {
    const a = P('%' + q.q + '%')
    conds.push(`(p.email ILIKE ${a} OR p.name ILIKE ${a})`)
  }
  if (q.country) conds.push(`${P(q.country)} = ANY(p.countries)`)
  if (q.source) conds.push(`${P(q.source)} = ANY(p.sources)`)
  if (q.year) conds.push(`p.application_year = ${P(parseInt(q.year, 10))}`)
  if (q.investmentType) conds.push(`p.investment_type = ${P(q.investmentType)}`)
  if (q.confirmed === 'true' || q.confirmed === 'false')
    conds.push(`p.confirmed = ${P(q.confirmed === 'true')}`)
  if (q.tag)
    conds.push(
      `EXISTS (SELECT 1 FROM admin.taggings tg WHERE tg.person_email = p.email AND tg.tag_id = ${P(q.tag)})`
    )
  if (q.group)
    conds.push(
      `EXISTS (SELECT 1 FROM admin.group_members gm WHERE gm.person_email = p.email AND gm.group_id = ${P(q.group)})`
    )
  return { where: conds.length ? 'WHERE ' + conds.join(' AND ') : '', params }
}

const PERSON_COLS = `p.email, p.name, p.country, p.countries, p.sources,
  p.application_year, p.investment_type, p.investment_amount, p.family_members,
  p.confirmed, p.first_seen, p.last_seen,
  COALESCE((SELECT json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color) ORDER BY t.name)
            FROM admin.taggings tg JOIN admin.tags t ON t.id = tg.tag_id
            WHERE tg.person_email = p.email), '[]') AS tags`

export default async function peopleRoutes(fastify) {
  const view = { preHandler: [fastify.authenticate, fastify.requireCap('view')] }

  // List/filter people (the unified identities).
  fastify.get('/api/people', view, async (req) => {
    const { where, params } = buildFilter(req.query)
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200)
    const offset = parseInt(req.query.offset || '0', 10)

    const total = (
      await query(`SELECT count(*)::int AS n FROM admin.people p ${where}`, params)
    ).rows[0].n

    const rows = (
      await query(
        `SELECT ${PERSON_COLS}
         FROM admin.people p ${where}
         ORDER BY p.last_seen DESC NULLS LAST
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      )
    ).rows

    return { total, limit, offset, people: rows }
  })

  // One person: unified identity + underlying records + tags + groups.
  fastify.get('/api/people/:email', view, async (req, reply) => {
    const email = String(req.params.email).toLowerCase()
    const person = (
      await query(`SELECT ${PERSON_COLS} FROM admin.people p WHERE p.email = $1`, [
        email,
      ])
    ).rows[0]
    if (!person) return reply.code(404).send({ error: 'not_found' })

    const [signatures, cases, claimants, groups] = await Promise.all([
      query('SELECT * FROM public.signatures WHERE lower(email) = $1', [email]),
      query('SELECT * FROM public.cases WHERE lower(email) = $1', [email]),
      query('SELECT * FROM public.claimants WHERE lower(email) = $1', [email]),
      query(
        `SELECT g.id, g.name FROM admin.group_members m JOIN admin.groups g ON g.id = m.group_id
         WHERE m.person_email = $1 ORDER BY g.name`,
        [email]
      ),
    ])
    return {
      person,
      groups: groups.rows,
      records: {
        signatures: signatures.rows,
        cases: cases.rows,
        claimants: claimants.rows,
      },
    }
  })

  // Delete a person entirely (all their campaign records + tags/group memberships).
  fastify.delete(
    '/api/people/:email',
    { preHandler: [fastify.authenticate, fastify.requireCap('delete_data')] },
    async (req) => {
      const email = String(req.params.email).toLowerCase()
      const client = await (await import('../lib/db.js')).pool.connect()
      try {
        await client.query('BEGIN')
        await client.query('DELETE FROM public.signatures WHERE lower(email) = $1', [email])
        await client.query('DELETE FROM public.cases WHERE lower(email) = $1', [email])
        await client.query('DELETE FROM public.claimants WHERE lower(email) = $1', [email])
        await client.query('DELETE FROM admin.taggings WHERE person_email = $1', [email])
        await client.query('DELETE FROM admin.group_members WHERE person_email = $1', [email])
        await client.query('COMMIT')
      } catch (e) {
        await client.query('ROLLBACK')
        throw e
      } finally {
        client.release()
      }
      return { ok: true }
    }
  )
}
