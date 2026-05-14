import { NextResponse } from "next/server";
import { authErrorResponse, requireCurrentUser } from "@/lib/auth/current-user";
import {
  ExternalInspirationProviderUnavailableError,
  InspirationProviderError,
  fetchExternalInspirations
} from "@/lib/inspirations";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireCurrentUser();
    const artifactTypeId = new URL(request.url).searchParams.get("artifactTypeId");
    const inspirations = await fetchExternalInspirations({ artifactTypeId });
    return NextResponse.json({ inspirations });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    if (error instanceof ExternalInspirationProviderUnavailableError) {
      return NextResponse.json({ inspirations: [] });
    }
    if (error instanceof InspirationProviderError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "灵感加载失败。" }, { status: 500 });
  }
}
