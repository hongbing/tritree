# Artifact Type Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Tritree from a social-media-only generator into a reusable generation base with built-in artifact types, starting with `social-post` and `prd`.

**Architecture:** Keep the existing `Draft` view model as a compatibility adapter for the tree, diff, streaming, and edit surfaces. Add an `ArtifactType` registry that drives start-screen selection, AI context, panel labels, checks, and delivery actions. Persist the selected artifact type on each session so old sessions remain stable even if root preferences change later.

**Tech Stack:** Next.js App Router, React 19, SQLite `node:sqlite`, Zod, Vitest, Testing Library.

---

### Task 1: Domain And Registry

**Files:**
- Create: `src/lib/artifacts.ts`
- Modify: `src/lib/domain.ts`
- Test: `src/lib/artifacts.test.ts`, `src/lib/domain.test.ts`

- [ ] Add `ArtifactTypeIdSchema`, default `social-post`, and `artifactTypeId` to `RootPreferencesSchema`.
- [ ] Define built-in artifact types for `social-post` and `prd`, including prompt instructions, seed draft defaults, editor labels, action labels, checks, and delivery formatting.
- [ ] Verify legacy preferences default to `social-post` and PRD preferences parse.

### Task 2: Persistence

**Files:**
- Modify: `src/lib/db/client.ts`
- Modify: `src/lib/db/schema.ts`
- Modify: `src/lib/db/repository.ts`
- Test: `src/lib/db/repository.test.ts`

- [ ] Add `sessions.artifact_type_id` with default `social-post`.
- [ ] Store the root preference artifact type when creating a session.
- [ ] Return `session.artifactTypeId` in runtime state.
- [ ] Verify an existing session keeps its artifact type after root memory changes.

### Task 3: AI Context

**Files:**
- Modify: `src/lib/app-state.ts`
- Modify: `src/lib/ai/prompts.ts`
- Test: `src/lib/app-state.test.ts`, `src/lib/ai/director.test.ts`

- [ ] Include artifact type instructions in draft and option contexts.
- [ ] For PRD, ask the model to write structured PRD markdown in `draft.body`, keep `hashtags` empty, and use branch options as document decisions.
- [ ] Keep social-post prompts compatible with existing behavior.

### Task 4: Start Screen

**Files:**
- Modify: `src/components/root-memory/RootMemorySetup.tsx`
- Modify: `src/components/TreeableApp.tsx`
- Test: `src/components/root-memory/RootMemorySetup.test.tsx`

- [ ] Add a product type selector before the seed field.
- [ ] Submit `artifactTypeId` with root preferences.
- [ ] Preserve the selected artifact type when restarting from current settings.

### Task 5: Artifact Panel

**Files:**
- Modify: `src/components/draft/LiveDraft.tsx`
- Modify: `src/components/TreeableApp.tsx`
- Modify: `src/app/globals.css`
- Test: `src/components/draft/LiveDraft.test.tsx`

- [ ] Use artifact-specific panel labels and edit labels.
- [ ] Keep the existing publish assistant for `social-post`.
- [ ] Add a PRD delivery assistant with copyable markdown and required-section checks.
- [ ] Hide social-only hashtag and image-prompt editing for PRD.

### Task 6: Verification

**Files:**
- No source changes.

- [ ] Run focused tests for domain, repository, app-state, root setup, and live draft.
- [ ] Run `npm run typecheck`.
- [ ] Run the full test suite if focused tests pass.
