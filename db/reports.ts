import { env } from "cloudflare:workers";

type Severity = "low" | "medium" | "high";

function database() {
  if (!env.DB) throw new Error("Database binding is unavailable");
  return env.DB;
}

export async function getReports() {
  const result = await database().prepare(`
    SELECT id, latitude, longitude, severity, water_depth, description, area_name, image_key, created_at
    FROM flood_reports
    ORDER BY created_at DESC
    LIMIT 200
  `).all<{ id: string; latitude: number; longitude: number; severity: Severity; water_depth: number; description: string; area_name: string; image_key: string | null; created_at: number }>();
  return result.results.map((row) => ({
    id: row.id, latitude: row.latitude, longitude: row.longitude, severity: row.severity,
    waterDepth: row.water_depth, description: row.description, areaName: row.area_name,
    imageUrl: row.image_key ? `/api/images/${row.image_key}` : null, createdAt: row.created_at,
  }));
}

export async function saveFloodReport(input: { id: string; latitude: number; longitude: number; severity: Severity; waterDepth: number; areaName: string; description: string; imageKey: string | null }) {
  const createdAt = Date.now();
  await database().prepare(`
    INSERT INTO flood_reports (id, latitude, longitude, severity, water_depth, description, area_name, image_key, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(input.id, input.latitude, input.longitude, input.severity, input.waterDepth, input.description, input.areaName, input.imageKey, createdAt).run();
  return { ...input, imageUrl: input.imageKey ? `/api/images/${input.imageKey}` : null, createdAt };
}

export async function saveReportImage(id: string, file: File) {
  if (!env.BUCKET) throw new Error("Image storage binding is unavailable");
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const key = `${id}.${extension}`;
  await env.BUCKET.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  return key;
}

export async function deleteReportImage(key: string) {
  if (env.BUCKET) await env.BUCKET.delete(key);
}
