import { NextResponse } from "next/server";
import { deleteReportImage, getReports, saveFloodReport, saveReportImage } from "@/db/reports";

export const dynamic = "force-dynamic";

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
    const image = form.get("image");

    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return NextResponse.json({ error: "พิกัดไม่ถูกต้อง" }, { status: 400 });
    }
    if (!["low", "medium", "high"].includes(severity) || !Number.isFinite(waterDepth) || waterDepth < 0 || waterDepth > 500 || !description) {
      return NextResponse.json({ error: "กรุณากรอกข้อมูลสถานการณ์ให้ครบถ้วน" }, { status: 400 });
    }

    const id = crypto.randomUUID();
    if (image instanceof File && image.size > 0) {
      if (image.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(image.type)) {
        return NextResponse.json({ error: "รองรับเฉพาะ JPG, PNG หรือ WebP ขนาดไม่เกิน 5 MB" }, { status: 400 });
      }
      imageKey = await saveReportImage(id, image);
    }
    const report = await saveFloodReport({ id, latitude, longitude, severity: severity as "low" | "medium" | "high", waterDepth, areaName, description, imageKey });
    return NextResponse.json({ report }, { status: 201 });
  } catch (error) {
    if (imageKey) await deleteReportImage(imageKey).catch(() => undefined);
    console.error("Failed to save flood report", error);
    return NextResponse.json({ error: "บันทึกรายงานไม่สำเร็จ กรุณาลองใหม่" }, { status: 503 });
  }
}
