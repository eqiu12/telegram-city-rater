# Telegram City Rater

Backend: Node.js + Express, Turso (libSQL) via `@libsql/client`.

## Environment Variables (backend/.env)

- TURSO_DATABASE_URL: libSQL/Turso DB URL
- TURSO_AUTH_TOKEN: libSQL/Turso auth token
- BOT_TOKEN: Telegram Bot token used to validate `initData`
- PORT: Server port (default 3000)
- JWT_SECRET: Optional. If set, Telegram flows issue JWTs and API accepts Authorization: Bearer tokens
- RANKINGS_CACHE_TTL_MS: Optional. TTL in ms for `/api/rankings` and `/api/hidden-jam-ratings` cache (default 20000)

Example backend/.env:

```
TURSO_DATABASE_URL=libsql://your-db-url.turso.io
TURSO_AUTH_TOKEN=your-token
BOT_TOKEN=123456:ABC...
JWT_SECRET=devsecret
PORT=3000
```

## Install & Run (backend)

```
cd backend
npm i
node server.js
```

or with env loaded from .env:

```
cd backend
PORT=3000 node server.js
```

To run a second JWT-enabled instance for tests:

```
cd backend
JWT_SECRET=devsecret PORT=3002 node server.js
```

## Health Check

```
curl -s http://localhost:3000/health
```

Response:

```
{"status":"ok","uptime":123.45,"db":"ok"}
```

## Local Testing (curl)

Get a random city for a new UUID and vote:

```
UUID=$(uuidgen)
CITY_ID=$(curl -s "http://localhost:3000/api/cities?userId=$UUID" | python3 -c 'import sys,json;print(json.load(sys.stdin)["cities"][0]["cityId"])')
curl -s -i -X POST http://localhost:3000/api/vote \
  -H "Content-Type: application/json" \
  -d "{\"userId\":\"$UUID\",\"cityId\":\"$CITY_ID\",\"voteType\":\"liked\"}"
```

Change vote:

```
curl -s -i -X POST http://localhost:3000/api/change-vote \
  -H "Content-Type: application/json" \
  -d "{\"userId\":\"$UUID\",\"cityId\":\"$CITY_ID\",\"voteType\":\"disliked\"}"
```

Rankings and hidden gems:

```
curl -s http://localhost:3000/api/rankings | head -c 200
curl -s http://localhost:3000/api/hidden-jam-ratings | head -c 200
```

Rate limit smoke test (should eventually return 429):

```
for i in $(seq 1 130); do curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/vote -H "Content-Type: application/json" -d "{\"userId\":\"$UUID\",\"cityId\":\"$CITY_ID\",\"voteType\":\"dont_know\"}"; done | tail -n 5
```

## JWT Testing (optional)

Start server with JWT:

```
JWT_SECRET=devsecret PORT=3002 node backend/server.js
```

Requests may include `Authorization: Bearer <token>`. If the token contains a subject (sub) that represents a concrete userId, it must match the `userId` in the payload.

Example of mismatching token returning 403:

```
TOK=$(node -e "const jwt=require('jsonwebtoken');console.log(jwt.sign({telegramId:'123',hasUserId:true}, 'devsecret',{subject:'other-user',expiresIn:'1h'}))")
UUID=$(uuidgen)
CITY_ID=$(curl -s "http://localhost:3002/api/cities?userId=$UUID" | python3 -c 'import sys,json;print(json.load(sys.stdin)["cities"][0]["cityId"])')
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3002/api/vote \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOK" \
  -d "{\"userId\":\"$UUID\",\"cityId\":\"$CITY_ID\",\"voteType\":\"liked\"}"
```

## Notes

- Static file serving from backend is disabled; serve frontend separately.
- Rate limiting keys are IPv6-safe.
- Database enforces valid `vote_type` and unique non-null `users.user_id`.
- `/metrics` exposes Prometheus metrics; add the endpoint to your scraper.

### CORS configuration

- Default allowed origins include `https://eqiu12.github.io`, local hosts, `*.vercel.app`, and `https://ratethis.town`.
- To allow additional frontends (e.g., Render Static Site), set env `CORS_ALLOWED_ORIGINS` to a comma-separated list of origins.
  - Example: `CORS_ALLOWED_ORIGINS=https://your-frontend.onrender.com`

## Security Model

- Authentication: Telegram Mini App `initData` validated server-side using `@telegram-apps/init-data-node`. Invalid/missing `hash` returns 403.
- Authorization: If `JWT_SECRET` is set, successful Telegram registration/restore returns a signed JWT. Requests may include `Authorization: Bearer <token>`. When a `userId` is present in the payload, it must match the token subject.
- Rate limiting: Global limiter plus per-route stricter limiter on `/api/register-telegram` and `/api/get-user-by-telegram`. Keys use IPv6-safe generator.
- Input validation: Strict `voteType` allow-list on API and DB triggers enforcing `liked|disliked|dont_know`.
- Error handling: Centralized JSON errors with `requestId`; no stack traces in production responses.
- Transport: Use HTTPS with HSTS at your reverse proxy.

## Reverse Proxy (NGINX) Example

```nginx
server {
  listen 443 ssl http2;
  server_name api.example.com;

  # TLS config omitted for brevity

  gzip on;
  gzip_types application/json text/plain application/javascript text/css;

  # Security headers
  add_header X-Content-Type-Options nosniff;
  add_header X-Frame-Options DENY;
  add_header Referrer-Policy no-referrer-when-downgrade;
  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

  location / {
    proxy_pass http://backend:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    # Preserve/request IDs
    proxy_set_header X-Request-Id $request_id;
  }
}
```
# Telegram City Rater

A Telegram Web App that allows users to rate cities and see community rankings.

## Features

- 🏙️ Rate 1,500+ cities with like/dislike/don't know options
- 📊 View real-time community rankings
- 🎯 Continuous rating experience without interruptions
- 📱 Mobile-optimized Telegram Web App interface

## Tech Stack

- **Frontend**: HTML, CSS, JavaScript
- **Backend**: Node.js, Express.js
- **Data**: JSON-based city database
- **Platform**: Telegram Web Apps

## Local Development

### Prerequisites
- Node.js (v14 or higher)
- Python 3 (for local frontend server)

### Setup

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd telegram-city-rater
   ```

2. **Install backend dependencies**
   ```bash
   cd backend
   npm install
   ```

3. **Start the backend server**
   ```bash
   node server.js
   ```
   The backend will run on `http://localhost:3000`

4. **Start the frontend server** (in a new terminal)
   ```bash
   python3 -m http.server 8000
   ```
   The frontend will be available at `http://localhost:8000`

## Deployment

### Backend Deployment
- Deploy to Render, Railway, or Heroku
- Update the `API_URL` in `script.js` to point to your deployed backend

### Frontend Deployment
- Deploy to GitHub Pages, Netlify, or Vercel
- Use the deployed URL when creating your Telegram Web App

## Telegram Bot Setup

1. Create a bot with [@BotFather](https://t.me/botfather)
2. Create a Web App with `/newapp`
3. Set the URL to your deployed frontend
4. Share your bot with users!

## Project Structure

```
telegram-city-rater/
├── index.html          # Main HTML file
├── script.js           # Frontend JavaScript
├── style.css           # Styles
├── cities.json         # City database
├── backend/
│   ├── server.js       # Express server
│   ├── package.json    # Backend dependencies
│   └── node_modules/   # Backend packages
└── README.md           # This file
```

## Contributing

Feel free to submit issues and enhancement requests!

## License

MIT License # Force redeploy Wed Jun 25 02:51:15 MSK 2025
