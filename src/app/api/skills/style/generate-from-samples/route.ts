import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequestResponse, isBadRequestError } from "@/lib/api/errors";
import { logTritreeAiResponse } from "@/lib/ai/debug-log";
import { streamStyleFromSamples } from "@/lib/ai/style-profile-generator";
import { authErrorResponse, requireCurrentUser } from "@/lib/auth/current-user";
import { StyleProfileGenerationError } from "@/lib/skills/style-profile";
import { encodeNdjson } from "@/lib/stream/ndjson";

export const runtime = "nodejs";

const GenerateFromSamplesBodySchema = z.object({
  samples: z.array(z.string())
});

const ndjsonHeaders = {
  "Content-Type": "application/x-ndjson; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  "X-Content-Type-Options": "nosniff"
};

export async function POST(request: Request) {
  let body: z.infer<typeof GenerateFromSamplesBodySchema>;

  try {
    await requireCurrentUser();
    body = GenerateFromSamplesBodySchema.parse(await request.json());
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    if (isBadRequestError(error)) return badRequestResponse(error);
    return NextResponse.json({ error: "无法生成我的风格。" }, { status: 500 });
  }

  if (body.samples.every((sample) => sample.trim().length === 0)) {
    logStyleProfileRequest(body.samples);
    logStyleProfileResponse({ error: "请先粘贴至少一段代表作。" });
    return NextResponse.json({ error: "请先粘贴至少一段代表作。" }, { status: 400 });
  }

  logStyleProfileRequest(body.samples);

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (value: unknown) => {
        controller.enqueue(encoder.encode(encodeNdjson(value)));
      };

      try {
        send({ type: "progress", message: "正在归纳你的表达习惯..." });
        const skillDraft = await streamStyleFromSamples({
          samples: body.samples,
          signal: request.signal,
          onPartialDraft(partial) {
            send({ type: "draft", skillDraft: partial });
          }
        });
        logStyleProfileResponse({ skillDraft });
        send({ type: "done", skillDraft });
      } catch (error) {
        const message = error instanceof StyleProfileGenerationError ? error.message : "无法生成我的风格。";
        logStyleProfileResponse({ error: message });
        send({ type: "error", error: message });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, { headers: ndjsonHeaders });
}

function logStyleProfileRequest(samples: string[]) {
  logTritreeAiResponse("style-profile", "request", {
    source: "samples",
    samples
  });
}

function logStyleProfileResponse(details: { error: string } | { skillDraft: unknown }) {
  logTritreeAiResponse("style-profile", "response", {
    source: "samples",
    ...details
  });
}
