import crypto from 'node:crypto'
import { query } from '../lib/db.js'
import { config } from '../config.js'
import { sendConfirmation } from '../lib/email.js'

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

  // Resend the double opt-in confirmation email for ONE unconfirmed record.
  // Confirmation must come from the user — this only re-sends their link; it
  // never marks anything confirmed. Reuses the existing token (so any link
  // already in flight stays valid), minting one only if the record lacks it.
  fastify.post(
    '/api/records/:type/:id/resend-confirmation',
    { preHandler: [fastify.authenticate, fastify.requireCap('curate')] },
    async (req, reply) => {
      const { type, id } = req.params
      const table = TABLE[type]
      if (!table) return reply.code(400).send({ error: 'invalid_type' })

      const found = await query(
        `SELECT email, locale, confirm_token, confirmed_at FROM public.${table} WHERE id = $1`,
        [id]
      )
      const rec = found.rows[0]
      if (!rec) return reply.code(404).send({ error: 'not_found' })
      if (rec.confirmed_at) return reply.code(400).send({ error: 'already_confirmed' })

      let token = rec.confirm_token
      if (!token) {
        token = crypto.randomBytes(32).toString('base64url')
        await query(`UPDATE public.${table} SET confirm_token = $1, updated_at = now() WHERE id = $2`, [
          token,
          id,
        ])
      }

      const url = `${config.apiPublicUrl}/api/confirm?type=${encodeURIComponent(
        type
      )}&token=${encodeURIComponent(token)}`
      try {
        const r = await sendConfirmation(rec.email, url, rec.locale || 'en', req.log)
        return { ok: true, sent: r.sent !== false, to: rec.email }
      } catch (err) {
        req.log.error({ err: err.message }, 'resend confirmation failed')
        return reply.code(502).send({ error: 'send_failed' })
      }
    }
  )
}
