import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    configured: Boolean(env.GISTDA_API_KEY?.trim()),
    source: "GISTDA Disaster Platform",
    window: "3days",
  }, { headers: { "Cache-Control": "public, max-age=60" } });
}
