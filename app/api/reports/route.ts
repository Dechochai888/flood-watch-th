import { NextResponse } from "next/server";
import { deleteFloodReport, deleteReportImage, getReports, saveFloodReport, saveReportImage } from "@/db/reports";

export const dynamic = "force-dynamic";

async function hashSecret(secret: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function GET() {
  try {
    return NextResponse.json({ reports: await getReports() });
  } catch (error) {
    console.error("Failed to load flood reports", error);
    return NextResponse.json({ error: "ระบบข้อมูลยังไม่พร้อมใช้งาน" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  let imageKey: string | null = null;
  try {
    const form = await request.formData();
    const latitude = Number(form.get("latitude"));
    const longitude = Number(form.get("longitude"));
    const severity = String(form.get("severity"));
    const waterDepth = Number(form.get("waterDepth"));
    const areaName = String(form.get("areaName") ?? "").trim().slice(0, 100);
    const description = String(form.get("description") ?? "").trim().slice(0, 500);
    const reportType = String(form.get("reportType") ?? "flood");
    const contactName = String(form.get("contactName") ?? "").trim().slice(0, 100);
    const contactPhone = String(form.get("contactPhone") ?? "").trim().slice(0, 30);
    const helpNeeds = String(form.get("helpNeeds") ?? "").trim().slice(0, 200);
    const image = form.get("image");

    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return NextResponse.json({ error: "พิกัดไม่ถูกต้อง" }, { status: 400 });
    }
    if (!["flood", "help"].includes(reportType) || !["low", "medium", "high"].includes(severity) || !Number.isFinite(waterDepth) || waterDepth < 0 || waterDepth > 500 || !description) {
      return NextResponse.json({ error: "กรุณากรอกข้อมูลสถานการณ์ให้ครบถ้วน" }, { status: 400 });
    }
    if (reportType === "help" && (!helpNeeds || !contactPhone)) {
      return NextResponse.json({ error: "กรุณาระบุสิ่งที่ต้องการและเบอร์โทรติดต่อ" }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const deleteToken = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    if (image instanceof File && image.size > 0) {
      if (image.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(image.type)) {
        return NextResponse.json({ error: "รองรับเฉพาะ JPG, PNG หรือ WebP ขนาดไม่เกิน 5 MB" }, { status: 400 });
      }
      imageKey = await saveReportImage(id, image);
    }
    const report = await saveFloodReport({ id, latitude, longitude, severity: severity as "low" | "medium" | "high", waterDepth, areaName, description, imageKey, reportType: reportType as "flood" | "help", contactName, contactPhone, helpNeeds, deleteSecretHash: await hashSecret(deleteToken) });
    return NextResponse.json({ report, deleteToken }, { status: 201 });
  } catch (error) {
    if (imageKey) await deleteReportImage(imageKey).catch(() => undefined);
    console.error("Failed to save flood report", error);
    return NextResponse.json({ error: "บันทึกรายงานไม่สำเร็จ กรุณาลองใหม่" }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json() as { id?: unknown; deleteToken?: unknown };
    const id = typeof body.id === "string" ? body.id : "";
    const deleteToken = typeof body.deleteToken === "string" ? body.deleteToken : "";
    if (!id || deleteToken.length < 20) return NextResponse.json({ error: "ไม่มีสิทธิ์ลบรายการนี้" }, { status: 403 });
    const deleted = await deleteFloodReport(id, await hashSecret(deleteToken));
    if (!deleted) return NextResponse.json({ error: "ไม่พบรายการหรือไม่มีสิทธิ์ลบ" }, { status: 403 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete report", error);
    return NextResponse.json({ error: "ลบรายการไม่สำเร็จ" }, { status: 503 });
  }
}
