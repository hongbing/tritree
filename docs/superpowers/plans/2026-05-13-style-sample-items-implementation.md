# Style Sample Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ambiguous single pasted-sample textarea with explicit representative-work items.

**Architecture:** Keep the existing `StyleProfileSetup` component and generation APIs. Change only the sample-step state, rendering, and request payload so each non-empty textarea becomes one sample while preserving internal blank lines.

**Tech Stack:** React 19 controlled components, Testing Library, Vitest, Next.js app code.

---

## File Structure

- Modify `src/components/root-memory/StyleProfileSetup.tsx`: sample item state, add/remove controls, counts, guidance, and `samples` payload.
- Modify `src/components/root-memory/StyleProfileSetup.test.tsx`: focused component tests for multiple sample items and request payload.
- Modify `src/components/root-memory/RootMemorySetup.test.tsx`: integration expectation for saved personal style samples.
- Modify `src/app/globals.css`: restrained styles for sample item controls, guidance, and counts.

## Task 1: Component Behavior

- [x] Write failing tests in `StyleProfileSetup.test.tsx` that add a second sample item, preserve blank lines in the first item, and assert the POST body contains two samples.
- [x] Run `npm test -- src/components/root-memory/StyleProfileSetup.test.tsx` and confirm the new test fails because the UI has one textarea.
- [x] Update `StyleProfileSetup.tsx` to manage `sampleTexts: string[]`, add/remove/update item helpers, show counts, and post trimmed non-empty items.
- [x] Run `npm test -- src/components/root-memory/StyleProfileSetup.test.tsx` and confirm the component tests pass.

## Task 2: Integration Expectation

- [x] Update `RootMemorySetup.test.tsx` to use the item UI and expect a multi-sample payload.
- [x] Run `npm test -- src/components/root-memory/RootMemorySetup.test.tsx`.

## Task 3: Styling And Verification

- [x] Add CSS for the sample guidance, item list, count rows, and mobile layout.
- [x] Run `npm test -- src/components/root-memory/StyleProfileSetup.test.tsx src/components/root-memory/RootMemorySetup.test.tsx`.
- [x] Run `npm run typecheck`.
