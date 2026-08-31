# live-match-notification

Ongoing, in-place-updating match notifications for Android.

One notification per match, mutated as the score changes — a 4-3 thriller
produces one notification that changes seven times, not seven notifications.

- **API 36+** uses the platform `Notification.ProgressStyle` (a Live Update):
  the match clock drives the progress bar, the halves are segments, goals are
  points along it, and the score becomes the status-bar chip text.
- **API 24-35** uses custom `RemoteViews` with crests, names, score and minute.

Requires a development build — this cannot run in Expo Go.

```ts
import * as LiveMatch from '../modules/live-match-notification';

await LiveMatch.ensureChannel();
await LiveMatch.show({
  matchId: 'espn:401879295',
  leagueName: 'English Premier League',
  homeName: 'Aston Villa', awayName: 'Arsenal',
  homeShort: 'AVL', awayShort: 'ARS',
  homeScore: 1, awayScore: 1,
  minute: 67, statusLabel: "67'", state: 'live',
  goalMinutes: [23, 61],
  ongoing: true, alert: true,
});
```
