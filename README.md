# LivescoreX

Live football scores for 259 competitions, built Kenya-first.

A TypeScript ingestion server that normalises free upstream feeds into one
schema and fans out deltas over WebSocket, plus an Expo / React Native app
implementing the wireframes.

```
server/   Node 20+ · ESPN adapter · state-aware scheduler · REST + WS
app/      Expo 55 · RN 0.83 · React Navigation · Reanimated 4
```

---

## Quick start

Two terminals.

```bash
cd server && npm install && npm run dev
```

```bash
cd app && npm install && npx expo start
```

The app defaults to `http://localhost:8787`. On a physical device that address
is the phone, not your Mac — point it at your LAN address instead:

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.20:8787 npx expo start
```

Useful server commands:

```bash
npm run sweep          # one-shot fixture sweep for today
npm run sweep -- 20260905
npm run depth          # which detail tabs each tier-1 league can populate
```

---

## Where the data comes from

Everything ships from ESPN's undocumented but unauthenticated JSON API. It is
free, has no rate limit worth the name if you are polite, and — crucially —
covers East and West Africa.

**ESPN's published catalogue is incomplete.** The official endpoint lists 218
soccer leagues. Probing FIFA country codes against the scoreboard endpoint
found 41 more that work but are not listed, including every league that makes
this app worth installing in Nairobi:

```
ken.1  Kenyan Premier League          nga.1  Nigerian Professional League
gha.1  Ghanaian Premier League        uga.1  Ugandan Premier League
zam.1  Zambian Super League           zim.1  Zimbabwean Premier Soccer League
```

`server/data/leagues.json` is the merged 259-competition catalogue.
`server/data/discover-leagues.py` regenerates it — worth re-running quarterly
to pick up leagues ESPN adds without announcing.

### Coverage is not uniform

Measured, not assumed:

| League group | Scores | Table | Timeline | Stats | Lineups |
|---|---|---|---|---|---|
| Big five Europe, UEFA | yes | yes | yes | yes | yes, with positions |
| Kenya, Nigeria, Ghana, Uganda, Zambia, Zimbabwe | yes | yes | **no** | **no** | **no** |

The African leagues return scores and a league table only. The app handles this
by building the detail tabs from `MatchDetail.available`, so a Kenyan fixture
simply has no Statistics tab rather than an empty one.

**If depth on local content matters, that needs a second source.** api-football
carries the Kenyan Premier League as league `276` and would fill the gap.
The `Source` interface in `server/src/sources/types.ts` exists for exactly this:
add an adapter, put it after `espn` in the array in `index.ts`, done.

Note the East African seasons ended in May 2026, so those leagues currently
return no fixtures at all. That is correct behaviour, not a bug — see below.

---

## Two upstream quirks that will bite

**1. `dates` is mandatory.** A bare scoreboard call falls back to the nearest
fixture when a league is out of season, so `ken.1` happily returns a May
matchday as if it were today. `fetchLeagueDay` always sends `?dates=` and
additionally drops anything not on the requested day.

**2. ESPN's percentages are inconsistent.** `possessionPct` is 0–100 (`"37.1"`)
but `passPct` is a 0–1 fraction rounded to one decimal (`"0.7"`), which throws
away all precision. Pass accuracy is therefore derived from
`accuratePasses / totalPasses`. Any ratio-like stat you add should be too.

**3. `formationPlace` is not a sequential index.** It is the classic positional
shirt convention — 2 is right-back, 5 and 6 are the centre-backs, 4 and 8 the
central midfielders. Filling formation lines in numeric order puts centre-backs
in midfield. The pitch layout uses `position.abbreviation` (`CD-L`, `AM-R`, `F`)
instead, which encodes both depth and lateral placement.

**4. Akamai rejects a User-Agent containing a parenthetical.**
`LivescoreX/0.1` returns 200; `LivescoreX/0.1 (+https://…)` returns 403. The
contact detail moves to an `X-Contact` header so we stay reachable without
tripping the bot rule.

---

## Architecture

### Polling is state-aware, and that is the whole design

Polling 259 competitions every 10s is ~2.2M requests/day at 26 rps. The egress
IP would be blocked within the hour. Instead:

```
04:00 daily   sweep every league once           259 requests
              → now we know every fixture and kickoff time today
during play   poll only leagues with a match in progress
              busy Saturday ≈ 40 concurrent → ~4 rps
otherwise     nothing
```

Roughly 50k requests/day instead of 2.2M, and freshness *improves* because the
budget goes to matches that are actually live. Tier 1 (30 competitions
including all six African leagues) polls at 10s; everything else at 30s.

### Blocked must never mean blank

Four things enforce this, and they are the difference between an app people
keep and one they uninstall:

1. **Clients never touch upstream.** They read this server. If every source
   dies, the app still serves the last known state.
2. **Fixtures are prefetched three days ahead** (seven for tier 1), so a total
   outage still leaves today's card, kickoff times and the table on screen.
3. **Circuit breaker with a sanity gate.** Three consecutive failures opens a
   source for five minutes. A source that starts returning 200-with-nothing is
   rejected too — a silent empty slate is a nastier bug than a 403.
4. **Failure never clears state.** `Store.markStale` flags a slate without
   discarding it; the app renders it behind a staleness banner. No spinner is
   ever drawn over data we already have.

### Deltas, not refetches

A goal on the wire is ~200 bytes. Refetching a scoreboard is ~200KB. On a
metered Kenyan data bundle that difference matters far more than latency, so
the socket sends only what changed and the client patches in place. Each frame
carries a monotonic `seq`; a gap tells the client it slept through something
and should resync rather than drift.

The socket closes when the app backgrounds — a live stream nobody is looking at
is pure cost, and background updates are the push notification's job.

### Storage

Deliberately none yet. Every byte the server holds is re-derivable from
upstream within one sweep, and the only user-owned data in MVP (favourites,
theme) lives on-device. A periodic JSON snapshot exists purely so a restart
mid-match serves last-known-good. Introduce Postgres when accounts and
cross-device sync land — for users and subscriptions, not for fixtures.

### Endpoints

```
GET  /health                                   scheduler + breaker state
GET  /v1/leagues                               259-competition catalogue
GET  /v1/matches?date=YYYYMMDD&leagues=a,b     fixtures grouped by league
GET  /v1/live?leagues=a,b                      in-play only
GET  /v1/matches/:id?league=slug               full detail + `available` flags
GET  /v1/standings/:slug                       league table
POST /v1/devices                               push registration
WS   /v1/stream                                delta frames
```

---

## Deliberate departures from the wireframes

Each of these is a decision, not an oversight.

**Auth is not a gate.** The wireframes put Sign In / Create account before any
content. Push targeting works off a device token and favourites persist
locally, so an account only buys cross-device sync. Onboarding now goes
straight to the league picker, and sign-in lives in Profile. A gate before
value is measurable drop-off on a market that is mostly low-end Android on
metered data.

**The drawer no longer mirrors the tab bar.** Matches, Settings and Profile
were all reachable from the tabs already. The drawer keeps what the tabs cannot
reach: the league browser and sign-out.

**Theme is one control with three states.** Two independent Light/Dark toggles
can be both on or both off, which has no meaning. Replaced with
System / Light / Dark, and System is honoured.

**No date strip on Live.** Live is always now, so the row would be inert. The
space goes to the league filter, which is what people actually reach for.

**Odds ship dark.** The Matches row renders odds and the schema carries them,
but `ODDS_ENABLED` defaults to false. Displaying odds is generally fine;
linking to a bookmaker or taking affiliate revenue makes this a gambling app
under Google Play policy, which in Kenya means BCLB licensing, an 18+ rating
and reduced AdMob demand. Flip the flag once that is settled — no code change.

**A league filter, which the wireframes did not have.** 259 competitions is
thousands of rows on a Saturday. Users follow a set during onboarding (Kenya
and the big five pre-ticked) and reach everything else through Browse leagues
or search.

**States the wireframes did not cover**, all implemented: no matches today, no
leagues followed, offline showing cached scores, stale banner with "updated
2m ago", row skeletons, and a lineup fallback list for leagues with no
formation grid.

---

## Notification roadmap

Implemented: permission, Android channel, device-token registration. The server
sends **FCM data messages**, not notification messages, so the app renders the
notification itself — that is what lets a score update a notification in place
instead of stacking one per goal.

Not implemented; both need native code, in priority order for an
Android-majority market:

1. **Android ongoing Live Update** — custom `RemoteViews` with crests and score,
   `setOngoing(true)` and `setOnlyAlertOnce(true)` so stat changes update
   silently. On API 36+ this becomes `Notification.ProgressStyle` and gets
   promoted to the status-bar chip. Highest value, do this first.
2. **iOS Live Activity / Dynamic Island** — a SwiftUI Widget Extension added via
   `expo-apple-targets`, updated by APNs pushes with
   `apns-push-type: liveactivity`.

Send direct to APNs and FCM rather than through Expo Push: it removes a hop and
Expo cannot carry Live Activity payloads.

---

## Production shape

The single-process WebSocket server here is the right thing for development and
for the first few thousand users. At scale, split it:

- **Pollers on a small Fly.io or Hetzner box with dedicated IPs.** Do not run
  them on Cloudflare Workers — Worker egress uses shared Cloudflare IPs that
  many sites already rate-limit, so you inherit someone else's reputation.
- **Fan-out on Cloudflare Durable Objects**, one per match, with WebSocket
  hibernation so idle connections between goals cost nothing.
- **A paid fallback source** (api-football, ~€30/mo) as the last adapter in the
  chain. It is licensed, it will not block you, and it means the app is never
  fully dark. Best money in the project.
