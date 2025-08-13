# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture Overview

This is a **Telegram City Rater** web app with a Node.js/Express backend and vanilla HTML/CSS/JS frontend. Users rate cities and airports through a Telegram Web App interface.

### Database Architecture
- **Primary DB**: Turso (libSQL) via `@libsql/client` 
- **Tables**: `city_votes`, `airport_votes`, `user_votes`, `user_airport_votes`, `users`
- **Auth**: Telegram initData validation + optional JWT tokens
- **Data Sources**: `cities.json`, `airports.json` (1,500+ cities)

### Key Components
- `backend/server.js` - Main Express server with all API endpoints
- `backend/db.js` - Database connection and schema initialization
- `script.js` - Frontend logic handling voting, rankings, and Telegram WebApp
- `index.html` - Single-page app with modal-based rankings view

### Security Model
- Telegram initData validation using `@telegram-apps/init-data-node`
- Optional JWT tokens (when `JWT_SECRET` env var is set)
- Rate limiting (express-rate-limit with IPv6-safe keys)
- Input validation with DB triggers for vote types
- CORS configured for known domains

## Development Commands

### Backend
```bash
cd backend
npm install
npm run start          # Start main server (server.js)
npm run start:db       # Start with DB server (server_with_db.js)
npm run test           # Run all smoke tests
npm run migrate        # Run database migrations
```

### Frontend
```bash
python3 -m http.server 8000  # Serve frontend locally
```

### Testing
```bash
cd backend
npm test  # Runs: test_smoke.js + test_telegram.js + test_jwt_rate_change.js
```

Individual test scripts:
- `node scripts/test_smoke.js` - Basic API health checks
- `node scripts/test_telegram.js` - Telegram integration tests
- `node scripts/test_jwt_rate_change.js` - JWT auth flow tests

## Environment Setup

Required backend `.env` variables:
```bash
TURSO_DATABASE_URL=libsql://your-db-url.turso.io
TURSO_AUTH_TOKEN=your-token
BOT_TOKEN=123456:ABC...
PORT=3000
JWT_SECRET=devsecret              # Optional, enables JWT auth
RANKINGS_CACHE_TTL_MS=20000       # Optional, cache TTL for rankings
```

## API Architecture

### Core Endpoints
- `GET /api/cities?userId=X` - Get cities for user to vote on
- `POST /api/vote` - Submit city/airport vote
- `POST /api/change-vote` - Change existing vote
- `GET /api/rankings` - City rankings (cached)
- `GET /api/hidden-jam-ratings` - Hidden gems rankings
- `GET /api/profile/:userId` - User profile with vote history

### Telegram Integration
- `POST /api/register-telegram` - Register via Telegram initData
- `GET /api/get-user-by-telegram/:telegramId` - Get user by Telegram ID

### Monitoring
- `GET /health` - Health check with DB status
- `GET /metrics` - Prometheus metrics

## Data Flow

1. **Registration**: Telegram initData → validate → create/find user → optional JWT
2. **Voting**: userId + cityId/airportId + voteType → validate → update aggregates
3. **Rankings**: Cached queries from vote aggregates with popularity scoring
4. **Profile**: Merge user votes with city/airport metadata

## Frontend State Management

- **Mode switching**: Cities vs Airports (`mode` variable)
- **Vote tracking**: Local `votedCount`, `totalCount` counters
- **JWT storage**: `localStorage` with `TOKEN_KEY`
- **API base**: `API_BASE_URL` points to deployed backend

## Testing Strategy

- Smoke tests verify basic API functionality
- Telegram tests validate initData flows
- JWT tests verify auth integration
- Rate limit testing included in smoke tests
- Use `curl` examples from README.md for manual testing

## Migration System

Database migrations in `backend/migrations/` directory:
- Format: `001_description.sql`
- Run with: `npm run migrate`
- Tracked in `migrations_applied` table

## Deployment Notes

- Backend: Deploy to Render/Railway with env vars
- Frontend: Update `API_BASE_URL` in script.js to deployed backend
- CORS: Add new domains to `CORS_ALLOWED_ORIGINS` env var
- Monitoring: `/metrics` endpoint for Prometheus scraping