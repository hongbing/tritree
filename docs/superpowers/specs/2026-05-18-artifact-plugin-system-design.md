# Artifact Plugin System Design

## Goal

Replace the current draft-centered content model with a plugin-driven artifact system. Tritree core should not know about social posts, PRDs, drafts, publish packages, or any future artifact-specific payload shape. It should only know how to load artifact plugins, store validated artifact payloads, connect artifacts to tree nodes, stream generation updates, and render a plugin-provided client surface.

This is a breaking change. Existing session/tree content data may be discarded. There will be no runtime compatibility layer for `Draft`, `currentDraft`, `nodeDrafts`, `publishPackage`, or `/draft` routes.

## Principles

- Core owns generic workflow primitives: sessions, tree nodes, branch options, artifact records, streaming state, plugin lookup, schema validation, and fallback UI.
- Every concrete output type is provided by an artifact plugin, including the current social post behavior.
- A plugin owns its payload schema, AI instructions, normalization, summary formatting, renderer/editor/diff/delivery surfaces, and custom actions.
- The data API never transports executable UI code. It transports artifact type ids, payload JSON, capability metadata, and action identifiers. React renderers are registered locally in the client bundle.
- Unknown or missing plugins do not corrupt data. Core can show a read-only fallback for an artifact whose plugin is unavailable, but it does not attempt legacy conversion.

## Architecture

### Core Artifact Model

```ts
type Artifact = {
  id: string;
  type: string;
  version: number;
  payload: unknown;
  createdAt: string;
  updatedAt: string;
};

type NodeArtifact = {
  nodeId: string;
  artifact: Artifact;
};

type SessionState = {
  rootMemory: RootMemory;
  session: Session;
  currentNode: TreeNode | null;
  currentArtifact: Artifact | null;
  nodeArtifacts: NodeArtifact[];
  selectedPath: TreeNode[];
  treeNodes?: TreeNode[];
  enabledSkillIds: string[];
  enabledSkills: Skill[];
  foldedBranches: FoldedBranch[];
};
```

The following concepts are removed from core:

- `DraftSchema`, `NodeDraftSchema`, `PublishPackageSchema`
- `currentDraft`, `nodeDrafts`, `publishPackage`
- draft-specific repository methods and publish-package tables/logic
- `/api/sessions/:sessionId/draft`, `/draft/generate/stream`, `/draft/rewrite-selection`
- `LiveDraft` as the core right-side panel

### Artifact Plugin Contract

Server-side plugin definition:

```ts
type ArtifactPluginServer<TPayload, TAiOutput = TPayload> = {
  id: string;
  label: string;
  description: string;
  payloadSchema: z.ZodType<TPayload>;
  aiOutputSchema: z.ZodType<TAiOutput>;
  capabilities: ArtifactCapabilities;
  createSeedPayload(input: SeedPayloadInput): TPayload;
  promptInstructions(input: PromptInstructionInput): string;
  normalizeAiOutput(output: TAiOutput): TPayload;
  summarizeForTree(payload: TPayload): string;
  summarizeForDirector(payload: TPayload): string;
  handleAction?: ArtifactActionHandler<TPayload>;
};

type ArtifactCapabilities = {
  generate: boolean;
  edit: boolean;
  diff: boolean;
  deliver: boolean;
  actions: string[];
  streamFields: string[];
};
```

Client-side manifest:

```ts
type ArtifactPluginClientManifest = {
  id: string;
  label: string;
  description: string;
  rendererKey: string;
  editorKey?: string;
  diffKey?: string;
  deliveryKey?: string;
  capabilities: ArtifactCapabilities;
};
```

Client renderer registry:

```ts
type ArtifactRendererRegistry = {
  renderers: Record<string, ArtifactRenderer>;
  editors: Record<string, ArtifactEditor>;
  diffs: Record<string, ArtifactDiff>;
  deliveries: Record<string, ArtifactDelivery>;
};
```

Plugins are local bundled modules in the first implementation. Remote runtime code loading is out of scope.

Recommended module layout:

```txt
src/artifacts/plugins/social-post/
  server.ts
  client.ts
  schema.ts
  SocialPostRenderer.tsx
  SocialPostEditor.tsx
  SocialPostDiff.tsx
  SocialPostDelivery.tsx

src/artifacts/plugins/prd/
  server.ts
  client.ts
  schema.ts
  PrdRenderer.tsx
  PrdEditor.tsx
  PrdDiff.tsx
  PrdDelivery.tsx
```

## Built-In Plugins

Built-in means bundled with the app, not hard-coded into core.

### `social-post`

The current draft payload moves into the social-post plugin:

```ts
type SocialPostPayload = {
  title: string;
  body: string;
  hashtags: string[];
  imagePrompt: string;
};
```

The plugin owns:

- social post prompt instructions
- title/body/hashtags/image prompt rendering and editing
- existing diff behavior for social post fields
- publish assistant and platform checks
- selected-text rewrite action

`draft` may remain as user-facing copy inside this plugin if the product language still wants it, but it must not be a core model name.

### `prd`

PRD no longer reuses social-post fields:

```ts
type PrdPayload = {
  title: string;
  markdown: string;
};
```

The plugin owns Markdown rendering, editing, section checks, copy/export delivery, and PRD-specific AI instructions.

### Future Plugins

Future plugins should require no core model changes:

```ts
type BrainstormPayload = {
  title: string;
  ideas: Array<{ id: string; text: string; tags: string[] }>;
  clusters: Array<{ id: string; label: string; ideaIds: string[] }>;
};

type DrawingPayload = {
  prompt: string;
  assets: Array<{ id: string; kind: string; url?: string; status: string }>;
  canvasState: unknown;
};
```

## Database

Use a single artifact table connected to sessions and tree nodes:

```txt
artifacts
- id
- session_id
- node_id
- type
- version
- payload_json
- created_at
- updated_at
```

Existing content data can be discarded. The implementation may use a breaking schema reset that drops old draft/publish-package storage and creates the new artifact storage. Non-content data such as users, skills, auth, root preferences, and app configuration should be preserved unless a schema dependency requires a targeted schema update.

Repository responsibilities:

- create seed artifact by calling the selected plugin
- store and update artifact payload JSON after plugin validation
- return `currentArtifact` and `nodeArtifacts` in `SessionState`
- find nearest ancestor artifact for branch generation and comparison
- reject writes for unknown artifact types or invalid payloads

## API

New routes:

```txt
POST /api/sessions/:sessionId/artifact
POST /api/sessions/:sessionId/artifact/generate/stream
POST /api/sessions/:sessionId/artifact/actions/:actionId
```

Removed routes:

```txt
POST /api/sessions/:sessionId/draft
POST /api/sessions/:sessionId/draft/generate/stream
POST /api/sessions/:sessionId/draft/rewrite-selection
```

Manual save payload:

```ts
type SaveArtifactRequest = {
  nodeId: string;
  artifact: {
    type: string;
    payload: unknown;
  };
};
```

Action payload:

```ts
type ArtifactActionRequest = {
  nodeId: string;
  artifactId: string;
  input: unknown;
};
```

Core validates the action id against the plugin capability list, passes the input to the plugin handler, validates the returned payload, and stores the resulting artifact.

## AI And Streaming

Director output becomes artifact-driven:

```ts
type ArtifactDirectorOutput = {
  roundIntent: string;
  artifact: {
    type: string;
    payload: unknown;
  };
  options: BranchOption[];
};
```

Generation uses the selected artifact plugin to build prompt instructions, validate AI output, normalize payloads, and summarize artifacts for later tree context.

Streaming events become generic:

```ts
type ArtifactStreamEvent =
  | { type: "artifact.replace"; artifact: Artifact }
  | { type: "artifact.patch"; path: string; value: unknown }
  | { type: "thinking"; nodeId?: string | null; stage?: "artifact" | "options"; text: string }
  | { type: "options"; nodeId: string; options: BranchOption[]; roundIntent?: string | null }
  | { type: "done"; state: SessionState }
  | { type: "error"; error: string };
```

Patch paths are plugin-owned payload paths. Core can apply patches to JSON, but the plugin is responsible for declaring supported stream fields and validating the final payload.

## Right-Side UI

`ArtifactPanel` becomes the only core right-side content panel. It owns generic chrome:

- current/history title
- busy and streaming status
- plugin-missing fallback
- header actions
- empty state
- dispatching renderer/editor/diff/delivery components

Example:

```tsx
<ArtifactPanel
  artifact={currentArtifact}
  plugin={artifactPlugin}
  mode="current"
/>
```

Concrete UI is plugin-owned:

- `social-post` registers renderer/editor/diff/delivery components
- `prd` registers renderer/editor/diff/delivery components
- future `brainstorm` and `drawing` plugins register their own surfaces

`TreeableApp` should track generic streaming state such as `streamingArtifact`, not `streamingDraft`. Selection rewrite should become a plugin action. Core should not contain social-post field names except where it bridges plugin metadata.

## Deletion And Rename Plan

Remove or replace core draft names:

- `src/components/draft/LiveDraft.tsx`
- `src/components/draft/LiveDraft.test.tsx`
- `DraftStreamEvent`, `StreamingDraftEntry`, `DraftSelectionRewriteRequest`
- `draftForNode`, `directDraftForNode`, `changedDraftNodeIdsForState`, and similar helpers
- `src/app/api/sessions/[sessionId]/draft/*`
- repository methods dedicated to draft/publish package behavior
- `src/lib/artifacts.ts` fields that assume `Draft`

New names should use `Artifact`, `Payload`, `Plugin`, and plugin-specific names such as `SocialPostPayload`.

## Testing

Focused coverage:

- domain tests: `SessionStateSchema` contains generic artifacts and no draft fields
- registry tests: plugin discovery, duplicate plugin ids, unknown plugin lookup, schema validation failures
- repository tests: sessions create node artifacts, branch generation stores artifacts, invalid plugin payloads fail
- API tests: save artifact, generate artifact stream, dispatch plugin action
- UI tests: `ArtifactPanel` dispatches registered renderer/editor/delivery components and shows fallback for missing plugins
- social-post plugin tests: current social post editing, diff, delivery, and selected-text action behavior
- PRD plugin tests: `PrdPayload` rendering, Markdown editing, delivery checks, and AI instructions

Final search verification:

```bash
rg "Draft|draft|publishPackage|nodeDrafts|currentDraft" src docs/superpowers/specs docs/superpowers/plans
```

Allowed matches should be limited to:

- this design and implementation plan text
- plugin-local user-facing copy where "draft" is intentional
- third-party or historical docs not touched by this implementation

## Out Of Scope

- remote artifact plugin installation or untrusted code loading
- preserving existing session content data
- redesigning the tree interaction model
- adding the future brainstorm or drawing plugin in the first implementation
- converting old docs and plans beyond the files touched by this work
