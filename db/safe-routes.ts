import { env } from "cloudflare:workers";

export type RoutePoint = [number, number];

function database() {
  if (!env.DB) throw new Error("Database binding is unavailable");
  return env.DB;
}

function parsePath(value: string): RoutePoint[] {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((point): point is RoutePoint => Array.isArray(point) && point.length === 2 && point.every((value) => typeof value === "number" && Number.isFinite(value)));
  } catch { return []; }
}

export async function getSafeRoutes() {
  const result = await database().prepare(`
    SELECT id, name, description, path, created_at
    FROM safe_routes
    ORDER BY created_at DESC
    LIMIT 100
  `).all<{ id: string; name: string; description: string; path: string; created_at: number }>();
  return result.results.map((row) => ({ id: row.id, name: row.name, description: row.description, path: parsePath(row.path), createdAt: row.created_at }));
}

export async function saveSafeRoute(input: { id: string; name: string; description: string; path: RoutePoint[]; deleteSecretHash: string }) {
  const createdAt = Date.now();
  await database().prepare(`
    INSERT INTO safe_routes (id, name, description, path, delete_secret_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(input.id, input.name, input.description, JSON.stringify(input.path), input.deleteSecretHash, createdAt).run();
  return { id: input.id, name: input.name, description: input.description, path: input.path, createdAt };
}

export async function deleteSafeRoute(id: string, deleteSecretHash: string) {
  const result = await database().prepare("DELETE FROM safe_routes WHERE id = ? AND delete_secret_hash = ?").bind(id, deleteSecretHash).run();
  return Boolean(result.meta.changes);
}
