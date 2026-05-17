# Skill-Guided Subagent Workflow Design

Date: 2026-05-18

## Summary

Tritree should feel like a small content team. The team is represented by visible role Skills. Each Skill defines how a role thinks, what it is responsible for, what kind of output helps the work move forward, and which concrete tasks are good candidates for delegation.

The main agent owns orchestration and user interaction. It reads the current work, loads the enabled Skills, chooses the next useful action, calls tools or subagents when useful, and decides whether the result should update the work, complete the task, or ask the user to choose.

The three-choice loop is the main agent's interaction protocol. Role Skills focus on role work; subagents perform bounded tasks; the main agent decides when a user decision is genuinely needed.

## Goals

- Preserve the mobile-friendly three-choice interaction.
- Make role Skills the visible content-team model.
- Let Skills recommend delegation for specific bounded tasks.
- Support both precreated subagent templates and temporary subagents.
- Keep subagents as shared execution capability available to any suitable task.
- Make the main agent perform useful work before asking the user to choose, except when user input is the blocker.
- Retry no-op model runs.
- Use fresh default-role configuration as the first implementation target.

## Product Mental Model

Users should understand Tritree as:

```text
Tritree gives you a small content team.
You can enable the roles that help your work.
Tritree does the next useful piece of work and asks you to choose when your decision matters.
```

Beginner users can leave all default roles enabled and use the end-to-end loop. Advanced creators can disable roles or use only the specific capabilities they need.

## System Model

### Main Agent

The main agent coordinates each turn:

- Read the current work, history, user intent, enabled Skills, available tools, and available subagent templates.
- Choose the role Skill or combination of Skills most relevant to the next step.
- Decide whether the next action should be handled directly, through a normal tool, through a precreated subagent template, or through a temporary subagent.
- Use returned work results to update the draft, prepare a publish package, mark the task complete, or ask the user to choose.
- Record enough reasoning in the structured result for the executor to validate that the turn performed meaningful work or has a clear user-decision blocker.

The main agent prompt contains the three-choice protocol, the actual-work rule, and the retry-facing constraints.

### Role Skills

The default role Skills are visible and default-enabled:

- `策划`: clarifies topic, reader, claim, angle, conflict, and creative direction.
- `资料员`: finds, organizes, and verifies examples, scenes, facts, references, and missing evidence.
- `写手`: turns an agreed direction and usable material into a draft or revision.
- `审稿`: evaluates main line, logic, specificity, credibility, reader entry, tone, and risk.
- `发布编辑`: prepares near-finished work for a platform or reader-facing delivery.

Each role Skill prompt contains:

- Role responsibility.
- Inputs the role should pay attention to.
- Useful output shape for the main agent, such as direction notes, material notes, draft text, review findings, or publish-package notes.
- Delegation guidance for concrete tasks.
- Context checklist for delegation, so the main agent can pass a short and sufficient prompt to a subagent.

### Subagent Execution

Subagent execution is a shared capability. It is useful when a task has a clear boundary, can run with a compact context, and can return a specific result.

Tritree supports two subagent paths.

#### Precreated Subagent Templates

Precreated templates reduce prompt overhead for common tasks. The main agent calls a template with a short task, relevant context, and expected output.

Initial templates:

- `material-search`: find candidate sources, examples, references, or background material.
- `material-organizer`: group notes, extract useful claims, and identify missing evidence.
- `independent-review`: read a draft independently and list issues or opportunities.
- `title-variants`: generate title/opening variants under clear constraints.
- `platform-rewrite`: adapt an existing draft for a target platform or length.

Role Skills may recommend these template ids. For example, `资料员` can recommend `material-search`, and `发布编辑` can recommend `platform-rewrite`.

#### Temporary Subagents

The main agent can create a temporary subagent for one-off bounded tasks. The temporary subagent receives:

- A short task description.
- Minimal relevant context.
- Expected output format.
- Constraints inherited from the active role Skill and user request.

Good temporary-subagent tasks include comparing two candidate structures, extracting objections from pasted feedback, producing alternate examples from existing notes, or doing a focused second read of a section.

## Skill Delegation Guidance

Role Skills can include delegation guidance in this shape:

```text
适合委托：当需要查找资料、归纳来源、整理案例时，优先建议使用 material-search 或 material-organizer。
保留给主 agent / 用户：本文最终立场、读者对象、发布判断。
调用前最小上下文：主题、当前草稿、用户已确认约束、需要查找的问题。
回来后如何使用：把结果合并成素材判断，再由主 agent 决定更新草稿、继续执行或向用户发起选择。
```

This lets Skills stay focused on role judgment while giving the main agent practical delegation hints.

## Three-Choice Protocol

Three choices are submitted by the main agent when a real user decision is the next useful step.

Valid three-choice situations:

- A creative decision blocks progress.
- Useful work has produced multiple viable directions.
- The user needs to choose topic, angle, reader, material tradeoff, rewrite intensity, or publication direction.
- The seed or current request is too vague for meaningful execution, and user input is the blocker.

Each three-choice result should include a short blocker or decision rationale. This lets the executor distinguish a real user-decision point from a no-op.

## Actual Work And Retry Rule

Each main-agent run should end in at least one meaningful action:

- Call a normal tool.
- Call a precreated subagent template.
- Create a temporary subagent.
- Submit an updated draft.
- Submit a publish package.
- Submit completion.
- Submit a three-choice decision with a clear blocker rationale.

If a run produces none of those actions, the executor retries with this reminder:

```text
You must do actual work before ending this turn. Call a tool or subagent, submit an updated draft or publish package, mark the task complete, or ask the user through three choices with a clear blocker rationale.
```

## Data And Defaults

Recommended first-pass data shape:

- Default role Skills live in `config/defaults.example.json`.
- Precreated subagent templates live in config or code, depending on the existing tool architecture.
- Each template has `id`, `title`, `description`, `prompt`, and expected output guidance.
- Role Skill prompts reference template ids as recommendations.
- The main agent prompt owns orchestration, interaction protocol, and retry rule.
- Fresh defaults are the source of truth for this pass.

## Implementation Notes

Implementation should produce these outcomes:

1. Default role Skills are seeded with role-focused prompts.
2. Role prompts include delegation guidance and context checklists.
3. The main agent prompt includes available Skills, available subagent templates, temporary-subagent capability, three-choice eligibility, and actual-work expectations.
4. Precreated and temporary subagent capabilities are exposed to the main agent as executable paths.
5. A new implementation plan is written from this spec before implementation starts.

## Testing

Add or update tests for:

- Default role Skills include `策划`, `资料员`, `写手`, `审稿`, and `发布编辑`.
- Role Skill prompts contain role responsibility, useful output shape, delegation guidance, and context checklist.
- Main-agent prompt contains the three-choice protocol and actual-work rule.
- Main-agent prompt includes both precreated and temporary subagent paths.
- Precreated subagent templates are available to the main agent with concise descriptions.
- A no-op model response triggers retry with the explicit actual-work reminder.
- Three choices are accepted when the structured result includes a clear blocker rationale.
- Existing structured outputs for draft, options, and completion remain valid.

## Open Design Principle

Tritree should keep the loop simple for users while doing real work behind the scenes. The main agent manages the loop. Skills provide role judgment. Subagents do bounded work when useful. Three choices appear when the next best thing is genuinely a user decision.
