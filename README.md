# AquaTimbang

Predictive analytics-driven fish price transparency system.

- `src/` — React front-end (Vite), published to GitHub Pages.
- `backend/` — Django REST API.

## Run the backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # then edit .env with your own values
python manage.py migrate
python manage.py createsuperuser   # optional, for Django admin
python manage.py runserver
```

All secrets and machine-specific settings (secret key, MySQL password, allowed
hosts, CORS origins) are read from `backend/.env`, which git ignores. Leave
`DB_ENGINE` empty in `.env` to use a local SQLite file instead of MySQL.
Login security can also be tuned there: `SESSION_IDLE_MINUTES` (default 30),
`LOGIN_MAX_ATTEMPTS` (5) and `LOGIN_LOCKOUT_MINUTES` (15).

## Run the front-end

```bash
npm install
npm run dev
```

The API address comes from `VITE_API_BASE_URL` in `.env`
(default `http://127.0.0.1:8000/api`). Put a different value in `.env.local`
to override it on your computer only.

## Deploy to GitHub Pages

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds the site and
publishes it to `https://kentoy06.github.io/Aquatimbang-main/`.

To make the published site talk to a hosted backend, set the repository variable
`VITE_API_BASE_URL` (Settings → Secrets and variables → Actions → Variables) to
that backend's `/api` address, and add `https://kentoy06.github.io` to
`CORS_ALLOWED_ORIGINS` in the backend's `.env`.

## Tests

```bash
cd backend && python manage.py test api
```
