import type { ReactNode } from "react";
import type { z } from "zod";
import type { Artifact, SessionState, Skill } from "@/lib/domain";

export type ArtifactCapabilities = {
  actions: string[];
  deliver: boolean;
  diff: boolean;
  edit: boolean;
  generate: boolean;
  streamFields: string[];
};

export type SeedPayloadInput = {
  creationRequest: string;
  seed: string;
  skills: Skill[];
};

export type PromptInstructionInput = {
  sourceArtifacts: Artifact[];
};

export type ArtifactActionInput = {
  artifact: Artifact;
  input: unknown;
  sessionState: SessionState;
};

export type ArtifactActionResult<TPayload> = {
  payload: TPayload;
  sourceArtifactIds?: string[];
};

export type ArtifactActionHandler<TPayload> = (input: ArtifactActionInput) => Promise<ArtifactActionResult<TPayload>>;

export class ArtifactActionConflictError extends Error {
  constructor(
    message: string,
    readonly publicMessage = message
  ) {
    super(message);
    this.name = "ArtifactActionConflictError";
  }
}

export type ArtifactPluginServer<TPayload, TAiOutput = TPayload> = {
  aiOutputSchema: z.ZodType<TAiOutput>;
  capabilities: ArtifactCapabilities;
  createSeedPayload(input: SeedPayloadInput): TPayload | null;
  description: string;
  handleAction?: ArtifactActionHandler<TPayload>;
  id: string;
  label: string;
  normalizeAiOutput(output: TAiOutput): TPayload;
  payloadSchema: z.ZodType<TPayload>;
  promptInstructions(input: PromptInstructionInput): string;
  summarizeForDirector(payload: TPayload): string;
  summarizeForTree(payload: TPayload): string;
};

export type ArtifactPluginClientManifest = {
  capabilities: ArtifactCapabilities;
  deliveryKey?: string;
  description: string;
  diffKey?: string;
  editorKey?: string;
  id: string;
  label: string;
  rendererKey: string;
};

export type ArtifactRendererProps = {
  artifact: Artifact;
  isBusy: boolean;
  onAction?: (actionId: string, input: unknown) => void | Promise<void>;
  onSave?: (payload: unknown) => void | Promise<void>;
  previousArtifact?: Artifact | null;
  publishPlatforms?: string[];
};

export type ArtifactRenderer = (props: ArtifactRendererProps) => ReactNode;
