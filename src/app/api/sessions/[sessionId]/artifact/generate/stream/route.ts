import { NextResponse } from "next/server";
import { z } from "zod";
import { requireArtifactPlugin } from "@/artifacts/registry";
import { streamDirectorArtifact, streamDirectorNextStep } from "@/lib/ai/director-stream";
import { badRequestResponse, isAbortError, isBadRequestError, publicServerErrorMessage } from "@/lib/api/errors";
import { focusSessionStateForNode, summarizeSessionForDirector } from "@/lib/app-state";
import { authErrorResponse, requireCurrentUser } from "@/lib/auth/current-user";
import { getRepository } from "@/lib/db/repository";
import {
  OptionGenerationModeSchema,
  type AgentMessage,
  type Artifact,
  type BranchOption,
  type GeneratedArtifact,
  type SessionState,
  type TreeNode
} from "@/lib/domain";
import { encodeNdjson } from "@/lib/stream/ndjson";

export const runtime = "nodejs";

const ArtifactGenerateBodySchema = z.object({
  nodeId: z.string().min(1),
  note: z.string().max(1200).optional(),
  optionMode: OptionGenerationModeSchema.default("balanced")
});

type ArtifactStreamEvent =
  | { type: "artifact.replace"; artifact: Artifact }
  | { type: "thinking"; nodeId?: string | null; stage?: "artifact" | "options"; text: string }
  | { type: "options"; nodeId: string; options: BranchOption[]; roundIntent?: string | null }
  | { type: "done"; state: SessionState }
  | { type: "error"; error: string };

const ndjsonHeaders = {
  "Content-Type": "application/x-ndjson; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  "X-Content-Type-Options": "nosniff"
};

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;
  const user = await requireCurrentUser().catch((error) => {
    const response = authErrorResponse(error);
    if (response) return response;
    throw error;
  });
  if (user instanceof Response) return user;

  let body: z.infer<typeof ArtifactGenerateBodySchema>;

  try {
    body = ArtifactGenerateBodySchema.parse(await request.json());
  } catch (error) {
    if (isBadRequestError(error)) {
      return badRequestResponse(error);
    }

    return NextResponse.json({ error: "请求内容格式不正确。" }, { status: 400 });
  }

  const repository = getRepository();
  const state = repository.getSessionState(user.id, sessionId);
  if (!state) {
    return NextResponse.json({ error: "没有找到这次创作。" }, { status: 404 });
  }

  const targetNode = findTreeNode(state, body.nodeId);
  if (!targetNode) {
    return NextResponse.json({ error: "没有找到要生成作品的节点。" }, { status: 404 });
  }

  if (state.nodeArtifacts.some((item) => item.nodeId === body.nodeId)) {
    return new Response(encodeNdjson({ type: "done", state } satisfies ArtifactStreamEvent), { headers: ndjsonHeaders });
  }

  const parentState = parentStateForArtifactNode(state, targetNode);
  const selectedOption = selectedOptionForArtifactNode(parentState, targetNode);
  if (!parentState || !selectedOption) {
    return NextResponse.json({ error: "没有找到这个节点的进入方向。" }, { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (value: ArtifactStreamEvent) => {
        controller.enqueue(encoder.encode(encodeNdjson(value)));
      };

      try {
        const directorParts = summarizeSessionForDirector(
          parentState,
          selectedOption,
          body.note,
          selectedOption.mode ?? body.optionMode
        );
        const memory = { resource: state.rootMemory.id, thread: sessionId };
        const nextStep = await streamDirectorNextStep(directorParts, {
          memory,
          signal: request.signal,
          onReasoningText(event) {
            send({ type: "thinking", nodeId: targetNode.id, stage: "options", text: event.accumulatedText });
          },
          onText(event) {
            if (event.partialOptions) {
              send({
                type: "options",
                nodeId: targetNode.id,
                roundIntent: event.partialRoundIntent,
                options: event.partialOptions
              });
            }
          }
        });

        if (nextStep.action === "options") {
          const nextState = repository.updateNodeOptions({
            userId: user.id,
            sessionId,
            nodeId: targetNode.id,
            output: {
              roundIntent: nextStep.roundIntent,
              options: nextStep.options
            },
            ...(nextStep.agentMessages?.length ? { agentMessages: nextStep.agentMessages } : {})
          });
          send({
            type: "options",
            nodeId: targetNode.id,
            roundIntent: nextStep.roundIntent,
            options: nextStep.options
          });
          send({ type: "done", state: nextState });
          return;
        }

        if (nextStep.action === "complete") {
          const nextState = repository.completeNode({
            userId: user.id,
            sessionId,
            nodeId: targetNode.id,
            output: {
              roundIntent: nextStep.roundIntent
            },
            ...(nextStep.agentMessages?.length ? { agentMessages: nextStep.agentMessages } : {})
          });
          send({ type: "done", state: nextState });
          return;
        }

        const output =
          nextStep.artifact !== undefined
            ? nextStep
            : await streamDirectorArtifact(directorParts, {
                memory,
                signal: request.signal,
                onReasoningText(event) {
                  send({ type: "thinking", nodeId: targetNode.id, stage: "artifact", text: event.accumulatedText });
                }
              });

        const agentMessages = agentMessagesArgument(nextStep.agentMessages, output.agentMessages);
        if (!output.artifact) {
          const nextState = repository.completeNode({
            userId: user.id,
            sessionId,
            nodeId: targetNode.id,
            output: {
              roundIntent: output.roundIntent
            },
            ...agentMessages
          });
          send({ type: "done", state: nextState });
          return;
        }

        const artifact = validateGeneratedArtifact(output.artifact);
        const nextState = repository.updateNodeArtifact({
          userId: user.id,
          sessionId,
          nodeId: targetNode.id,
          roundIntent: output.roundIntent,
          artifact,
          ...agentMessages
        });
        const savedArtifact = artifactForNode(nextState, targetNode.id);
        if (!savedArtifact) {
          throw new Error("Updated artifact was not found in the session state.");
        }
        send({ type: "artifact.replace", artifact: savedArtifact });
        send({ type: "done", state: nextState });
      } catch (error) {
        if (request.signal.aborted || isAbortError(error)) return;
        console.error("[treeable:generate-artifact-stream]", error);
        send({ type: "error", error: publicServerErrorMessage(error, "无法生成下一版作品。") });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, { headers: ndjsonHeaders });
}

function findTreeNode(state: SessionState, nodeId: string) {
  return state.treeNodes?.find((node) => node.id === nodeId) ?? state.selectedPath.find((node) => node.id === nodeId) ?? null;
}

function parentStateForArtifactNode(state: SessionState, node: TreeNode) {
  if (node.parentId) return focusSessionStateForNode(state, node.parentId);
  return state;
}

function selectedOptionForArtifactNode(state: SessionState | null, node: TreeNode): BranchOption | null {
  if (!state || !node.parentOptionId) return null;
  return state.currentNode?.options.find((option) => option.id === node.parentOptionId) ?? null;
}

function agentMessagesArgument(...messageGroups: Array<AgentMessage[] | undefined>) {
  const agentMessages = messageGroups.flatMap((messages) => messages ?? []);
  return agentMessages.length > 0 ? { agentMessages } : {};
}

function validateGeneratedArtifact(artifact: GeneratedArtifact) {
  const plugin = requireArtifactPlugin(artifact.type);
  return {
    type: plugin.id,
    payload: plugin.payloadSchema.parse(artifact.payload),
    sourceArtifactIds: artifact.sourceArtifactIds ?? []
  };
}

function artifactForNode(state: SessionState, nodeId: string) {
  return state.nodeArtifacts.find((item) => item.nodeId === nodeId)?.artifact ?? null;
}
