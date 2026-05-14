# Inspiration Seed List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let self-hosters configure an inspiration endpoint and show clickable inspiration items on the new seed page that fill the seed textarea.

**Architecture:** Add a server-side inspiration provider helper that reads `TRITREE_MOCK_INSPIRATIONS` for local debug data or `TRITREE_INSPIRATION_URL` for an external endpoint, normalizes `{ inspirations: [{ id, title, detail }] }`, and exposes it through an authenticated Next route. `TreeableApp` loads inspirations alongside existing setup metadata and passes them to `RootMemorySetup`, which renders the list only when items exist.

**Tech Stack:** Next.js App Router route handlers, React 19 client components, Zod-style runtime validation patterns already used in the app, Vitest and Testing Library.

---

### Task 1: Provider and API Contract

**Files:**
- Create: `src/lib/inspirations.ts`
- Create: `src/lib/inspirations.test.ts`
- Create: `src/app/api/inspirations/route.ts`
- Create: `src/app/api/inspirations/route.test.ts`
- Modify: `.env.example`
- Modify: `README.md`

- [x] **Step 1: Write failing provider tests**

Add tests that prove no URL means unavailable, configured URL means available, a provider response is normalized, empty/invalid items are dropped, and failed fetches return a clear error.
Also test that `TRITREE_MOCK_INSPIRATIONS=1` returns mock inspirations without calling `fetch`.

- [x] **Step 2: Run provider tests to verify RED**

Run: `npm test -- src/lib/inspirations.test.ts`
Expected: FAIL because `src/lib/inspirations.ts` does not exist.

- [x] **Step 3: Implement provider helper**

Create `src/lib/inspirations.ts` with:
- `MOCK_INSPIRATIONS_ENV = "TRITREE_MOCK_INSPIRATIONS"`
- `INSPIRATION_URL_ENV = "TRITREE_INSPIRATION_URL"`
- `INSPIRATION_TOKEN_ENV = "TRITREE_INSPIRATION_TOKEN"`
- `externalInspirationProviderAvailable(env = process.env)`
- `fetchExternalInspirations({ env, fetchImpl })`

When `TRITREE_MOCK_INSPIRATIONS` is truthy (`1`, `true`, or `yes`), return fixed local debug inspiration items and do not call `fetch`. Otherwise normalize only items whose `id`, `title`, and `detail` are non-empty strings. Use a bearer token header when `TRITREE_INSPIRATION_TOKEN` is configured.

- [x] **Step 4: Run provider tests to verify GREEN**

Run: `npm test -- src/lib/inspirations.test.ts`
Expected: PASS.

- [x] **Step 5: Write failing API route tests**

Add tests for `/api/inspirations`: unauthenticated returns 401, unconfigured returns `{ inspirations: [] }`, mock mode returns debug items, configured returns normalized items.

- [x] **Step 6: Run API route tests to verify RED**

Run: `npm test -- src/app/api/inspirations/route.test.ts`
Expected: FAIL because the route does not exist.

- [x] **Step 7: Implement API route**

Create `src/app/api/inspirations/route.ts` that requires the current user, calls `fetchExternalInspirations`, and returns `{ inspirations }`; auth errors should mirror existing route behavior.

- [x] **Step 8: Run API route tests to verify GREEN**

Run: `npm test -- src/app/api/inspirations/route.test.ts`
Expected: PASS.

### Task 2: Seed Page Rendering and Selection

**Files:**
- Modify: `src/components/root-memory/RootMemorySetup.tsx`
- Modify: `src/components/root-memory/RootMemorySetup.test.tsx`
- Modify: `src/components/TreeableApp.tsx`
- Modify: `src/components/TreeableApp.test.tsx`
- Modify: `src/app/globals.css`

- [x] **Step 1: Write failing component tests**

Add tests showing `RootMemorySetup` renders no inspiration area when the prop is empty, renders inspiration buttons when provided, and clicking a button fills the seed textarea with `detail`.

- [x] **Step 2: Run component tests to verify RED**

Run: `npm test -- src/components/root-memory/RootMemorySetup.test.tsx`
Expected: FAIL because `RootMemorySetup` has no inspiration prop or UI.

- [x] **Step 3: Implement RootMemorySetup UI**

Add an `inspirations?: Inspiration[]` prop. Render a compact section above the seed textarea only when there are items. Each button shows the title and uses `detail` as the fill value. Mark the active item with `aria-pressed` when its detail matches the current seed.

- [x] **Step 4: Run component tests to verify GREEN**

Run: `npm test -- src/components/root-memory/RootMemorySetup.test.tsx`
Expected: PASS.

- [x] **Step 5: Write failing app integration tests**

Add tests showing `TreeableApp startNewDraft` fetches `/api/inspirations` after setup metadata, passes returned items to the seed page, and still opens the blank seed page when the inspiration fetch fails.

- [x] **Step 6: Run app tests to verify RED**

Run: `npm test -- src/components/TreeableApp.test.tsx`
Expected: FAIL because `TreeableApp` does not fetch inspirations.

- [x] **Step 7: Implement TreeableApp loading**

Add inspiration state, fetch `/api/inspirations` in `loadRoot`, tolerate fetch failures by using an empty list, and pass the items to `RootMemorySetup`.

- [x] **Step 8: Add styling**

Add focused CSS for the inspiration section in `src/app/globals.css`, matching existing seed screen visual density and mobile behavior.

- [x] **Step 9: Run app tests to verify GREEN**

Run: `npm test -- src/components/TreeableApp.test.tsx`
Expected: PASS.

### Task 3: Final Verification

**Files:**
- All changed files.

- [x] **Step 1: Run focused tests**

Run:
`npm test -- src/lib/inspirations.test.ts src/app/api/inspirations/route.test.ts src/components/root-memory/RootMemorySetup.test.tsx src/components/TreeableApp.test.tsx`
Expected: PASS.

- [x] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [x] **Step 3: Review diff**

Run: `git diff --stat` and `git diff`
Expected: Only inspiration provider, route, seed page UI, tests, and documentation are changed.
