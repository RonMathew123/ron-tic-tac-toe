# Review: Random Match

I traced the "Random Match" flow in `src/hooks/useOnlineGame.ts` and the `games` table guard. The feature mostly works, but there are four real bugs plus two UX gaps. Nothing else in the app needs to change.

## Issues found

### 1. Matchmaking almost never finds an opponent (critical)
In the search query:
```
.neq("player_x", playerId.current).neq("player_o", playerId.current)
```
A waiting game has exactly one filled slot and one `NULL` slot. In PostgREST/SQL, `<>` against `NULL` is *unknown* and filters the row **out**. So every waiting game gets excluded and each user just creates their own room — two people clicking "Random Match" at the same time will each sit in their own lobby forever.

Fix: drop the `.neq` pair and instead require an empty slot, e.g. filter `player_x=is.null` OR `player_o=is.null` (two queries, or an `.or(...)` string), and defensively skip a row where the other slot equals my id.

### 2. Join race can crash the second joiner
Two clients can read the same waiting row and both try to `UPDATE ... status='active'`. The DB guard rejects the loser with "player_x cannot be changed once set", which currently surfaces as a red error screen.

Fix: scope the update with `.is('player_x', null)` (or `player_o`) in addition to `status='waiting'`, treat "0 rows updated" as "someone beat me to it", and retry the search once before giving up.

### 3. Leaving the search leaks a "waiting" row forever
If the user hits "Abort" or navigates away while still waiting, the hook never calls `abort()` on unmount, so the row stays `waiting` and pollutes future matchmaking (and, combined with bug #1 being fixed, wastes the next player's join attempt).

Fix: in the hook's cleanup, if the game is still `waiting` and I created it, mark it `aborted`. Also call `abort()` on `beforeunload` best-effort.

### 4. React StrictMode double-invoke can create two waiting rooms in dev
The init effect isn't idempotent — StrictMode's double mount can insert two rows before the first `setGame` lands.

Fix: guard with a `didInit` ref so the async init runs once per mount pair.

## UX gaps (smaller)

### 5. "Preferred token" is silently ignored when joining
The pre-game lobby lets the user pick X / O / random for Random Match, but if they end up *joining* an existing room they always get whatever slot is missing. Either:
- hide the token picker for Random Match (matches how Private/Join already works), or
- keep the picker and, when it disagrees with the only free slot, skip that room and keep searching.

Recommend option A (hide it) — simpler and matches user expectation that "random" means random.

### 6. No "searching…" feedback beyond a spinner
Waiting screen for random shows only a spinner + "Searching the neon grid…". Consider a lightweight elapsed timer and a "Still searching — cancel?" hint after ~15s. Optional polish.

## Out of scope / not changing
- Local, Bot, and Private Room flows.
- DB schema and the `games_guard` trigger — the fixes above are all client-side and work within the existing policies.
- Styling / layout.

## Files touched
- `src/hooks/useOnlineGame.ts` — fix bugs 1–4.
- `src/components/game/PreGameLobby.tsx` — hide the X/O/random picker for Random Match (bug 5).
- (Optional) `src/components/game/GameScreen.tsx` — add elapsed-time hint on the waiting screen (bug 6) if you want it.

Want me to include the optional #6 polish, or just ship the four bug fixes + hiding the token picker?
