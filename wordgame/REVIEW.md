# Production Readiness Review: Wordgame ("В тему!")

**Date:** 2026-03-07
**Verdict:** NOT production-ready

---

## CRITICAL Issues

### 1. Static files expose server source code and user data
**File:** `server.js:28`
```js
app.use(express.static(__dirname));
```
Serves the **entire project directory** as static files. Anyone can access `/server.js`, `/bot.js` (source code), `/data/leaderboard.json` (player data), `/data/subscribers.json` (Telegram chat IDs), `/package.json`.

**Fix:** Serve only a dedicated `public/` directory containing client-side files.

### 2. Remote code execution via puzzle-loader
**File:** `puzzle-loader.js:56`
```js
const data = new Function(`return ${dataStr}`)();
```
This is essentially `eval()` on code fetched from GitHub. If the GitHub account or network is compromised, arbitrary JS runs in every user's browser.

**Fix:** Use `JSON.parse()` with JSON-format puzzle files, or validate/sanitize the data.

### 3. No authentication on leaderboard API
**File:** `server.js:64-93`

Anyone can POST arbitrary stats for any player ID with a single `curl` command. No rate limiting, no auth tokens, no validation beyond presence of `id` and `name`.

**Fix:** Add HMAC-signed requests or Telegram `initData` verification.

### 4. CORS wildcard on WebSocket
**File:** `server.js:18`
```js
const io = new Server(server, { cors: { origin: '*' } });
```
Allows any website to establish WebSocket connections.

**Fix:** Restrict to your domain(s).

---

## HIGH Issues

### 5. No request body size limit
**File:** `server.js:27`

`express.json()` without `{ limit: '10kb' }` allows multi-GB request bodies that exhaust memory.

### 6. Memory leak — abandoned duels
**File:** `server.js:178-179`

`activeduels` only cleaned 30s after `resolveDuel()`. Duels where both players disconnect before resolution stay in memory forever.

### 7. Synchronous file I/O blocks event loop
**Files:** `server.js:42,52`, `bot.js`

`readFileSync`/`writeFileSync` called on every API request. Under load, blocks the entire Node.js event loop.

### 8. Leaderboard data corruption risk
**File:** `server.js:59`

In-memory data written to disk synchronously. Server crash mid-write → corrupted/truncated JSON file. No backup, no atomic write.

### 9. No security headers
No `helmet`, no `X-Content-Type-Options`, `X-Frame-Options`, CSP, etc.

### 10. No graceful shutdown
No `SIGTERM`/`SIGINT` handlers. Active WebSocket connections and pending writes dropped on deploy.

### 11. `process.exit(1)` in bot.js kills the server
**File:** `bot.js:25`

If `BOT_TOKEN` is missing, `process.exit(1)` terminates the entire server — despite the bot being optional in `server.js:565-573`.

---

## MEDIUM Issues

### 12. Bot uses polling in production
**File:** `bot.js:109` — Use webhooks instead of polling for production.

### 13. No HTTPS enforcement
Server only binds HTTP. Need TLS termination or reverse proxy with redirect.

### 14. No database
All state in JSON files. No concurrent access safety, no ACID guarantees, no backup strategy.

### 15. XSS vectors via innerHTML
Multiple places insert data via `innerHTML`. Currently mitigated by `escapeHtml()` for user data, but fetched puzzle data (via `new Function`) could inject scripts.

---

## LOW Issues

### 16. Global scope pollution
All client JS uses global variables (`save`, `puzzle`, `selected`, etc). No modules or namespacing.

### 17. No tests
Zero test coverage.

### 18. No structured logging
Only `console.log`/`console.warn`. No log levels, rotation, or monitoring.

### 19. Unused variable
`duel.js:25` — `const protocol` computed but never used.

### 20. Dependencies not pinned
`package.json` uses `^` ranges that may pull breaking changes.

---

## What's Done Well

- Clean, well-commented code with modular file organization
- Good Telegram WebApp integration (fullscreen, haptics, safe areas, back button)
- `escapeHtml()` used for user-generated content
- Graceful fallbacks for audio, haptics, clipboard, share API
- `.gitignore` properly excludes sensitive files
- Bot handles blocked users (403 removal)
- Save system uses defaults spread for forward compatibility

---

## Priority Fix Order

1. Move client files to `public/` and only serve that directory
2. Replace `new Function()` with `JSON.parse()` in puzzle-loader
3. Add rate limiting + Telegram initData verification to API
4. Add `express.json({ limit: '10kb' })`
5. Remove `process.exit(1)` from bot.js
6. Add `helmet` security headers
7. Switch to async file I/O or use a database
8. Add graceful shutdown handlers
9. Restrict CORS/WebSocket origins
10. Add basic test coverage
