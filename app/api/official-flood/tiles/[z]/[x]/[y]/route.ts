import { env } from "cloudflare:workers";

const GISTDA_TMS_URL = "https://api-gateway.gistda.or.th/api/2.0/resources/maps/flood/3days/tms";

export async function GET(_request: Request, context: { params: Promise<{ z: string; x: string; y: string }> }) {
  const apiKey = env.GISTDA_API_KEY?.trim();
  if (!apiKey) return Response.json({ error: "ยังไม่ได้ตั้งค่า GISTDA API Key" }, { status: 503 });

  const params = await context.params;
  const z = Number(params.z); const x = Number(params.x); const y = Number(params.y);
  const tileCount = 2 ** z;
  if (!Number.isInteger(z) || z < 0 || z > 19 || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= tileCount || y >= tileCount) {
    return Response.json({ error: "พิกัดแผนที่ไม่ถูกต้อง" }, { status: 400 });
  }

  // GISTDA names this endpoint TMS, but its documented tile rows use the XYZ scheme.
  const upstreamUrl = `${GISTDA_TMS_URL}/${z}/${x}/${y}?api_key=${encodeURIComponent(apiKey)}`;
  try {
    const upstream = await fetch(upstreamUrl, { headers: { Accept: "image/png,image/webp,*/*" }, cf: { cacheEverything: true, cacheTtl: 600 } });
    const contentType = upstream.headers.get("content-type") || "";
    if (!upstream.ok || !contentType.startsWith("image/")) {
      console.error("GISTDA tile request failed", upstream.status, contentType);
      return Response.json({ error: "ยังโหลดข้อมูลน้ำท่วมจาก GISTDA ไม่ได้" }, { status: upstream.status === 401 || upstream.status === 403 ? 502 : 503 });
    }
    return new Response(upstream.body, { headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=600, stale-while-revalidate=3600",
      "X-Content-Type-Options": "nosniff",
      "X-Flood-Data-Window": "3days",
    } });
  } catch (error) {
    console.error("GISTDA tile request error", error);
    return Response.json({ error: "เชื่อมต่อข้อมูลน้ำท่วม GISTDA ไม่สำเร็จ" }, { status: 503 });
  }
}
