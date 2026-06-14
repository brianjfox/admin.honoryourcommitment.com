// Thin fetch wrapper. Same-origin (/api/* is proxied to the admin server), so
// the httpOnly session cookie is sent automatically.
async function req(method, path, body) {
  const res = await fetch('/api' + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',
  })
  let data = null
  try {
    data = await res.json()
  } catch {
    /* no body */
  }
  if (!res.ok) {
    const err = new Error((data && data.error) || `http_${res.status}`)
    err.status = res.status
    err.code = data && data.error
    throw err
  }
  return data
}

export const api = {
  get: (p) => req('GET', p),
  post: (p, b) => req('POST', p, b),
  patch: (p, b) => req('PATCH', p, b),
  del: (p) => req('DELETE', p),
}

// Mirror of the server capability matrix, for UI gating only (the server
// always enforces). Keep in sync with server/src/lib/auth.js.
const CAPS = {
  SUPER_ADMIN: [
    'view', 'tag', 'group', 'curate', 'delete_tag', 'delete_group',
    'edit_data', 'delete_data', 'broadcast', 'manage_users',
  ],
  ADMIN: ['view', 'tag', 'group', 'curate'],
  VIEWER: ['view'],
}
export const can = (role, cap) => !!CAPS[role]?.includes(cap)
