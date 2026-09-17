# Daily Compass — Product and Technical Architecture

## Decision summary

- **Product name:** Daily Compass
- **Sidebar label:** Compass
- **Route:** `/compass`
- **API namespace:** `/api/compass`
- **Database prefix:** `compass_`
- **Primary promise:** “Know what matters now. If the day drifts, return at the next block.”
- **Core loop:** Orient → Act → Check in → Reset when needed → Close the day

Daily Compass is not an ADHD treatment, a task manager, or a large habit-tracking system. It is a calm course-correction layer across LifeOS. It gives the user one next action and makes returning easier than redesigning the day.

## Why this name

| Name | Decision | Reason |
| --- | --- | --- |
| **Daily Compass** | Chosen | Communicates orientation and returning without judgment. Works beside Finance Hub, Work Hub, and Learning Hub. |
| Brain OS | Reject | Sounds clinical and overpromises control over cognition. Also duplicates the LifeOS brand. |
| Routine Hub | Reject | Sounds rigid and implies perfect repetition. |
| Momentum | Reject | Positive when things go well, but can feel punitive after a missed day. |
| Focus Hub | Reject | Too narrow; the system also covers sleep, movement, learning, recovery, and reflection. |
| Rhythm | Reserve | Good supporting vocabulary, but too ambiguous as the main navigation label. |

### Product vocabulary

- **Daily Rhythm:** the recurring schedule
- **Next Step:** the single action shown now
- **Daily Five:** the five lightweight check-ins
- **Reset:** release missed blocks and continue from the next useful block
- **Focus Theme:** the one learning/building theme for the current 4–6 week period
- **Close the Day:** the five-minute reflection

## Product principles

1. **Next action over full-plan pressure.** The strongest visual element is always what to do now or next.
2. **Reset without punishment.** Missing a block never destroys the day or forces a restart.
3. **Five signals, not thirty habits.** Defaults are sleep, exercise, deep work, learning/building, and reflection.
4. **Plans are guidance, not debt.** Past blocks become released after a reset; they do not pile up as overdue tasks.
5. **Create before consume.** Morning and focus-block copy reinforces attention protection without policing device use.
6. **Progressive focus.** Focus duration can increase gradually, but the user controls the pace.
7. **No medical claims.** The module supports routines and attention-friendly environments; it does not diagnose or claim to treat ADHD.
8. **Useful with no AI.** Core scheduling, reset, check-ins, and reflection remain deterministic and available during model outages.

## Placement inside LifeOS

### Navigation

- Desktop sidebar: place **Compass** immediately after **Dashboard** and before **Work Hub**.
- Mobile: show Compass as the first item in the More sheet for the MVP.
- Dashboard: replace the generic “Live System Status” emphasis with a compact Compass card showing the current/next block and a single action.

### Integration boundaries

- **Dashboard** summarizes Compass; it does not own Compass state.
- **Work Hub** can receive a deep-work launch target, but Compass does not duplicate work tasks.
- **Learning Hub** can supply the active Focus Theme, but Compass only schedules the learning block.
- **Notes** remains the long-form capture system. The daily reflection stores short structured answers and may link to a note later.
- **AI Assistant** may read today’s Compass state. Any AI-triggered reset or schedule mutation requires explicit user confirmation.
- **Admin Planner** remains admin-only and separate. Daily Compass is personal and available to every user.

## Primary experience

### First-run setup

Keep setup to four steps:

1. Choose a starting template: **Early Builder**, **Standard Workday**, or **Start Blank**.
2. Confirm wake, work, learning, wind-down, and sleep times.
3. Confirm the Daily Five. All five are enabled by default and can be renamed later.
4. Choose in-app reminder preferences. Push notifications are offered only when delivery infrastructure exists.

The suggested Early Builder template is:

| Time | Block | Instruction |
| --- | --- | --- |
| 05:40 | Wake & move | Water, daylight, and prepare for exercise. |
| 06:00 | Exercise | Move without turning every session into maximum intensity. |
| 08:45 | Prepare | Choose one important task and remove distractions. |
| 09:00 | Deep work | Stay with one difficult task. |
| 12:30 | Reset | Eat, walk, and clear mental residue. |
| 18:00 | Learn/build | Continue the current Focus Theme. |
| 21:00 | Close the day | Capture, learn, and choose tomorrow’s one important thing. |
| 21:30 | Wind down | Low stimulation; protect sleep. |

### Today screen

```text
DAILY COMPASS                              Tue, 16 Sep

┌─────────────────────────────────────────────────────┐
│ NOW · DEEP WORK                         09:00–10:30 │
│ Finish the authentication flow                      │
│ Stay with one difficult task.                       │
│                                                     │
│ [ Start focus ]              [ I need a reset ]     │
└─────────────────────────────────────────────────────┘

TODAY'S RHYTHM                 DAILY FIVE       3 / 5
✓ 05:40 Wake & move            ✓ Sleep 7.5h+
✓ 06:00 Exercise               ✓ Exercise
● 09:00 Deep work              ✓ Deep work
○ 12:30 Reset                  ○ Learn/build
○ 18:00 Learn/build            ○ Reflection
○ 21:00 Close the day

ONE IMPORTANT THING
Finish the authentication flow                         [Edit]

FOCUS THEME
PostgreSQL performance · Week 2 of 5
```

The mobile layout places the Now card, Reset action, and Next Step above everything else. The full timeline and weekly context are secondary.

### Reset experience

Reset is a first-class action, not an error state.

When selected:

```text
The day is still usable.

Release the blocks that have passed and continue with:
12:30 · Lunch / reset

[ Continue from here ]   [ Choose another block ]
```

Reset behavior:

1. Record a reset event with the local timestamp.
2. Mark unresolved past blocks as `released`, not failed.
3. Select the nearest useful current or future block.
4. Return the updated Today payload in the same response.
5. Never erase completed blocks or reset the Daily Five.

### Close the day

The reflection has only three prompts:

- **Capture:** What is still occupying your mind?
- **Learn:** What did you understand today that you did not understand yesterday?
- **Tomorrow:** What is the single most important thing tomorrow?

Saving the reflection checks the reflection item and pre-fills tomorrow’s important thing. The user can close the day even if other items are incomplete.

## State model and next-step engine

Scheduled blocks are recurring definitions. Daily occurrences are computed on read and only receive database rows after the user starts, completes, releases, or edits one. This avoids generating thousands of future records.

For each scheduled block on the local date:

1. Apply an existing block event if one exists.
2. If completed or released, it is not eligible as the Next Step.
3. If now is within the block window plus its grace period, it is current.
4. Otherwise select the earliest upcoming block.
5. If unresolved blocks are in the past and no current block exists, expose `resetRecommended: true` and still return the next useful block.
6. After the final block, make Close the Day the Next Step until the day is closed.

`missed` is a derived presentation state. It is not stored as a permanent judgment. A Reset converts the relevant occurrences to `released`.

## Data model

Use a new additive migration: `db/migrations/014_daily_compass.sql`.

### `compass_plans`

One active rhythm per user, with room for future weekday/weekend variants.

- `id`, `user_id`, `name`
- `is_active`
- `focus_theme_id` nullable
- `default_grace_minutes`
- `created_at`, `updated_at`
- unique partial index for one active plan per user

### `compass_blocks`

Recurring block definitions.

- `id`, `user_id`, `plan_id`
- `kind`: `wake`, `exercise`, `prepare`, `deep_work`, `reset`, `recovery`, `learning`, `reflection`, `wind_down`, `custom`
- `title`, `instruction`
- `days_mask` using Monday-first bit positions
- `start_minute`, `duration_minutes`, `grace_minutes`
- `action_type`, `action_target_id` nullable for future cross-module links
- `sort_order`, `is_enabled`
- timestamps

Index: `(user_id, plan_id, is_enabled, start_minute)`.

### `compass_days`

One row per user and local date.

- `id`, `user_id`, `local_date`
- `important_thing`
- `capture_text`, `learn_text`, `tomorrow_text`
- `reset_count`
- `closed_at`
- timestamps

Unique index: `(user_id, local_date)`.

### `compass_block_events`

Sparse per-day state for scheduled blocks.

- `id`, `user_id`, `local_date`, `block_id`
- `status`: `started`, `completed`, `released`
- `started_at`, `completed_at`
- `actual_minutes`, `note`
- timestamps

Unique index: `(user_id, local_date, block_id)`.

### `compass_daily_checks`

- `user_id`, `local_date`
- `check_key`: `sleep`, `exercise`, `deep_work`, `learn_build`, `reflection`
- `completed_at`

Primary key: `(user_id, local_date, check_key)`.

### `compass_reset_events`

- `id`, `user_id`, `local_date`
- `occurred_at`
- `resume_block_id` nullable
- `reason` nullable and optional

Index: `(user_id, local_date, occurred_at)`.

### `compass_focus_themes`

- `id`, `user_id`, `title`, `description`
- `starts_on`, `ends_on`, `status`
- timestamps

Index: `(user_id, status, starts_on)`.

The user’s timezone continues to come from `user_preferences`; do not duplicate it in Compass tables.

## API design

### Fast read model

`GET /api/compass/today?date=2026-09-16`

Returns all data needed to render the Today screen:

```json
{
  "date": "2026-09-16",
  "timezone": "Asia/Kolkata",
  "day": {
    "importantThing": "Finish the authentication flow",
    "closedAt": null,
    "resetCount": 1
  },
  "blocks": [],
  "checks": {
    "sleep": true,
    "exercise": true,
    "deepWork": false,
    "learnBuild": false,
    "reflection": false
  },
  "nextStep": {},
  "resetRecommended": false,
  "focusTheme": {}
}
```

The endpoint should use a small set of parallel D1 reads and construct occurrences in memory. It must not perform one query per block.

### Commands

- `GET /api/compass/plan`
- `PUT /api/compass/plan`
- `POST /api/compass/blocks`
- `PATCH /api/compass/blocks/:id`
- `DELETE /api/compass/blocks/:id` (soft disable)
- `PATCH /api/compass/days/:date` for the important thing
- `PUT /api/compass/days/:date/checks/:key`
- `PUT /api/compass/days/:date/blocks/:blockId` with `started`, `completed`, or `released`
- `POST /api/compass/days/:date/reset`
- `POST /api/compass/days/:date/close`
- `GET /api/compass/week?start=2026-09-14`

Reset and Close the Day should use D1 batches so all affected state changes commit atomically. Check toggles should use an upsert and return the updated Today summary required for optimistic reconciliation.

## Frontend architecture

```text
src/pages/DailyCompass.jsx
src/components/Compass/
  CompassNowCard.jsx
  DayTimeline.jsx
  DailyFive.jsx
  ImportantThing.jsx
  ResetDialog.jsx
  ReflectionDialog.jsx
  RhythmEditor.jsx
  FocusThemeCard.jsx
src/services/compassApi.js
shared/api/compass.js
db/migrations/014_daily_compass.sql
```

`DailyCompass.jsx` owns query/loading/error orchestration. Components receive plain data and mutation callbacks. Schedule calculations and validation live in `shared/api/compass.js`, not inside React or the route handler.

Client behavior:

- Optimistically update checkbox and block completion states; roll back on failure.
- Reset and close actions use the full Today payload returned by the server.
- Do not reload the entire LifeOS dashboard after a Compass mutation.
- Cache Today by `user + local date`; invalidate when timezone or active plan changes.
- Keep timers client-side between sync points, using timestamps rather than decrementing stored seconds.

## Dashboard integration

Extend the existing aggregated `/api/dashboard` response with a compact Compass projection:

```json
{
  "compass": {
    "nextStep": {},
    "completedChecks": 3,
    "totalChecks": 5,
    "resetRecommended": false
  }
}
```

Load the Compass projection in parallel with finance, car, pantry, and meals. The Dashboard button should deep-link to `/compass` and say **Start**, **Continue**, **Reset**, or **Reflect** based on server state.

## Reminders and notifications

The current application stores notification preferences but does not implement push delivery. Do not imply that background reminders work in the MVP.

### MVP

- In-app Next Step card
- Optional browser notification while the PWA is open
- Upcoming-block indicator in Dashboard and Compass

### Later delivery infrastructure

- Web Push subscription storage
- Cloudflare scheduled Worker to identify due blocks
- Idempotent delivery log keyed by `user + block + date + reminder offset`
- Quiet hours derived from wind-down and wake times
- Action-oriented notification copy, for example: “Deep work starts now: finish the authentication flow.”

## Product metrics

Measure whether the system helps users return, not whether they are perfectly compliant:

- Percentage of days with one important thing selected
- Next Step start rate
- Median time from Reset to the next started block
- Percentage of days closed with a reflection
- Weekly active use of the Daily Five
- Schedule-edit frequency, which can reveal an unrealistic template

Do not make streaks the primary measure. Prefer “4 days checked in this week” and “3 successful returns” over language that frames one missed day as losing progress.

## MVP boundary

### Build in v1

- Sidebar route and responsive page
- First-run rhythm setup with one recommended template
- Today timeline and Next Step engine
- One important thing
- Daily Five
- Start, complete, release, Reset, and Close the Day
- Dashboard Compass projection
- Seven-day history without scoring or charts

### Defer

- AI-generated schedules
- Wearable integrations and automatic sleep/exercise detection
- Full background push infrastructure
- Calendar sync
- Social accountability
- Complex analytics, badges, and gamification
- Medical or ADHD-specific recommendations

## Implementation order

1. Add migration `014`, normalization helpers, and unit tests for local-date/day-mask/next-step/reset behavior.
2. Add `/api/compass` route handlers and deterministic domain functions.
3. Add `compassApi.js`, the Today page, setup, and mutation flows.
4. Add Compass to desktop navigation, mobile More, and page-name resolution.
5. Add the compact Compass projection to `/api/dashboard` in parallel with existing modules.
6. Add end-to-end D1 smoke coverage for setup, completion, reset, close, timezone boundaries, and user isolation.
7. Add reminder delivery only after the core loop is used successfully for 2–4 weeks.

## Acceptance criteria

- A new user can accept the recommended rhythm and see today in under two minutes.
- The screen shows exactly one primary Next Step.
- Completing or releasing a block updates the Next Step without a full-page reload.
- Reset never deletes completed work and atomically releases earlier unresolved blocks.
- Daily Five contains no more than five enabled items in v1.
- Close the Day works even with incomplete blocks or checks.
- All reads and writes are scoped to the authenticated user.
- Today respects the user’s configured IANA timezone around midnight and daylight-saving changes.
- The module functions without an LLM or external integration.
- The Dashboard loads Compass in parallel and does not add a serial request waterfall.
