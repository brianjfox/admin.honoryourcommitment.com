import { query } from '../lib/db.js'

// SUPER_ADMIN editing of individual campaign records (the "U" in CRUD).
// Email is deliberately NOT editable — it's the person identity key that tags
// and group memberships hang off of.
const TABLE = { signature: 'signatures', case: 'cases', claimant: 'claimants' }
const EDITABLE = {
  signature: ['first_name', 'last_name', 'country', 'consent_public', 'consent_contact'],
  case: [
    'first_name', 'last_name', 'phone', 'country', 'application_year',
    'investment_type', 'investment_amount', 'family_members', 'status', 'story',
  ],
  claimant: ['full_name', 'country', 'application_year', 'message'],
}
const INT_FIELDS = new Set(['application_year', 'family_members'])
const NUM_FIELDS = new Set(['investment_amount'])
const BOOL_FIELDS = new Set(['consent_public', 'consent_contact'])

function coerce(field, v) {
  if (BOOL_FIELDS.has(field)) return Boolean(v)
  if (v === '' || v == null) return null
  if (INT_FIELDS.has(field)) return parseInt(v, 10)
  if (NUM_FIELDS.has(field)) return Number(v)
  return String(v)
}

export default async function recordsRoutes(fastify) {
  fastify.patch(
    '/api/records/:type/:id',
    { preHandler: [fastify.authenticate, fastify.requireCap('edit_data')] },
    async (req, reply) => {
      const table = TABLE[req.params.type]
      const allowed = EDITABLE[req.params.type]
      if (!table) return reply.code(400).send({ error: 'invalid_type' })

      const sets = []
      const params = []
      const P = (v) => {
        params.push(v)
        return '$' + params.length
      }
      for (const [k, v] of Object.entries(req.body || {})) {
        if (!allowed.includes(k)) continue
        sets.push(`${k} = ${P(coerce(k, v))}`)
      }
      if (!sets.length) return reply.code(400).send({ error: 'nothing_to_update' })
      sets.push('updated_at = now()')

      const res = await query(
        `UPDATE public.${table} SET ${sets.join(', ')} WHERE id = ${P(req.params.id)} RETURNING *`,
        params
      )
      if (!res.rows[0]) return reply.code(404).send({ error: 'not_found' })
      return { record: res.rows[0] }
    }
  )
}
