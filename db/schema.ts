import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const floodReports = sqliteTable("flood_reports", {
  id: text("id").primaryKey(),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  severity: text("severity", { enum: ["low", "medium", "high"] }).notNull(),
  waterDepth: integer("water_depth").notNull(),
  description: text("description").notNull(),
  areaName: text("area_name").notNull().default(""),
  imageKey: text("image_key"),
  imageKeys: text("image_keys").notNull().default(""),
  reportType: text("report_type", { enum: ["flood", "help", "water_receded", "route_open"] }).notNull().default("flood"),
  contactName: text("contact_name").notNull().default(""),
  contactPhone: text("contact_phone").notNull().default(""),
  helpNeeds: text("help_needs").notNull().default(""),
  deleteSecretHash: text("delete_secret_hash"),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("idx_flood_reports_created_at").on(table.createdAt),
  index("idx_flood_reports_severity_created_at").on(table.severity, table.createdAt),
]);
