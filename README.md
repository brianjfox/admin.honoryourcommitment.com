# admin.honoryourcommitment.com

Internal administration site for **Portugal Must Honor Its Commitments** — browse
and classify the people behind the campaign, tag and group them, visualize
demographics, and (for super admins) manage data and staff accounts.

Self-contained: it has its own backend and connects to the **same Postgres** as
the API, reading the campaign tables (`public.signatures`, `public.cases`,
`public.claimants`) and owning its own objects in a separate **`admin`** schema.
Admin/write powers never touch the public-facing API.

```
Browser → Nginx (admin.honoryourcommitment.com, TLS)
            ├── /        → static SPA      (web/  → /var/www/admin.honoryourcommitment.com)
            └── /api/*   → admin backend   (server/ → 127.0.0.1:4000)
                              └── Postgres (public.* read-mostly, admin.* owned)
```

The SPA and API share one origin (nginx proxies `/api`), so the session is an
**httpOnly, Secure cookie** — no token in JavaScript, no CORS.

## Roles & capabilities

| Capability | SUPER_ADMIN | ADMIN | VIEWER |
| --- | :---: | :---: | :---: |
| View data, dashboards, tags, groups | ✓ | ✓ | ✓ |
| Create tags / groups | ✓ | ✓ | |
| Curate (add/remove tags & group members) | ✓ | ✓ | |
| Delete tags / groups | ✓ | | |
| Edit / delete campaign data | ✓ | | |
| Manage admin users | ✓ | | |

Enforced server-side (`server/src/lib/auth.js`); the SPA mirrors the matrix only
to hide controls.

## The "person" model

People are spread across three forms. The `admin.people` **view** unifies them by
lowercased **email** into one identity, aggregating the forms used, country(ies),
investment details, confirmation status, and timestamps. Tags and group
memberships are keyed by that email, so a person who signed *and* registered a
case is one taggable/groupable entity.

## Layout

| Path | What |
| --- | --- |
| `server/` | Fastify backend: auth, RBAC, people/tags/groups/stats/users, migrations |
| `web/` | Vite + React SPA |
| `deploy/` | nginx vhost + systemd unit |

## Local development

Requires Postgres with the **API migrated first** (the `admin.people` view reads
the API's tables).

```bash
# Backend
cd server
npm install
cp .env.example .env            # set DATABASE_URL (same DB as the API), JWT_SECRET
npm run migrate                 # creates the admin schema
npm run seed-admin you@example.com 'a-strong-password'   # first SUPER_ADMIN
npm run dev                     # http://localhost:4000

# Frontend (separate terminal)
cd web
npm install
npm run dev                     # http://localhost:5180  (proxies /api → :4000)
```

## Production deploy

Handled by the repo-root `provision-server.sh` (it provisions www, api, and
admin together). In short, on the server:

1. Clone to `/opt/admin.honoryourcommitment.com`.
2. `server/`: `npm ci --omit=dev`, write `server/.env` (reuse the API's
   `DATABASE_URL`; set a random `JWT_SECRET`, `COOKIE_SECURE=true`, and the
   `SUPER_ADMIN_*` for first-boot seeding), `npm run migrate`.
3. `web/`: `npm ci && npm run build`, publish `web/dist/` to
   `/var/www/admin.honoryourcommitment.com`.
4. Install `deploy/admin.honoryourcommitment.service` (runs the backend) and
   `deploy/nginx.conf`; issue TLS with certbot.

### First SUPER_ADMIN

Set `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD` in `server/.env` — the server
seeds that account on first boot **only if no admin users exist**. Afterwards
create staff in the UI, and **clear those two env values**. You can also seed
manually any time: `npm run seed-admin <email> <password>` (idempotent upsert).

## Security notes

- This is a staff tool over personal data gathered for legal action. Put it
  behind an **IP allowlist / VPN / Cloudflare Access** in addition to login —
  see the commented block in `deploy/nginx.conf`.
- Passwords are hashed with scrypt (Node stdlib). Sessions are short-lived
  (12h) httpOnly Secure cookies. `JWT_SECRET` and DB creds live only in
  `server/.env` (chmod 600), never in git.
- Login is rate-limited. RBAC is enforced on every endpoint.
