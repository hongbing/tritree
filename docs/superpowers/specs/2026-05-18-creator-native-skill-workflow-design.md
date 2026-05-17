# Creator-Native Skill Workflow Design

Date: 2026-05-18

## Summary

Tritree should feel like a creator thinking with the user, not like a workflow engine routing content through fixed stages. The earlier "three-choice content workflow" direction captured the need for better judgment, but its stage framing is too procedural. The revised model should make creator-native writing moves visible as Skills, let the main content creator decide which move matters now, and treat subagents as a shared execution capability that any move may use when the task is clear.

The user-facing loop stays simple: current work, one useful question, three choices, next version or next question. What changes is the mental model behind those choices. Tritree should first ask what is alive in the material, what the work is trying to become, and what kind of creative move would help. Then it should offer three concrete answers.

## Goals

- Preserve the mobile-friendly three-choice loop.
- Make Tritree feel like a content creator with judgment, not a generic editor or rigid process controller.
- Replace hidden hardcoded stage instructions with visible, understandable creator-action Skills.
- Keep the user's creative judgment central; do not let automation choose the heart of the piece for them.
- Treat subagents as a reusable execution capability, not a fixed "writer" role.
- Recommend subagent use purposefully inside prompts: use it for clear execution tasks, avoid it when the user still needs to make the core creative choice.
- Keep the first implementation prompt-and-default-Skill focused, without schema or UI redesign.

## Non-Goals

- Do not expose a workflow state machine to users.
- Do not ask users to choose a stage manually.
- Do not make subagent usage mandatory for any specific Skill.
- Do not bind the subagent concept to one "writer" role.
- Do not replace three choices with a long form or chat-only flow.
- Do not add new persisted workflow metadata in the first pass.

## Product Mental Model

The front-stage role is the `内容创作者`.

The content creator:

- reads the seed, draft, selected path, user notes, and enabled Skills;
- senses what is strongest, weakest, or most unresolved in the current work;
- decides which creator move is most useful now;
- expands that move into one question and three useful answers;
- decides whether any clear execution work should be delegated to subagents;
- keeps the user's choice central.

Subagents are background helpers. They can act as temporary researchers, material organizers, draft writers, reviewers, polishers, or publishing assistants. They are not the front-stage creative authority.

## Creator Moves As Visible Skills

The default system Skills should shift from broad internal roles such as `系统写作者` and `系统审核者` toward visible creator moves. These Skills should be visible in the library and default-enabled unless a self-hosted instance changes defaults.

### 找到内核

Purpose: identify what in the seed or draft is most worth writing.

It asks:

- What feeling, conflict, scene, question, or judgment is alive here?
- What would be lost if this piece were written generically?
- Which part has the most creative charge?

Expected effect:

- Early suggestions feel less random.
- Tritree avoids expanding every seed into a bland general draft.
- The user feels the system is trying to understand what they actually care about.

Subagent guidance:

- Usually do not call subagents before the user has chosen the creative core.
- If the seed contains many competing ideas, a subagent may list possible cores, but the content creator must choose the three user-facing options.

### 召唤读者

Purpose: make the imagined reader present.

It asks:

- Who would care about this?
- Where might the reader enter, resist, misunderstand, or lose interest?
- What does the reader need to feel in the first screen?

Expected effect:

- The work gains object sense without turning into marketing persona language.
- Suggestions become more grounded in reader entry, promise, and attention.

Subagent guidance:

- Usually keep this as a creator judgment.
- A subagent may generate reader reactions or likely confusion points for longer drafts.

### 展开材料

Purpose: gather and arrange usable material.

It asks:

- What scenes, examples, memories, claims, details, or contrasts could support the core?
- Which material is missing?
- Which material is interesting but off-center?

Expected effect:

- The draft gains texture and evidence.
- Sparse ideas can grow without immediately becoming over-polished.

Subagent guidance:

- Good fit for subagents when the task is clear, such as "list examples", "extract claims", "group notes", or "find possible scenes".
- The content creator should still select the final three choices shown to the user.

### 形成一版

Purpose: make the work exist as a draft.

It asks:

- What version should stand on the page now?
- How much should this draft change?
- What must be preserved from the user's wording or intent?

Expected effect:

- The work moves from idea to concrete text.
- The system avoids endless diagnosis when there is enough to write.

Subagent guidance:

- Strong fit for subagents when the user's selected direction is clear.
- A subagent may temporarily act as a draft writer, but this is one use of the shared capability, not a fixed role.

### 听出问题

Purpose: read the draft as a creator and notice what feels false, empty, confusing, weak, excessive, or under-supported.

It asks:

- Where does the piece betray the original impulse?
- Which sentence or section feels performative, vague, over-explained, or unsupported?
- What would a reader not believe or not feel?

Expected effect:

- Review suggestions feel like creative listening rather than checklist scoring.
- Tritree can improve logic, clarity, and truthfulness without sounding like an external auditor.

Subagent guidance:

- Good fit for subagents when an independent read would help.
- A subagent can surface issues, but the content creator should synthesize them into one question and three choices.

### 做出取舍

Purpose: decide what to keep, cut, compress, emphasize, or abandon.

It asks:

- What does this piece need to stop trying to do?
- Which good sentence does not serve the work?
- What should be made smaller so the real center becomes stronger?

Expected effect:

- The work gets sharper.
- Tritree stops endlessly adding material and starts helping the user commit.

Subagent guidance:

- Use subagents cautiously.
- A subagent may propose cuts or compression candidates, but final tradeoff choices should remain visible to the user.

### 准备见人

Purpose: turn the work into something another person can read or publish.

It asks:

- Is the title or opening promising what the body delivers?
- Is the piece too long, too vague, too risky, or too unfinished for its target context?
- What final form should this take for the platform or reader?

Expected effect:

- The work shifts from "still writing" to "ready to be seen".
- Suggestions prioritize title, opening, ending, compression, platform fit, risk wording, and final polish.

Subagent guidance:

- Good fit for subagents when producing a concrete deliverable: short version, platform version, final check, title variants, or publish package.
- The content creator should still decide whether the work is ready to leave creation mode.

## Role Naming

Recommended visible/system naming:

- `内容创作者`: the main visible system Skill, default-enabled, applies to editor behavior.
- `找到内核`
- `召唤读者`
- `展开材料`
- `形成一版`
- `听出问题`
- `做出取舍`
- `准备见人`

Avoid these labels in user-facing defaults:

- `总控`
- `审核者`
- `流程控制`
- `工作流阶段`

`系统写作者` can remain as an internal compatibility concept during migration, but the product language should move toward creator moves. If it stays visible, it should be renamed or reframed so it does not compete with the content creator role.

## Prompting Model

The options agent should be prompted as the content creator:

1. Read the current work.
2. Decide what creative move matters now.
3. Use enabled creator-move Skills as available working methods.
4. If a Skill suggests subagent use, decide whether the task is clear enough to delegate.
5. Produce one user-facing question and exactly three answers.

The draft-producing agent should not be presented as the permanent "writer". It is an execution path that may be used after a choice becomes clear. Other stages may also use subagents when useful.

Prompt rule for subagents:

```text
Subagents are shared execution helpers. Use them only for clear, bounded work that can produce material, variants, checks, or a draft. Do not use them to hide or replace the user's core creative choice. When the current issue is still a question of intent, center, reader, or tradeoff, ask the user through the three choices first.
```

## Three-Choice Behavior

Three choices should not reveal internal stage names. They should feel like creator choices.

Example for a rough seed:

```text
这件事最值得写的地方可能在哪里？

1. 那个反差
表面是效率工具，实际写的是人被流程改变。

2. 那个瞬间
从一个具体场景进入，让读者先看见发生了什么。

3. 那个判断
直接把你的观点立起来，再用例子支撑。
```

Example for a draft near completion:

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

- `内容创作者`: `editor`
- `找到内核`: `editor`
- `召唤读者`: `editor`
- `展开材料`: `editor`
- `形成一版`: `both`
- `听出问题`: `editor`
- `做出取舍`: `editor`
- `准备见人`: `both`

The exact split can be adjusted during implementation, but the user-visible model should remain creator moves, not agent internals.

## Migration From Current Branch

The current branch introduced `src/lib/ai/content-workflow.ts` with hardcoded stage instructions. This should be replaced or reduced. The new design should not keep a large hidden stage instruction block that duplicates visible Skills.

Recommended migration:

1. Move the useful language from `content-workflow.ts` into default system Skills.
2. Replace `buildContentWorkflowOptionInstructions()` with a smaller creator-role instruction, or remove it if the new `内容创作者` Skill fully covers the role.
3. Update tests from "workflow stage text appears in prompt" to "visible creator-move Skills are seeded and routed to the options agent".
4. Keep executor coverage that draft prompts do not receive editor-only creator-move Skills.

## Testing

Add or update tests for:

- Default system Skills include `内容创作者` and the seven creator moves.
- These Skills are visible, not archived, and default-enabled.
- Editor-target prompt receives creator-move Skills.
- Writer-target prompt receives only `both` or writer-applicable creator Skills.
- Generated instructions no longer depend on hidden `# 内容工作流阶段` text.
- Existing three-choice structured output remains unchanged.

## Open Design Principle

Tritree should not model creation as a pipeline. It should model creation as attention: notice the live center, imagine the reader, gather material, make a version, listen to what is wrong, choose what to lose, and prepare the work to meet people.

That is the feeling this design should protect.
