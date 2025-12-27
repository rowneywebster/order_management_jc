Codex branch → main (safe merge) and Coolify deploy steps

Branch merge (update main with codex)
- Ensure working tree is clean: `git status`
- Switch to codex branch: `git checkout codex`
- Pull latest: `git pull`
- Switch to main: `git checkout main`
- Merge codex in: `git merge codex`
- Resolve conflicts if any, then commit
- Push main: `git push origin main`

Coolify deploy: services (backend API, WhatsApp worker, frontend, Redis)
Prep
- Set env in Coolify for each app: `DB_*`, `REDIS_URL`, `JWT_SECRET`, `DASHBOARD_URL`, `RIDER_WHATSAPP_NUMBERS` (optional fallback), `NEXT_PUBLIC_API_URL`, etc.
- Database migrations: apply `database/schema.sql` to your Postgres once.

Redis
- Use a managed Redis service in Coolify; note the `redis://...` URL for other apps.

Backend API service
- Repo path: Order_management/backend
- Build: Node 18/20, `npm install` then `npm run start`
- Ports: expose 3001
- Env highlights: `DB_*`, `REDIS_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN=12h`, `DASHBOARD_URL`, `RIDER_WHATSAPP_NUMBERS` (optional), `PORT=3001`

WhatsApp worker service
- Repo path: Order_management/backend
- Command: `node src/whatsapp-worker.js`
- Same env as backend (needs `REDIS_URL`, `DASHBOARD_URL`)
- Mount persistent volume for `backend/whatsapp-session`

Frontend service (Next.js)
- Repo path: Order_management/frontend
- Build: `npm install` then `npm run build`
- Start: `npm start` (or `npm run start` with next start)
- Env: `NEXT_PUBLIC_API_URL=<backend_url>`, `PORT` (e.g., 3000), `DASHBOARD_URL` (match public URL)

Order of deploy/start
- Ensure Postgres + Redis running
- Deploy backend API (uses DB/Redis)
- Deploy WhatsApp worker (uses Redis/DB for messages)
- Deploy frontend (points to backend URL)

After deploy checks
- Backend health: `GET /health`
- Login via `/login` with seeded users: admin `cargojoyful@gmail.com` (password `T7@wLz#3Qk9`), user `truphenamukiri@gmail.com` (`Laare2030`)
- Nairobi page reachable publicly at `/nairobi`; admin-only features require login
- Confirm WhatsApp session scanned for worker
