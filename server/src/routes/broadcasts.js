import { query, pool } from '../lib/db.js'
import { config } from '../config.js'
import { buildFilter } from './people.js'
import { makeUnsubToken } from '../lib/unsubscribe.js'
import { makeTransport, renderBroadcast, sendBroadcastMessage } from '../lib/email.js'

/* Campaign-update broadcasts (SUPER_ADMIN only — the 'broadcast' capability).

   Recipients are resolved at send time from public.signatures, the only source
   that captured consent_contact. An address is eligible iff it consented, is
   double-opt-in confirmed, and is not on public.email_suppressions. The People
   filter (group/tag/country/…) further narrows the audience via admin.people. */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Build the recipient SELECT from a People-style filter object.
function recipientQuery(filter, columns) {
  const { where, params } = buildFilter(filter || {})
  const sql = `
    SELECT ${columns}
    FROM public.signatures s
    JOIN (SELECT p.email FROM admin.people p ${where}) t ON t.email = lower(s.email)
    WHERE s.consent_contact = true
      AND s.confirmed_at IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.email_suppressions x WHERE x.email = lower(s.email)
      )`
  return { sql, params }
}

// Deliver a broadcast in the background: one message per recipient, paced to
// stay within the provider's limits. Updates per-recipient and roll-up counts.
async function runSend(broadcastId, subject, body, log) {
  const { rows } = await query(
    `SELECT email, locale FROM admin.broadcast_recipients
     WHERE broadcast_id = $1 AND status = 'pending' ORDER BY email`,
    [broadcastId]
  )
  const transport = config.email.disabled ? null : makeTransport()
  let sent = 0
  let failed = 0
  for (const r of rows) {
    const lang = ['en', 'pt', 'es', 'zh'].includes(r.locale) ? r.locale : 'en'
    const token = makeUnsubToken(r.email, config.unsubscribeSecret)
    const unsubUrl = `${config.apiPublicUrl}/api/unsubscribe?token=${encodeURIComponent(token)}&lang=${lang}`
    try {
      if (transport) {
        const { html, text } = renderBroadcast({ subject, body, unsubUrl })
        await sendBroadcastMessage(transport, { to: r.email, subject, html, text, unsubUrl })
      } else {
        log?.info({ to: r.email, unsubUrl }, 'EMAIL DISABLED — broadcast message')
      }
      await query(
        `UPDATE admin.broadcast_recipients
         SET status = 'sent', sent_at = now(), error = NULL
         WHERE broadcast_id = $1 AND email = $2`,
        [broadcastId, r.email]
      )
      sent++
    } catch (err) {
      await query(
        `UPDATE admin.broadcast_recipients SET status = 'failed', error = $3
         WHERE broadcast_id = $1 AND email = $2`,
        [broadcastId, r.email, String(err.message || err).slice(0, 500)]
      )
      failed++
      log?.warn({ to: r.email, err: err.message }, 'broadcast message failed')
    }
    await query(
      `UPDATE admin.broadcasts SET sent_count = $2, failed_count = $3 WHERE id = $1`,
      [broadcastId, sent, failed]
    )
    if (config.broadcast.delayMs > 0) await sleep(config.broadcast.delayMs)
  }
  try {
    transport?.close()
  } catch {
    /* ignore */
  }
  await query(
    `UPDATE admin.broadcasts
     SET status = $2, sent_count = $3, failed_count = $4, finished_at = now()
     WHERE id = $1`,
    [broadcastId, failed > 0 && sent === 0 ? 'failed' : 'sent', sent, failed]
  )
  log?.info({ broadcastId, sent, failed }, 'broadcast finished')
}

export default async function broadcastRoutes(fastify) {
  const guard = {
    preHandler: [fastify.authenticate, fastify.requireCap('broadcast')],
  }

  // List recent broadcasts.
  fastify.get('/api/broadcasts', guard, async () => {
    const { rows } = await query(
      `SELECT b.id, b.subject, b.audience_label, b.status, b.total,
              b.sent_count, b.failed_count, b.created_at, b.finished_at,
              u.name AS created_by_name
       FROM admin.broadcasts b
       LEFT JOIN admin.users u ON u.id = b.created_by
       ORDER BY b.created_at DESC
       LIMIT 100`
    )
    return { broadcasts: rows }
  })

  // Preview the eligible-recipient count for a given filter (query params).
  fastify.get('/api/broadcasts/recipients', guard, async (req) => {
    const { sql, params } = recipientQuery(req.query, 'count(DISTINCT s.email)::int AS n')
    const { rows } = await query(sql, params)
    return { count: rows[0].n }
  })

  // One broadcast's status (for progress polling).
  fastify.get('/api/broadcasts/:id', guard, async (req, reply) => {
    const { rows } = await query(
      `SELECT id, subject, body, audience_label, status, total,
              sent_count, failed_count, created_at, finished_at
       FROM admin.broadcasts WHERE id = $1`,
      [req.params.id]
    )
    if (!rows.length) return reply.code(404).send({ error: 'not_found' })
    return { broadcast: rows[0] }
  })

  // Compose + send. Resolves recipients, records the broadcast, then sends in
  // the background; the client polls GET /api/broadcasts/:id for progress.
  fastify.post('/api/broadcasts', guard, async (req, reply) => {
    const subject = String(req.body?.subject || '').trim()
    const body = String(req.body?.body || '').trim()
    const filter = req.body?.query && typeof req.body.query === 'object' ? req.body.query : {}
    const audienceLabel = String(req.body?.audienceLabel || '').trim() || null
    if (subject.length < 3 || body.length < 3) {
      return reply.code(400).send({ error: 'subject_and_body_required' })
    }

    const { sql, params } = recipientQuery(filter, 'DISTINCT lower(s.email) AS email, s.locale')
    const recips = (await query(sql, params)).rows
    if (recips.length === 0) {
      return reply.code(400).send({ error: 'no_recipients' })
    }

    const client = await pool.connect()
    let broadcastId
    try {
      await client.query('BEGIN')
      const ins = await client.query(
        `INSERT INTO admin.broadcasts
           (subject, body, audience, audience_label, status, total, created_by)
         VALUES ($1, $2, $3, $4, 'sending', $5, $6)
         RETURNING id`,
        [subject, body, JSON.stringify(filter), audienceLabel, recips.length, req.user.id]
      )
      broadcastId = ins.rows[0].id
      // Bulk-insert recipients with a single multi-row VALUES statement.
      const values = []
      const ps = []
      recips.forEach((r, i) => {
        ps.push(`($1, $${i * 2 + 2}, $${i * 2 + 3})`)
        values.push(r.email, r.locale)
      })
      await client.query(
        `INSERT INTO admin.broadcast_recipients (broadcast_id, email, locale)
         VALUES ${ps.join(', ')} ON CONFLICT DO NOTHING`,
        [broadcastId, ...values]
      )
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

    // Fire-and-forget; failures are recorded per recipient and on the row.
    runSend(broadcastId, subject, body, req.log).catch((err) =>
      req.log.error({ err: err.message, broadcastId }, 'broadcast run failed')
    )

    return { ok: true, id: broadcastId, total: recips.length }
  })
}
