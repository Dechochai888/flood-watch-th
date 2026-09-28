import { NextResponse } from "next/server";
import { deleteSafeRoute, getSafeRoutes, saveSafeRoute, type RoutePoint } from "@/db/safe-routes";

export const dynamic = "force-dynamic";

async function hashSecret(secret: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function validPath(value: unknown): value is RoutePoint[] {
  return Array.isArray(value) && value.length >= 2 && value.length <= 200 && value.every((point) => Array.isArray(point) && point.length === 2 && Number.isFinite(point[0]) && point[0] >= -90 && point[0] <= 90 && Number.isFinite(point[1]) && point[1] >= -180 && point[1] <= 180);
}

export async function GET() {
  try { return NextResponse.json({ routes: await getSafeRoutes() }); }
  catch (error) { console.error("Failed to load safe routes", error); return NextResponse.json({ error: "ยังโหลดเส้นทางไม่ได้" }, { status: 503 }); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { name?: unknown; description?: unknown; path?: unknown };
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
    const description = typeof body.description === "string" ? body.description.trim().slice(0, 500) : "";
    if (!name || !validPath(body.path)) return NextResponse.json({ error: "กรุณาระบุชื่อและวาดเส้นทางอย่างน้อย 2 จุด" }, { status: 400 });
    const id = crypto.randomUUID();
    const deleteToken = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    const route = await saveSafeRoute({ id, name, description, path: body.path, deleteSecretHash: await hashSecret(deleteToken) });
    return NextResponse.json({ route, deleteToken }, { status: 201 });
  } catch (error) { console.error("Failed to save safe route", error); return NextResponse.json({ error: "บันทึกเส้นทางไม่สำเร็จ" }, { status: 503 }); }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json() as { id?: unknown; deleteToken?: unknown };
    const id = typeof body.id === "string" ? body.id : "";
    const deleteToken = typeof body.deleteToken === "string" ? body.deleteToken : "";
    if (!id || deleteToken.length < 20) return NextResponse.json({ error: "ไม่มีสิทธิ์ลบเส้นทางนี้" }, { status: 403 });
    if (!await deleteSafeRoute(id, await hashSecret(deleteToken))) return NextResponse.json({ error: "ไม่พบเส้นทางหรือไม่มีสิทธิ์ลบ" }, { status: 403 });
    return NextResponse.json({ ok: true });
  } catch (error) { console.error("Failed to delete safe route", error); return NextResponse.json({ error: "ลบเส้นทางไม่สำเร็จ" }, { status: 503 }); }
}
