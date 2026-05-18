# Three-Choice Content Workflow Design

Date: 2026-05-18

## Summary

Tritree should keep its mobile-friendly three-choice loop as the primary interaction. The next improvement is not to expose the full Superpowers engineering workflow to creators. Instead, Tritree should borrow the useful parts of that workflow: diagnose the current state, ask the highest-value next question, offer a small number of clear answers, and add lightweight finishing gates before publication.

Users should still experience Tritree as a content creation tool: seed, draft, choose one of three next moves, revise, and eventually publish. Internally, Tritree can treat each round as part of a content workflow stage so suggestions become more purposeful and less like generic rewrite options.

## Goals

- Preserve the existing three-choice interaction as the main mobile experience.
- Make each option set answer one clear current question.
- Apply Superpowers ideas to content creation without adding heavy project-management UI.
- Improve early rounds with intent clarification.
- Improve middle rounds with review-driven direction choices.
- Improve late rounds with publishing and quality checks.
- Keep the tree valuable as a history of creative decisions, not just text versions.
- Reuse existing option fields where possible: `roundIntent`, `label`, `description`, and `impact`.

## Non-Goals

- Do not replace three choices with a chat-only interface.
- Do not add a formal spec or plan document flow for normal social content.
- Do not require users to understand Superpowers terminology.
- Do not make users fill out long forms before generating drafts.
- Do not add a separate review report panel in the first version.
- Do not turn every content task into a rigid workflow.

## Product Principle

The visible product remains simple:

```text
Current draft
-> one useful question
-> three answers
-> next draft or next question
```

The internal behavior becomes more structured:

```text
Read current state
-> diagnose the most important creative problem
-> choose the workflow stage
-> generate three useful choices for that stage
-> route to draft generation, another question, or finishing
```

This keeps the mobile interaction light while making the AI feel more like an editor with judgment.

## Content Workflow Stages

Tritree can model content creation with six soft stages. These are internal stage hints, not labels users must manage.

### Clarify Intent

Used when the seed is underspecified or the current direction is unclear.

Typical questions:

- Who is this for?
- What should the reader feel or do?
- Is this mainly a story, opinion, explanation, or announcement?

Example options:

- `写给新手`: Let readers enter from first principles.
- `写给同行`: Assume shared context and sharpen the point.
- `写给朋友`: Make it warmer and more conversational.

### Choose Angle

Used when the topic is clear but the piece needs a stronger entry point.

Typical questions:

- Which angle should lead?
- Should the piece start from a scene, a claim, or a conflict?
- What is the most interesting promise to the reader?

Example options:

- `从真实场景开头`
- `先亮出观点`
- `用一个反差切入`

### Organize Material

Used when the draft has useful material but weak structure.

Typical questions:

- What order makes this easier to follow?
- Which parts should be expanded, merged, or removed?
- Is the main line clear enough?

Example options:

- `按时间顺序整理`
- `先问题后方法`
- `删掉旁支内容`

### Write Or Rewrite

Used when there is enough intent and structure to produce a stronger draft.

Typical questions:

- What writing move should the next version make?
- Should the next version deepen, simplify, reframe, or polish?
- How much should the draft change?

Example options:

- `补一个例子`
- `压成短句`
- `换成更锋利的表达`

### Review And Repair

Used when the draft exists but has specific risks or quality issues.

Typical questions:

- What currently blocks the draft from working?
- What would make the piece clearer, more credible, or more readable?
- Which problem matters most before continuing?

Example options:

- `补清楚因果`: The current claim jumps too quickly from observation to conclusion.
- `降低断言风险`: Some statements sound too absolute without support.
- `增强读者进入感`: The opening assumes too much background.

### Finish And Publish

Used when the draft is close to complete.

Typical questions:

- What final check matters before publishing?
- Should this become a shorter platform version?
- Is the title, opening, or ending promising more than the body delivers?

Example options:

- `检查标题承诺`
- `生成发布版`
- `做最后压缩`

## Three-Choice Behavior

Each option set should continue to contain exactly three options, but the options should be tied to the current stage.

`roundIntent` should name the one question the user is answering. It should be concrete enough that all three choices clearly answer it.

`label` should be a compact action phrase.

`description` should explain the tradeoff or diagnosis behind the option.

`impact` should say what choosing it will improve in the next draft.

The three choices should usually cover different creative moves. They should not be three phrasings of the same action.

## Stage Selection Rules

The editor agent should infer the stage from the current state:

- If the seed lacks audience, purpose, or desired effect, prefer `Clarify Intent`.
- If the topic is known but the piece has no strong entry point, prefer `Choose Angle`.
- If the draft contains scattered useful material, prefer `Organize Material`.
- If the user already chose a clear direction, route to `Write Or Rewrite`.
- If the draft exists and quality issues are more important than expansion, prefer `Review And Repair`.
- If the draft is coherent and close to done, prefer `Finish And Publish`.

The stage is a guide, not a hard lock. A later draft can return to clarification if the user changes direction or the current text exposes a missing decision.

## Skill Integration

Existing skills can support this design without exposing runtime roles to users.

- Writing skills affect `Write Or Rewrite`.
- Review skills affect `Review And Repair` and shape option diagnoses.
- Publishing constraints affect all stages, especially `Finish And Publish`.
- Creation requests from the seed screen should influence stage selection and option wording.

The existing `writer`, `editor`, and `both` routing remains a good internal foundation. This design mostly asks the editor side to become more stage-aware.

## User Experience

The main UI should remain familiar:

- The draft stays central.
- The tree still shows branches.
- The current question and three cards remain the main decision surface.
- Mobile users can keep tapping through choices without opening complex panels.

Small UI improvements can make the stage legible without making it feel procedural:

- Show a compact stage hint near the current question, such as `澄清一下`, `选个角度`, `整理材料`, `继续改写`, `检查一下`, or `准备发布`.
- Keep this hint visually secondary.
- Do not require users to manually change stages.

## Data Model

The first implementation can avoid large schema changes by encoding most behavior through prompts and existing fields.

A later implementation can add optional stage metadata to tree nodes:

```ts
type ContentWorkflowStage =
  | "clarify-intent"
  | "choose-angle"
  | "organize-material"
  | "write-rewrite"
  | "review-repair"
  | "finish-publish";
```

Recommended optional fields:

- `tree_nodes.workflow_stage`
- `tree_nodes.stage_reason`

These fields would help with analytics, debugging, and future UI labels, but they are not required for a first prompt-only pass.

## Prompting Changes

The options agent should explicitly perform this sequence:

1. Read the seed, current draft, path history, user request, and enabled skills.
2. Diagnose the current content state.
3. Choose one soft workflow stage.
4. Generate one `roundIntent` question appropriate to that stage.
5. Generate exactly three answers to that question.
6. Make each option's diagnosis or tradeoff visible through `description` and `impact`.

The draft agent should continue treating the selected option as the writing goal. It does not need to mention the workflow stage unless the user's selected option asks for explanation.

## Error Handling

If the options agent cannot confidently identify a stage, it should default to the safest useful behavior:

- Early with little content: ask a clarification question.
- Middle with a rough draft: offer structure or rewrite choices.
- Late with a coherent draft: offer review or finish choices.

If all three choices would be low-value, the editor agent should choose a more useful stage rather than forcing three weak options.

## Testing

Prompt and behavior tests should cover:

- Sparse seed produces clarification choices instead of a full rewrite menu.
- Draft with scattered material produces organization choices.
- Coherent but risky draft produces review choices with visible diagnosis.
- Mature draft produces finishing or publishing choices.
- All option sets still include exactly three options.
- Each option answers the same `roundIntent`.
- Writer skills do not dominate review choices.
- Review skills do not make the draft agent return a review report.

## Rollout

Recommended rollout:

1. Prompt-only stage-aware options generation.
2. UI copy refinements for `description` and `impact`.
3. Optional stage hint display.
4. Optional persisted stage metadata after the behavior proves useful.

This sequence keeps the first step small and protects the core three-choice experience.
