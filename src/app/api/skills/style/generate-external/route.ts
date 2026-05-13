import { NextResponse } from "next/server";
import { authErrorResponse, requireCurrentUser } from "@/lib/auth/current-user";
import { StyleProfileGenerationError, fetchExternalStyleProfile } from "@/lib/skills/style-profile";

export const runtime = "nodejs";

export async function POST(_request?: Request) {
  try {
    const user = await requireCurrentUser();
    const skillDraft = await fetchExternalStyleProfile({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName
      }
    });
    return NextResponse.json({ skillDraft });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    if (error instanceof StyleProfileGenerationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "无法生成我的风格。" }, { status: 500 });
  }
}
