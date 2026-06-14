import crypto from 'node:crypto'

/* Password hashing with Node's built-in scrypt (no native deps).
   Stored format: scrypt$<saltHex>$<hashHex> */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync(String(password), salt, 64)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, saltHex, hashHex] = String(stored).split('$')
    if (scheme !== 'scrypt' || !saltHex || !hashHex) return false
    const hash = crypto.scryptSync(String(password), Buffer.from(saltHex, 'hex'), 64)
    const expected = Buffer.from(hashHex, 'hex')
    return hash.length === expected.length && crypto.timingSafeEqual(hash, expected)
  } catch {
    return false
  }
}

/* Role → capability matrix.
   - view:         read people, stats, tags, groups
   - tag:          create tags
   - group:        create groups
   - curate:       add/remove taggings and group memberships
   - delete_tag / delete_group: delete tags / groups
   - edit_data / delete_data:   modify / delete campaign records
   - broadcast:    compose and send campaign-update emails to opt-in contacts
   - manage_users: CRUD admin users
   broadcast is SUPER_ADMIN-only: mass email to constituents represents the
   organization and is hard to undo, so it stays above the curation tier. */
export const CAPABILITIES = {
  SUPER_ADMIN: new Set([
    'view', 'tag', 'group', 'curate',
    'delete_tag', 'delete_group',
    'edit_data', 'delete_data', 'broadcast', 'manage_users',
  ]),
  ADMIN: new Set(['view', 'tag', 'group', 'curate']),
  VIEWER: new Set(['view']),
}

export function can(role, capability) {
  return CAPABILITIES[role]?.has(capability) || false
}

export const ROLES = ['SUPER_ADMIN', 'ADMIN', 'VIEWER']
