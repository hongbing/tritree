# Tree Canvas Operation Hint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a collapsible tree explanation floating at the lower-left of the tree diagram, expanded by default on desktop and collapsed by default on mobile.

**Architecture:** `TreeCanvas` owns local expanded/collapsed state and renders the hint inside a positioned shell around the scrollable tree viewport. The hint follows desktop/mobile defaults until the user manually toggles it, then respects the user's choice. The copy explains the tree itself: nodes are historical snapshots, clicking a node switches to that snapshot version, and dragging empty canvas browses nearby branches.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, CSS.

---

### Task 1: Failing Tests

**Files:**
- Modify: `src/components/tree/TreeCanvas.test.tsx`

- [ ] **Step 1: Add tests for the tree explanation**

Add rendering tests proving:

```tsx
const hint = screen.getByRole("note", { name: "树图说明" });

expect(hint).toHaveTextContent("画布中每个节点代表创作过程中的快照");
expect(hint).toHaveTextContent("点击节点可以切换到对应的历史快照版本");
expect(hint).toHaveTextContent("拖动画布空白处可以查看前后的分支");
expect(hint).not.toHaveTextContent("底部卡片");
expect(hint).not.toHaveTextContent("下方选方向");
expect(hint).not.toHaveTextContent("生成下一版");
expect(hint).not.toHaveTextContent("灰色分支");
```

Add a collapse/reopen test using `收起树图说明` and `展开树图说明`.

Add mobile default tests proving `isMobileLayout` starts collapsed and that a desktop-to-mobile layout update collapses the hint before user interaction.

Add a CSS test proving `.tree-viewport-shell` is `position: relative` and `.tree-operation-hint` uses `bottom: 14px` and `left: 16px`, with mobile `bottom: 12px` and `left: 12px`.

- [ ] **Step 2: Run the focused tests to verify they fail**

Run:

```bash
npm test -- src/components/tree/TreeCanvas.test.tsx -t "tree instruction hint"
```

Expected: FAIL before implementation because the lower-left `树图说明` note and final explanatory copy do not exist.

### Task 2: Implementation

**Files:**
- Modify: `src/components/tree/TreeCanvas.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add the hint state and viewport shell**

In `TreeCanvas`, add:

```tsx
const [isOperationHintExpanded, setIsOperationHintExpanded] = useState(true);
```

Initialize it from `isMobileLayout`, and add an `operationHintTouchedRef` so layout changes only apply while the user has not manually toggled the hint:

```tsx
const operationHintTouchedRef = useRef(false);
const [isOperationHintExpanded, setIsOperationHintExpanded] = useState(!isMobileLayout);

useEffect(() => {
  if (operationHintTouchedRef.current) return;
  setIsOperationHintExpanded(!isMobileLayout);
}, [isMobileLayout]);
```

Wrap the existing scrollable `.tree-viewport` with:

```tsx
<div className="tree-viewport-shell">
  {/* existing tree viewport */}
  <TreeOperationHint
    isExpanded={isOperationHintExpanded}
    onToggle={() => {
      operationHintTouchedRef.current = true;
      setIsOperationHintExpanded((expanded) => !expanded);
    }}
  />
</div>
```

- [ ] **Step 2: Add `TreeOperationHint`**

Use:

```tsx
function TreeOperationHint({ isExpanded, onToggle }: { isExpanded: boolean; onToggle: () => void }) {
  if (!isExpanded) {
    return (
      <div aria-label="树图说明" className="tree-operation-hint tree-operation-hint--collapsed" role="note">
        <button aria-expanded="false" aria-label="展开树图说明" className="tree-operation-hint__toggle" onClick={onToggle} type="button">
          树图说明
        </button>
      </div>
    );
  }

  return (
    <div aria-label="树图说明" className="tree-operation-hint" role="note">
      <div className="tree-operation-hint__header">
        <strong className="tree-operation-hint__title">树图说明</strong>
        <button aria-expanded="true" aria-label="收起树图说明" className="tree-operation-hint__toggle" onClick={onToggle} type="button">
          收起
        </button>
      </div>
      <div className="tree-operation-hint__body">
        <p>画布中每个节点代表创作过程中的快照。</p>
        <p>点击节点可以切换到对应的历史快照版本。</p>
        <p>拖动画布空白处可以查看前后的分支。</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add CSS**

Add `.tree-viewport-shell` with relative positioning, `.tree-operation-hint` with lower-left absolute placement, collapsed button styling, and `.tree-operation-hint__body p { margin: 0; }`. Add mobile constraints in the existing `@media (max-width: 640px)` block.

- [ ] **Step 4: Run focused tests**

Run:

```bash
npm test -- src/components/tree/TreeCanvas.test.tsx -t "tree instruction hint|tree operation hint"
```

Expected: PASS.

### Task 3: Verification

**Files:**
- Check: `src/components/tree/TreeCanvas.test.tsx`
- Check: `src/components/tree/TreeCanvas.tsx`
- Check: `src/app/globals.css`

- [ ] **Step 1: Run full tree component tests**

Run:

```bash
npm test -- src/components/tree/TreeCanvas.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: exit code 0.
