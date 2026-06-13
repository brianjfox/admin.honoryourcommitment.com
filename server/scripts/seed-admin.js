/* Create or update a SUPER_ADMIN from the command line.
 *
 *   node scripts/seed-admin.js <email> <password> [name]
 *   # or rely on SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD from .env
 *
 * Upserts: if the email exists, its password is reset and role set to SUPER_ADMIN.
 */
import { query, closePool } from '../src/lib/db.js'
import { hashPassword } from '../src/lib/auth.js'
import { config } from '../src/config.js'

async function main() {
  const email = (process.argv[2] || config.superAdmin.email || '').trim().toLowerCase()
  const password = process.argv[3] || config.superAdmin.password || ''
  const name = process.argv[4] || 'Super Admin'
  if (!email || !password) {
    console.error('Usage: node scripts/seed-admin.js <email> <password> [name]')
    console.error('   (or set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD in .env)')
    process.exit(1)
  }
  if (password.length < 10) {
    console.error('Password must be at least 10 characters.')
    process.exit(1)
  }
  const { rows } = await query(
    `INSERT INTO admin.users (email, name, password_hash, role, active)
     VALUES ($1, $2, $3, 'SUPER_ADMIN', true)
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           role = 'SUPER_ADMIN',
           active = true,
           name = COALESCE(admin.users.name, EXCLUDED.name)
     RETURNING id, email, role`,
    [email, name, hashPassword(password)]
  )
  console.log(`SUPER_ADMIN ready: ${rows[0].email} (${rows[0].id})`)
}

main()
  .catch((err) => {
    console.error('Failed:', err.message)
    process.exitCode = 1
  })
  .finally(closePool)
