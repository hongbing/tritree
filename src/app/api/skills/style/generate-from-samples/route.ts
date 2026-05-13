import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequestResponse, isBadRequestError } from "@/lib/api/errors";
import { generateStyleFromSamples } from "@/lib/ai/style-profile-generator";
import { authErrorResponse, requireCurrentUser } from "@/lib/auth/current-user";
import { StyleProfileGenerationError } from "@/lib/skills/style-profile";

export const runtime = "nodejs";

const GenerateFromSamplesBodySchema = z.object({
  samples: z.array(z.string()).default([])
});

export async function POST(request: Request) {
  try {
    await requireCurrentUser();
    const body = GenerateFromSamplesBodySchema.parse(await request.json());
    const skillDraft = await generateStyleFromSamples({ samples: body.samples });
    return NextResponse.json({ skillDraft });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    if (isBadRequestError(error)) return badRequestResponse(error);
    if (isStyleProfileGenerationError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "无法生成我的风格。" }, { status: 500 });
  }
}

function isStyleProfileGenerationError(error: unknown): error is StyleProfileGenerationError {
  return error instanceof StyleProfileGenerationError;
}
