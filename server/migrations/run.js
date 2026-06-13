// Forward-only migration runner, scoped to the `admin` schema so it never
// conflicts with the API's public.schema_migrations.
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import pg from 'pg'
import { config } from '../src/config.js'

const dir = path.dirname(fileURLToPath(import.meta.url))

async function main() {
  const client = new pg.Client({ connectionString: config.databaseUrl })
  await client.connect()
  await client.query('CREATE SCHEMA IF NOT EXISTS admin')
  await client.query(`
    CREATE TABLE IF NOT EXISTS admin.schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `)
  const applied = new Set(
    (await client.query('SELECT filename FROM admin.schema_migrations')).rows.map(
      (r) => r.filename
    )
  )
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()
  let count = 0
  for (const file of files) {
    if (applied.has(file)) continue
    process.stdout.write(`Applying ${file} … `)
    try {
      await client.query('BEGIN')
      await client.query(await readFile(path.join(dir, file), 'utf8'))
      await client.query('INSERT INTO admin.schema_migrations (filename) VALUES ($1)', [file])
      await client.query('COMMIT')
      console.log('done')
      count++
    } catch (err) {
      await client.query('ROLLBACK')
      console.error('FAILED')
      throw err
    }
  }
  console.log(count === 0 ? 'No pending migrations.' : `Applied ${count} migration(s).`)
  await client.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
