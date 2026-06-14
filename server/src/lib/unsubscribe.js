import crypto from 'node:crypto'

/* Signed, stateless unsubscribe tokens — must stay byte-for-byte compatible
   with the API's verifyUnsubToken (api.../src/lib/unsubscribe.js). The admin
   server only ever generates links; the API verifies and acts on them. */

export function makeUnsubToken(email, secret) {
  const e = Buffer.from(String(email).trim().toLowerCase(), 'utf8').toString('base64url')
  const sig = crypto.createHmac('sha256', secret).update(e).digest('base64url')
  return `${e}.${sig}`
}
