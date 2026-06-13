import { query } from '../lib/db.js'

export default async function statsRoutes(fastify) {
  const view = { preHandler: [fastify.authenticate, fastify.requireCap('view')] }

  fastify.get('/api/stats/overview', view, async () => {
    const [totals, byCountry, bySource, byYear, byType, byConfirmed] =
      await Promise.all([
        query(`
          SELECT count(*)::int AS people,
                 count(*) FILTER (WHERE confirmed)::int AS confirmed,
                 COALESCE(sum(investment_amount), 0)::numeric AS invested,
                 COALESCE(sum(family_members), 0)::int AS families,
                 COALESCE(round(avg(EXTRACT(YEAR FROM now())::int - application_year)
                          FILTER (WHERE application_year IS NOT NULL), 1), 0)::float AS avg_wait
          FROM admin.people`),
        query(`SELECT country AS label, count(*)::int AS value FROM admin.people
               GROUP BY country ORDER BY value DESC LIMIT 12`),
        query(`SELECT s AS label, count(*)::int AS value
               FROM admin.people, unnest(sources) s GROUP BY s ORDER BY value DESC`),
        query(`SELECT application_year::text AS label, count(*)::int AS value
               FROM admin.people WHERE application_year IS NOT NULL
               GROUP BY application_year ORDER BY application_year`),
        query(`SELECT investment_type AS label, count(*)::int AS value
               FROM admin.people WHERE investment_type IS NOT NULL
               GROUP BY investment_type ORDER BY value DESC`),
        query(`SELECT CASE WHEN confirmed THEN 'Confirmed' ELSE 'Unconfirmed' END AS label,
                      count(*)::int AS value FROM admin.people GROUP BY confirmed`),
      ])

    const t = totals.rows[0]
    return {
      totals: {
        people: t.people,
        confirmed: t.confirmed,
        invested: Number(t.invested),
        families: t.families,
        avgWait: Number(t.avg_wait),
      },
      byCountry: byCountry.rows,
      bySource: bySource.rows,
      byYear: byYear.rows,
      byInvestmentType: byType.rows,
      byConfirmed: byConfirmed.rows,
    }
  })
}
