# Content Team Skill Workflow Design

Date: 2026-05-18

## Summary

Tritree should feel like a small content creation team, not a workflow engine and not a long list of abstract creator moves. The earlier creator-native design correctly moved away from rigid stages, but seven visible moves are still too much for users to understand at a glance. The revised model should expose a small, familiar team of content roles as visible Skills.

The user-facing loop stays simple: current work, one useful question, three choices, next version or next question. Behind that loop, Tritree chooses which content-team role should be active now: planning the piece, finding material, drafting, reviewing, or preparing publication.

## Goals

- Preserve the mobile-friendly three-choice loop.
- Make Tritree feel like a content team with understandable roles.
- Replace hidden hardcoded stage instructions with a small set of visible system Skills.
- Keep the user from having to understand seven or more creative micro-actions.
- Support beginner users by defaulting to a complete content team.
- Support advanced users by letting them disable roles they do not need.
- Treat subagents as reusable execution helpers that any role may use when the work is clear.
- Recommend subagent use purposefully: use it for bounded execution, avoid it when the user still needs to make the core creative choice.
- Keep the first implementation prompt-and-default-Skill focused, without schema or UI redesign.

## Non-Goals

- Do not expose a workflow state machine to users.
- Do not ask users to manually choose which role acts each round.
- Do not create separate "beginner" and "advanced" modes.
- Do not create skill bundles, role packs, or nested presets in this pass.
- Do not make subagent usage mandatory for any role.
- Do not bind subagents to the writer role.
- Do not replace three choices with a long form or chat-only flow.
- Do not add new persisted workflow metadata in the first pass.

## Product Mental Model

A user should understand Tritree as:

```text
Tritree gives you a small content team.
策划 helps decide what this piece is about.
资料员 helps find what to write with.
写手 helps turn it into a draft.
审稿 helps find what does not work.
发布编辑 helps make it ready to publish.
```

The user does not pick a role every round. They enable or disable roles as long-term preferences for the work. Tritree decides which enabled role is most useful for the next three choices.

## Visible System Skills

The default system Skills should shift from broad internal roles such as `系统写作者` and `系统审核者` toward the following five visible roles. These should be visible in the Skill library and default-enabled unless a self-hosted instance changes defaults.

### 策划

Purpose: decide what the piece is about and why it is worth writing.

Responsibilities:

- Find the most promising topic, angle, reader, conflict, feeling, or claim.
- Turn a vague seed into one useful creative question.
- Prevent generic expansion before the piece has a center.

Expected effect:

- Early choices feel intentional.
- The user feels Tritree is helping them decide what to write, not just generating text.

Subagent guidance:

- Usually avoid subagents when the user still needs to choose the core direction.
- A subagent may list possible angles for a broad topic, but `策划` must select the final three user-facing choices.

### 资料员

Purpose: find or organize the material that makes the piece concrete and credible.

Responsibilities:

- Surface examples, scenes, facts, background, comparisons, quotes, references, and details.
- Notice when a draft is too abstract because it lacks material.
- Group scattered notes into usable material categories.

Expected effect:

- The piece gains specificity and evidence.
- AI output becomes less empty because it has something real to work with.

Subagent guidance:

- Strong fit for subagents when the request is bounded: find examples, summarize source material, group notes, or list missing evidence.
- Do not let a subagent invent facts. If external information is needed, use available tools or ask the user.

### 写手

Purpose: turn a clear direction and usable material into a draft.

Responsibilities:

- Write the first version or next version.
- Preserve the user's intent, useful wording, and desired tone.
- Control rewrite intensity based on how mature the current draft is.

Expected effect:

- The work becomes actual text on the page.
- The user can stop thinking in fragments and start reacting to a version.

Subagent guidance:

- Good fit for subagents when the selected direction is clear.
- Subagent usage is not exclusive to `写手`; this role is simply the most common place where drafting delegation happens.

### 审稿

Purpose: read the draft and identify what is not working.

Responsibilities:

- Check main line, logic, specificity, credibility, reader entry, title promise, tone, and risk.
- Notice where the piece feels false, empty, repetitive, over-explained, unsupported, or confusing.
- Turn review into choices, not a long critique report.

Expected effect:

- The user gets useful editorial judgment without being overwhelmed.
- Choices explain what would improve and why.

Subagent guidance:

- Good fit for subagents when an independent read would help.
- A subagent may surface issues, but `审稿` should synthesize them into one question and three choices.

### 发布编辑

Purpose: make a near-finished piece ready for readers or a platform.

Responsibilities:

- Prepare title, opening, ending, compression, platform version, hashtags, image prompt, and risk wording.
- Shift the work from "still writing" to "ready to be seen".
- Avoid large conceptual rewrites unless the piece is not actually ready.

Expected effect:

- The work becomes publishable.
- Tritree stops endlessly expanding and helps the user finish.

Subagent guidance:

- Good fit for subagents when producing concrete deliverables: short version, platform variant, title options, final check, or publish package.
- `发布编辑` still decides whether the piece is ready for publication or should return to planning, material, writing, or review.

## Prompting Model

The options agent should act as the content team lead:

1. Read the current work.
2. Decide which enabled role should be active now.
3. Use that role's Skill instructions as the main working method.
4. If the role suggests subagent use, decide whether the task is clear and bounded enough to delegate.
5. Produce one user-facing question and exactly three answers.

The draft-producing path should not be treated as the only subagent use case. It is one execution path, often used by `写手`, but `资料员`, `审稿`, and `发布编辑` may also use subagents when useful.

Prompt rule for subagents:

```text
Subagents are shared execution helpers. Use them for clear, bounded work that can produce material, variants, checks, or a draft. Do not use them to hide or replace the user's core creative choice. When the current issue is still a question of topic, angle, reader, or tradeoff, ask the user through the three choices first.
```

## Three-Choice Behavior

Three choices should not force role names into the UI. They should feel like natural content decisions.

Example where `策划` is active:

```text
这件事最值得写的地方可能在哪里？

1. 那个反差
表面是效率工具，实际写的是人被流程改变。

2. 那个瞬间
从一个具体场景进入，让读者先看见发生了什么。

3. 那个判断
直接把你的观点立起来，再用例子支撑。
```

Example where `资料员` is active:

```text
这篇现在最缺哪类素材？

1. 一个真实场景
先补一段具体发生过的画面，让读者看见问题。

2. 一个对比例子
用前后变化或两种做法对比，把判断写实。

3. 一个背景解释
先补清楚为什么这件事会发生，避免结论太跳。
```

Example where `发布编辑` is active:

```text
这版准备见人前，最该收哪一下？

1. 压成发布短版
主线已经成立，先删掉重复解释和松散句子。

2. 对齐标题承诺
标题和开头略大，先让它们和正文实际内容一致。

3. 做最后风险检查
把绝对化判断和不确定事实改得更稳。
```

## Data And Defaults

First implementation should update default system Skills rather than add workflow schema.

`config/defaults.example.json` should define the new visible Skills. The runtime already supports system Skills, `appliesTo`, and default enablement, so the first pass can use existing storage and routing.

Suggested applicability:

- `策划`: `editor`
- `资料员`: `editor`
- `写手`: `writer`
- `审稿`: `editor`
- `发布编辑`: `both`

The exact split can be adjusted during implementation, but the user-visible model should remain content-team roles, not agent internals.

## Migration From Current Branch

The current branch introduced `src/lib/ai/content-workflow.ts` with hardcoded stage instructions. This should be replaced or reduced. The new design should not keep a large hidden stage instruction block that duplicates visible Skills.

Recommended migration:

1. Move useful language from `content-workflow.ts` into the five default system Skills.
2. Replace `buildContentWorkflowOptionInstructions()` with a small content-team-lead instruction, or remove it if the five role Skills fully cover the behavior.
3. Update tests from "workflow stage text appears in prompt" to "visible content-team Skills are seeded and routed correctly".
4. Keep executor coverage that draft prompts do not receive editor-only role Skills.

## Testing

Add or update tests for:

- Default system Skills include `策划`, `资料员`, `写手`, `审稿`, and `发布编辑`.
- These Skills are visible, not archived, and default-enabled.
- Editor-target prompt receives `策划`, `资料员`, `审稿`, and shared roles.
- Writer-target prompt receives `写手` and shared roles.
- Generated instructions no longer depend on hidden `# 内容工作流阶段` text.
- Existing three-choice structured output remains unchanged.

## Open Design Principle

Tritree should not make users manage a process. It should give them a small content team, then quietly decide which role is useful for the next choice.

That is the feeling this design should protect.
