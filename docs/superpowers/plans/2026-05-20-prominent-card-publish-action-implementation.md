# Prominent Card Publish Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the social-post `发布` action a prominent fixed primary action at the lower right of the rendered social-post card while preserving the existing publish assistant behavior.

**Architecture:** Keep the feature inside `SocialPostRenderer`: the renderer still owns publish state and the publish assistant. Move only the publish button out of the heading action cluster into a dedicated card-level action container, and use CSS to anchor that container to the card surface. Tests assert the DOM boundary and behavior; CSS provides the visual hierarchy.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Testing Library, lucide-react.

---

## File Structure

- Modify `src/artifacts/plugins/social-post/SocialPostRenderer.test.tsx`
  - Add focused renderer tests for the new publish action placement, publish dialog behavior, busy disabled state, and edit/publish mutual exclusion.
- Modify `src/artifacts/plugins/social-post/SocialPostRenderer.tsx`
  - Keep existing publish state and helper behavior.
  - Move the `发布` button from `.social-post-panel__actions` into a new `.social-post-panel__primary-action` container.
  - Add small handler functions so publish toggling and edit entry are explicit and testable.
- Modify `src/app/globals.css`
  - Style `.social-post-panel__primary-action` as a fixed lower-right action surface inside `.social-post-panel`.
  - Give the publish button stronger primary visual treatment only in that container.
  - Add bottom padding to `.social-post-panel__scroll` so the fixed action does not cover final content.

## Task 1: Renderer Tests, Markup, And Styling

**Files:**
- Modify: `src/artifacts/plugins/social-post/SocialPostRenderer.test.tsx`
- Modify: `src/artifacts/plugins/social-post/SocialPostRenderer.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Write failing renderer tests**

In `src/artifacts/plugins/social-post/SocialPostRenderer.test.tsx`, update the Testing Library import:

```ts
import { fireEvent, render, screen, within } from "@testing-library/react";
```

Add these tests inside the existing `describe("SocialPostRenderer", () => { ... })` block, after the `saves edited social post payloads` test:

```ts
  it("renders publish as a prominent card action outside the heading action cluster", () => {
    render(
      <SocialPostRenderer
        artifact={createArtifact({ title: "标题", body: "正文", hashtags: ["#AI"], imagePrompt: "图" })}
        isBusy={false}
        onSave={vi.fn()}
      />
    );

    const headingActions = document.querySelector(".social-post-panel__actions");
    expect(headingActions).toBeInstanceOf(HTMLElement);
    expect(within(headingActions as HTMLElement).queryByRole("button", { name: "发布" })).not.toBeInTheDocument();
    expect(within(headingActions as HTMLElement).getByRole("button", { name: "编辑" })).toBeInTheDocument();

    const primaryAction = document.querySelector(".social-post-panel__primary-action");
    expect(primaryAction).toBeInstanceOf(HTMLElement);
    expect(within(primaryAction as HTMLElement).getByRole("button", { name: "发布" })).toBeInTheDocument();
  });

  it("opens the publish assistant from the prominent card action", async () => {
    render(
      <SocialPostRenderer
        artifact={createArtifact({ title: "标题", body: "正文", hashtags: ["#AI"], imagePrompt: "图" })}
        isBusy={false}
      />
    );

    const primaryAction = document.querySelector(".social-post-panel__primary-action");
    expect(primaryAction).toBeInstanceOf(HTMLElement);

    const publishButton = within(primaryAction as HTMLElement).getByRole("button", { name: "发布" });
    expect(publishButton).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(publishButton);

    expect(publishButton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("dialog", { name: "发布助手" })).toBeInTheDocument();
  });

  it("disables the prominent publish action while busy", () => {
    render(
      <SocialPostRenderer
        artifact={createArtifact({ title: "标题", body: "正文", hashtags: ["#AI"], imagePrompt: "图" })}
        isBusy={true}
      />
    );

    const primaryAction = document.querySelector(".social-post-panel__primary-action");
    expect(primaryAction).toBeInstanceOf(HTMLElement);
    expect(within(primaryAction as HTMLElement).getByRole("button", { name: "发布" })).toBeDisabled();
  });

  it("closes the publish assistant before entering edit mode", async () => {
    render(
      <SocialPostRenderer
        artifact={createArtifact({ title: "标题", body: "正文", hashtags: ["#AI"], imagePrompt: "图" })}
        isBusy={false}
        onSave={vi.fn()}
      />
    );

    const primaryAction = document.querySelector(".social-post-panel__primary-action");
    expect(primaryAction).toBeInstanceOf(HTMLElement);

    await userEvent.click(within(primaryAction as HTMLElement).getByRole("button", { name: "发布" }));
    expect(screen.getByRole("dialog", { name: "发布助手" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "编辑" }));

    expect(screen.queryByRole("dialog", { name: "发布助手" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "标题" })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run:

```bash
npm test -- src/artifacts/plugins/social-post/SocialPostRenderer.test.tsx -t "publish"
```

Expected: FAIL. At least one failure should mention `.social-post-panel__primary-action` is missing or the heading action cluster still contains the `发布` button.

- [ ] **Step 3: Add explicit publish and edit handlers**

In `src/artifacts/plugins/social-post/SocialPostRenderer.tsx`, add these functions after `copyPublishText` and before `closeSelectionEdit`:

```ts
  function togglePublishPanel() {
    setPublishCopyError("");
    setCopiedPublishAction(null);
    setIsPublishPanelOpen((open) => !open);
  }

  function enterEditMode() {
    setIsPublishPanelOpen(false);
    setPublishCopyError("");
    setCopiedPublishAction(null);
    setIsEditing(true);
  }
```

- [ ] **Step 4: Move the publish button out of the heading action cluster**

In `src/artifacts/plugins/social-post/SocialPostRenderer.tsx`, replace the current `panel-heading` block:

```tsx
      <div className="panel-heading">
        <Sparkles size={16} />
        <span>社媒内容</span>
        <div className="social-post-panel__actions">
          <button
            aria-expanded={isPublishPanelOpen}
            className="work-publish-button"
            disabled={isBusy}
            onClick={() => {
              setPublishCopyError("");
              setCopiedPublishAction(null);
              setIsPublishPanelOpen((open) => !open);
            }}
            type="button"
          >
            <Send aria-hidden="true" size={13} />
            <span>发布</span>
          </button>
          {onSave ? (
            <button className="work-edit-button" disabled={isBusy} onClick={() => setIsEditing(true)} type="button">
              编辑
            </button>
          ) : null}
        </div>
      </div>
```

with:

```tsx
      <div className="panel-heading">
        <Sparkles size={16} />
        <span>社媒内容</span>
        <div className="social-post-panel__actions">
          {onSave ? (
            <button className="work-edit-button" disabled={isBusy} onClick={enterEditMode} type="button">
              编辑
            </button>
          ) : null}
        </div>
      </div>

      <div className="social-post-panel__primary-action">
        <button
          aria-expanded={isPublishPanelOpen}
          className="work-publish-button"
          disabled={isBusy}
          onClick={togglePublishPanel}
          type="button"
        >
          <Send aria-hidden="true" size={13} />
          <span>发布</span>
        </button>
      </div>
```

- [ ] **Step 5: Style the fixed card-level publish action**

In `src/app/globals.css`, replace the current `.social-post-panel__scroll` rule:

```css
.social-post-panel__scroll {
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 18px;
  scrollbar-gutter: stable;
}
```

with:

```css
.social-post-panel__scroll {
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 18px;
  padding-bottom: 58px;
  scrollbar-gutter: stable;
}
```

Add this rule after `.social-post-panel__actions`:

```css
.social-post-panel__primary-action {
  position: absolute;
  right: 18px;
  bottom: 14px;
  z-index: 3;
  display: flex;
  justify-content: flex-end;
  pointer-events: none;
}
```

Replace the current `.work-publish-button` and `.work-publish-button[aria-expanded="true"]` rules:

```css
.work-publish-button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.work-publish-button[aria-expanded="true"] {
  color: #102033;
  background: #e0f2fe;
}
```

with:

```css
.work-publish-button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.social-post-panel__primary-action .work-publish-button {
  min-height: 38px;
  padding: 8px 13px;
  color: #102033;
  background: #facc45;
  border: 1px solid rgba(180, 83, 9, 0.16);
  box-shadow: 0 12px 28px rgba(180, 83, 9, 0.18);
  pointer-events: auto;
}

.work-publish-button[aria-expanded="true"] {
  color: #102033;
  background: #e0f2fe;
}

.social-post-panel__primary-action .work-publish-button[aria-expanded="true"] {
  color: #102033;
  background: #fde68a;
  border-color: rgba(180, 83, 9, 0.24);
}

.social-post-panel__primary-action .work-publish-button:disabled {
  cursor: not-allowed;
  opacity: 0.62;
  box-shadow: none;
}
```

In the existing `@media (max-width: 980px)` section, replace the mobile `.social-post-panel__scroll` rule:

```css
  .social-post-panel__scroll {
    overflow-x: visible;
    overflow-y: visible;
    overscroll-behavior: auto;
    padding-right: 0;
    scrollbar-gutter: auto;
  }
```

with:

```css
  .social-post-panel__primary-action {
    right: 14px;
    bottom: 14px;
  }

  .social-post-panel__scroll {
    overflow-x: visible;
    overflow-y: visible;
    overscroll-behavior: auto;
    padding-right: 0;
    padding-bottom: 58px;
    scrollbar-gutter: auto;
  }
```

- [ ] **Step 6: Run targeted tests to verify the feature passes**

Run:

```bash
npm test -- src/artifacts/plugins/social-post/SocialPostRenderer.test.tsx
```

Expected: PASS for all `SocialPostRenderer` tests.

- [ ] **Step 7: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 8: Visually verify the UI**

Start or reuse the Next dev server:

```bash
npm run dev
```

Open the app in the browser, navigate to a session with a social-post artifact, and verify:

- The `社媒内容` heading row contains `编辑` but not `发布`.
- `发布` is visible at the lower right of the social-post card.
- Long content can scroll without the final line being hidden behind `发布`.
- Clicking `发布` opens `发布助手`.
- Clicking `编辑` while `发布助手` is open closes the assistant and shows the editor.

- [ ] **Step 9: Commit the implementation**

Run:

```bash
git add src/artifacts/plugins/social-post/SocialPostRenderer.test.tsx src/artifacts/plugins/social-post/SocialPostRenderer.tsx src/app/globals.css
git commit -m "fix: make publish a prominent card action"
```

Expected: commit succeeds and includes only the renderer, renderer test, and stylesheet changes.
