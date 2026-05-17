# Custom Subagent Context Design

## Goal

Custom subagents remain isolated execution tools, and their context is derived from the current session state by the runtime. The isolation boundary is the execution role, system prompt, and output responsibility. The context boundary is a scoped view of the same working state.

This keeps the system generic: the runtime owns context projection, while prompts focus on the agent's task and output contract.

## Core Model

The main agent calls a custom subagent with a small task description:

```ts
run_custom_subagent({
  title,
  task,
  expectedOutput,
  constraints
})
```

The tool runtime builds the subagent's context snapshot from the active session state. The main agent supplies compact task arguments, and the runtime supplies the scoped working context.

The custom subagent receives:

- A generic isolated-tool system prompt.
- The custom role title and task.
- A scoped context snapshot built by runtime policy.
- The enabled tools and model settings allowed for that subtask.

The subagent returns a result for the main agent to inspect. The main agent decides how that result affects the final output.

## Context Projection

Introduce a generic context projection layer:

```ts
type ContextViewPolicy = {
  artifacts: {
    draft: "latest" | "summary" | "all" | "none";
  };
  tree: "current-node" | "current-path-summary" | "all";
  messages: "recent" | "none";
  skills: "enabled" | "none";
};
```

Custom subagents use a conservative default policy:

```ts
const SUBAGENT_CONTEXT_POLICY: ContextViewPolicy = {
  artifacts: { draft: "latest" },
  tree: "current-node",
  messages: "recent",
  skills: "enabled"
};
```

The runtime applies this policy through a reusable function:

```ts
const snapshot = projectAgentContext(sharedContext, SUBAGENT_CONTEXT_POLICY);
```

The snapshot is artifact-oriented:

```ts
{
  currentRequest,
  currentNode,
  selectedDirection,
  currentArtifact: {
    type: "draft",
    value: latestDraft
  },
  enabledSkills,
  recentUserFeedback
}
```

For the current product, `currentArtifact.value` is the latest draft. Future artifact types can reuse the same projection through the same tool protocol.

## Latest Draft Rule

Only the latest draft enters the subagent context by default. Earlier drafts and branches remain available to the main agent through the full session state.

This rule belongs to the context projection policy. Custom subagent prompts stay focused on the assigned task and output responsibility.

If a future task needs history, the caller should select a broader policy, such as `draft: "summary"` or `tree: "current-path-summary"`.

## Execution Responsibilities

The main agent:

- Decides whether a custom subagent is needed.
- Supplies only title, task, expected output, and constraints.
- Checks the subagent result before using it.
- Decides whether to adopt, revise, discard, or continue from the result.
- Produces final user-visible outputs through the normal submit tools.

The custom subagent:

- Works on the bounded task it was given.
- Uses the scoped context snapshot as read-only working context.
- Returns checkable content, findings, or suggestions.
- Leaves workflow-level decisions and final user-visible output to the main agent.

The runtime:

- Builds scoped context snapshots.
- Applies the selected policy consistently.
- Creates the isolated agent with the right system prompt.
- Preserves abort handling, logging, and stream progress behavior.

## Prompt Shape

The custom subagent system prompt should stay generic:

```text
You are an isolated execution unit called by the main agent.
You receive a scoped, read-only snapshot of the current working context.
Complete only the assigned task.
Return a result that the main agent can inspect, verify, and decide how to use.
```

The prompt may include the custom `title`, `task`, `expectedOutput`, and `constraints`. Runtime-provided context supplies the session view, and the main agent manages Tritree's full workflow.

## Acceptance Criteria

- `run_custom_subagent` accepts compact task input: title, task, expected output, and constraints.
- Custom and predefined subagents can share the same context projection utility.
- The default custom subagent snapshot includes the latest draft only.
- The default custom subagent snapshot contains the latest draft as the sole draft body.
- Subagent prompts describe isolated execution responsibility, not content workflow strategy.
- Main agent prompts continue to treat subagent output as a tool result that must be checked.
- Existing stream display behavior remains clean with friendly subagent labels and stable completion status.

## Testing Notes

Unit tests should cover:

- Projection with several node drafts includes only the current/latest draft.
- Projection with historical drafts keeps the latest draft as the sole draft body under the default subagent policy.
- `run_custom_subagent` schema accepts small task input made of title, task, expected output, and constraints.
- The subagent runtime passes the projected snapshot into agent messages.
- Main agent instructions still state that subagent results must be inspected.
- Stream progress remains stable for custom subagent calls.
