# TODO — Noted Issues & Nitpicks

## ~~Revert volume slider (commit 873e746)~~ DONE
- Removed slider UI + ttsGain state/effect/callback from SettingsCard.tsx.
- The useTTS.ts boost (0633388) is kept — correctly gated at `g > 1`.

## ~~"I said it right" button shows on correct answers~~ DONE
- Gated override button to only appear when `feedback.grade !== 'correct'`.
- Renamed label from "I said it right" to "override" for clarity.

---

## Beta user identity — research findings & proposal

### Current state
- `Session.user_id` exists (optional, nullable) but is never set by the client — all sessions are `user_id: null`.
- `ItemStat`, `FeatureStat`, `FamilyStat` are **global** — no user_id field. All users share the same SRS state.
- Settings live in localStorage (device-scoped, no server sync).
- No auth, no User table, no middleware.

### The problem
If a beta user drills, their attempts update the same ItemStat/FeatureStat/FamilyStat rows that drive Mike's scheduling. Wrong answers from a beta user demote Mike's mastered words back to recognition.

### Lightest viable approach: anonymous device identity

**Client side:**
- On first visit, generate a UUID and store in localStorage as `daber.userId`.
- Pass it in all API calls that create sessions (already supported by the API).

**Schema migration:**
- Add `user_id String?` to `ItemStat`, `FeatureStat`, `FamilyStat`.
- Update composite keys/unique constraints to include user_id.

**Server side (7 files):**
- `POST /api/sessions` — already accepts userId; no change needed.
- `POST /api/attempts` — look up session.user_id, pass to stat updates.
- `POST /api/attempts/override` — scope stat recomputation to user_id.
- `GET /next-item` — scope all stat reads (ItemStat, FeatureStat, FamilyStat) to user_id.
- Dashboard/progress queries — filter by user_id.

**Migration path for existing data:**
- All current data has `user_id = NULL`.
- Option A: assign all null data to a "mike" userId, then Mike's client sets that userId.
- Option B: treat null as Mike's identity, new users get UUIDs. Simpler but less clean.

### What this does NOT include
- Login/password — no friction, no accounts.
- Server-stored settings — stays in localStorage per device.
- Admin auth — still open. Could add basic auth or env-gated path separately.

### Files that need changes
1. `Daber/prisma/schema.prisma` — add user_id to 3 stat tables
2. `Daber/app/StartOrContinueButton.tsx` — pass userId from localStorage
3. `Daber/app/api/attempts/route.ts` — scope stat writes
4. `Daber/app/api/attempts/override/route.ts` — scope stat recomputation
5. `Daber/app/api/sessions/[sessionId]/next-item/route.ts` — scope stat reads
6. `Daber/app/page.tsx` — scope dashboard aggregates
7. `Daber/lib/generation/pipeline.ts` — scope weak/strong item selection (optional)
