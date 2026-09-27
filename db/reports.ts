import { env } from "cloudflare:workers";

type Severity = "low" | "medium" | "high";
type ReportType = "flood" | "help";

function database() {
  if (!env.DB) throw new Error("Database binding is unavailable");
  return env.DB;
}

function parseImageKeys(imageKey: string | null, imageKeys: string) {
  let keys: string[] = [];
  try {
    const parsed = JSON.parse(imageKeys || "[]");
    if (Array.isArray(parsed)) keys = parsed.filter((key): key is string => typeof key === "string" && key.length > 0);
  } catch { keys = []; }
  if (imageKey && !keys.includes(imageKey)) keys.unshift(imageKey);
  return keys;
}

export async function getReports() {
  const result = await database().prepare(`
    SELECT id, latitude, longitude, severity, water_depth, description, area_name, image_key, image_keys,
           report_type, contact_name, contact_phone, help_needs, created_at
    FROM flood_reports
    ORDER BY created_at DESC
    LIMIT 200
  `).all<{ id: string; latitude: number; longitude: number; severity: Severity; water_depth: number; description: string; area_name: string; image_key: string | null; image_keys: string; report_type: ReportType; contact_name: string; contact_phone: string; help_needs: string; created_at: number }>();
  return result.results.map((row) => {
    const imageUrls = parseImageKeys(row.image_key, row.image_keys).map((key) => `/api/images/${key}`);
    return {
      id: row.id, latitude: row.latitude, longitude: row.longitude, severity: row.severity,
      waterDepth: row.water_depth, description: row.description, areaName: row.area_name,
      reportType: row.report_type, contactName: row.contact_name, contactPhone: row.contact_phone, helpNeeds: row.help_needs,
      imageUrl: imageUrls[0] ?? null, imageUrls, createdAt: row.created_at,
    };
  });
}

export async function saveFloodReport(input: { id: string; latitude: number; longitude: number; severity: Severity; waterDepth: number; areaName: string; description: string; imageKey: string | null; imageKeys: string[]; reportType: ReportType; contactName: string; contactPhone: string; helpNeeds: string; deleteSecretHash: string }) {
  const createdAt = Date.now();
  await database().prepare(`
    INSERT INTO flood_reports (id, latitude, longitude, severity, water_depth, description, area_name, image_key, image_keys, report_type, contact_name, contact_phone, help_needs, delete_secret_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(input.id, input.latitude, input.longitude, input.severity, input.waterDepth, input.description, input.areaName, input.imageKey, JSON.stringify(input.imageKeys), input.reportType, input.contactName, input.contactPhone, input.helpNeeds, input.deleteSecretHash, createdAt).run();
  return {
    id: input.id, latitude: input.latitude, longitude: input.longitude, severity: input.severity,
    waterDepth: input.waterDepth, areaName: input.areaName, description: input.description,
    imageKey: input.imageKey, imageUrls: input.imageKeys.map((key) => `/api/images/${key}`), reportType: input.reportType, contactName: input.contactName,
    contactPhone: input.contactPhone, helpNeeds: input.helpNeeds,
    imageUrl: input.imageKey ? `/api/images/${input.imageKey}` : null, createdAt,
  };
}

export async function deleteFloodReport(id: string, deleteSecretHash: string) {
  const row = await database().prepare("SELECT image_key, image_keys, delete_secret_hash FROM flood_reports WHERE id = ?").bind(id).first<{ image_key: string | null; image_keys: string; delete_secret_hash: string | null }>();
  if (!row || !row.delete_secret_hash || row.delete_secret_hash !== deleteSecretHash) return false;
  await database().prepare("DELETE FROM flood_reports WHERE id = ? AND delete_secret_hash = ?").bind(id, deleteSecretHash).run();
  await Promise.all(parseImageKeys(row.image_key, row.image_keys).map((key) => deleteReportImage(key).catch(() => undefined)));
  return true;
}

export async function saveReportImage(id: string, file: File, index = 0) {
  if (!env.BUCKET) throw new Error("Image storage binding is unavailable");
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const key = `${id}-${index + 1}.${extension}`;
  await env.BUCKET.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  return key;
}

export async function deleteReportImage(key: string) {
  if (env.BUCKET) await env.BUCKET.delete(key);
}
