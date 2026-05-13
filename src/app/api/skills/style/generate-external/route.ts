import { NextResponse } from "next/server";
import { logTritreeAiResponse } from "@/lib/ai/debug-log";
import { authErrorResponse, requireCurrentUser } from "@/lib/auth/current-user";
import { StyleProfileGenerationError, fetchExternalStyleProfile } from "@/lib/skills/style-profile";

export const runtime = "nodejs";

export async function POST(_request?: Request) {
  try {
    const user = await requireCurrentUser();
    const styleProfileUser = {
      id: user.id,
      username: user.username,
      displayName: user.displayName
    };
    logTritreeAiResponse("style-profile", "request", {
      source: "external",
      user: styleProfileUser
    });
    const skillDraft = await fetchExternalStyleProfile({
      user: styleProfileUser
    });
    logTritreeAiResponse("style-profile", "response", {
      source: "external",
      skillDraft
    });
    return NextResponse.json({ skillDraft });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    if (error instanceof StyleProfileGenerationError) {
      logTritreeAiResponse("style-profile", "response", {
        source: "external",
        error: error.message
      });
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    logTritreeAiResponse("style-profile", "response", {
      source: "external",
      error: "无法生成我的风格。"
    });
    return NextResponse.json({ error: "无法生成我的风格。" }, { status: 500 });
  }
}
