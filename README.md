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

Some things are unavailable from ESPN **anywhere**, in any league:

| Asked for | Status |
|---|---|
| Live player ratings | **Not available.** ESPN publishes counting stats (fouls, passes) but no rating. Sofascore and FotMob compute their own; there is nothing to normalise here. |
| Coaches / managers | **Not available.** Absent from both the summary and the team resource. |
| Injury lists | **Not available.** The per-team injuries endpoint returns an empty set for every soccer league checked. |
| Stadium, referee, attendance | Available — shipped on the Info tab. |
| Head to head | Available — last five meetings. |
| Odds | Available — see below. |

All three gaps are the same fix: a second adapter. FotMob has ratings, coaches
and injuries; the `Source` interface exists to take it.

**If depth on local content matters, that needs a second source.** api-football
carries the Kenyan Premier League as league `276` and would fill the gap.
The `Source` interface in `server/src/sources/types.ts` exists for exactly this:
add an adapter, put it after `espn` in the array in `index.ts`, done.

Note the East African seasons ended in May 2026, so those leagues currently
return no fixtures at all. That is correct behaviour, not a bug — see below.

---

## Upstream quirks that will bite

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

### The match clock is interpolated, not polled

The most common complaint about a scores app is that it trails a scout-fed
service like Flashscore by about a minute. Most of that gap is not the
pipeline — it is the clock granularity described above. Upstream publishes
whole minutes that change roughly once a minute, so a received value is on
average ~30s old before it leaves their servers.

Polling faster cannot fix that, so the app does it on the display side: once a
minute value has been held for 45 seconds it is more likely than not that the
true minute has advanced, so tick once — and never more than once, so a genuine
stall (VAR, an injury break) cannot run away. Any server update snaps straight
back to the authoritative value.

Live polling is still tight — 5s for tier 1, 12s for tier 2 — because that
governs **goal** freshness, which is what people actually notice. The
state-aware scheduler keeps the volume affordable regardless.

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

**Odds are behind a flag.** Fixture rows show three-way decimal odds when
`ODDS_ENABLED=true`; they are hidden once a match is under way, since the
source only quotes pre-match. The flag exists because displaying odds is
generally fine, but linking to a bookmaker or taking affiliate revenue makes
this a gambling app under Google Play policy — in Kenya that means BCLB
licensing, an 18+ rating and reduced AdMob demand. Displaying only, as here, is
the low-risk end of that; the flag means a store reviewer's objection is a
config change rather than a release.

**A league filter, which the wireframes did not have.** 259 competitions is
thousands of rows on a Saturday. Users follow a set during onboarding (Kenya
and the big five pre-ticked) and reach everything else through Browse leagues
or search.

**States the wireframes did not cover**, all implemented: no matches today, no
leagues followed, offline showing cached scores, stale banner with "updated
2m ago", row skeletons, and a lineup fallback list for leagues with no
formation grid.

---

## Notifications

Implemented end to end for Android, and the reason is simple: the market is
~95% Android, so a Live Update in the shade is worth more than anything else
that could be built next.

### How it works

The server sends FCM **data** messages, never notification messages. Nothing is
rendered until the app renders it — which is precisely what allows one
notification per match, mutated as the score changes, instead of a new
notification stacking up on every goal.

```
score/state delta  →  Notifier (coalesce 2s, throttle, rank)
                   →  FCM v1 data message, collapse_key = matchId
                   →  background task or foreground listener
                   →  native module posts/updates notification id = hash(matchId)
```

**On API 36+** the notification uses the platform `Notification.ProgressStyle`
— an Android Live Update. The match clock drives the progress bar, the two
halves are segments, **goals are points along the bar**, and the score becomes
the short critical text in the status-bar chip. This is the closest Android
equivalent of an iOS Live Activity.

**On API 24–35** it falls back to custom `RemoteViews`: crests, team names,
score and minute, `setOngoing(true)` and `setOnlyAlertOnce(true)`.

### What is and is not worth a push

A minute tick is not news. Goals, kickoff, half time and full time are.

- Goals and period changes go at FCM priority `high` and alert.
- Everything else updates the already-visible notification **silently**, and is
  capped at one per match per device per minute. Without that cap a 90-minute
  match would push ~90 times per viewer to change a number nobody is watching.
- `collapse_key` is the match id, so an undelivered older update is replaced
  rather than queued behind.
- Deltas are coalesced over 2s, because a goal usually arrives as a score delta
  and a state delta in the same tick.
- Full time dismisses the notification after five minutes. A dead fixture
  pinned to the shade forever is the most common complaint about ongoing
  notifications.
- FCM reporting a dead token prunes it from the registry.

### Setup

Push runs in dry-run mode — logging what it would send — until credentials
exist, so everything else works untouched in development.

1. Create a Firebase project, add an Android app with package
   `app.livescorex.mobile`, download `google-services.json` into `app/`.
2. Download a service-account key and point the server at it:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json npm run dev
```

Testing without waiting for a real goal — you cannot make Arsenal score:

```bash
DEBUG_PUSH=true npm run dev
curl -X POST localhost:8787/v1/debug/push \
  -H 'Content-Type: application/json' \
  -d '{"matchId":"espn:401879295","kind":"goal"}'
```

This drives the same code path as a live delta, so what appears on the device
is exactly what a real goal produces.

### Requires a development build

The native module cannot run in Expo Go:

```bash
cd app && npx expo run:android
```

## Installing the APK on a phone

Fastest route with a device attached (USB or wireless ADB):

```bash
cd app/android
EXPO_PUBLIC_API_URL=http://<your-lan-ip>:8787 ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
adb install -r app/build/outputs/apk/release/app-release.apk
```

**Android blocks cleartext HTTP from API 28**, and a release build has no
`usesCleartextTraffic` attribute at all — so an APK pointed at an `http://`
dev server fails every request *silently*, which looks exactly like a broken
app. `plugins/withCleartextTraffic.js` sets it. That is a development
affordance: production should terminate TLS and the plugin should come out.

Or build both ABIs for a phone you cannot plug in:

```bash
cd app
EXPO_PUBLIC_API_URL=http://<your-lan-ip>:8787 npx expo prebuild --platform android
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a
```

The APK lands in `app/android/app/build/outputs/apk/release/`. It is signed
with the debug keystore — installable and self-contained, not for distribution.

Transfer it to the phone and allow installation from unknown sources.

**The phone must reach the server.** Run it bound to your LAN and keep the
phone on the same Wi-Fi:

```bash
cd server && ODDS_ENABLED=true npm run dev
```

If your machine's address changes, there is no need to rebuild: **Settings →
Server** takes a new address and tests it. That field exists precisely because
re-cutting an APK for a DHCP lease change is a miserable way to test.

### Still to do: iOS Live Activity

A SwiftUI Widget Extension added via `expo-apple-targets`, updated by APNs
pushes with `apns-push-type: liveactivity` against the per-activity token. The
server already sends the matching `apns` block on every message, so the work is
entirely on the client side. Deliberately last — on this market it reaches a
small minority of users.

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
