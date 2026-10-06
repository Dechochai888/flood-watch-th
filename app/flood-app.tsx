"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Clock3, CloudRain, Crosshair, Droplets, HandHelping, ImagePlus, Layers3, ListFilter, Loader2, LocateFixed, Map as MapIcon, Navigation, Plus, RefreshCw, Route, Satellite, Save, ShieldCheck, Square, Trash2, TrendingDown, Undo2, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { FloodMap, type MapStyle } from "./flood-map";

export type Severity = "low" | "medium" | "high";
export type ReportType = "flood" | "help" | "water_receded" | "route_open";
export type FloodReport = {
  id: string; latitude: number; longitude: number; severity: Severity; waterDepth: number;
  description: string; areaName: string; imageUrl: string | null; imageUrls: string[]; createdAt: number;
  reportType: ReportType; contactName: string; contactPhone: string; helpNeeds: string;
};
export type SafeRoute = { id: string; name: string; description: string; path: [number, number][]; createdAt: number };

const TOKEN_KEY = "flood-watch-delete-tokens";
const ROUTE_TOKEN_KEY = "flood-watch-route-delete-tokens";
const severityMeta: Record<Severity, { label: string; color: string; soft: string; ring: string }> = {
  low: { label: "เฝ้าระวัง", color: "#ca8a04", soft: "#fef9c3", ring: "ring-yellow-500/20" },
  medium: { label: "ควรหลีกเลี่ยง", color: "#ea580c", soft: "#ffedd5", ring: "ring-orange-500/20" },
  high: { label: "อันตราย", color: "#e11d48", soft: "#ffe4e6", ring: "ring-rose-600/20" },
};
const reportTypeMeta: Record<Exclude<ReportType, "flood">, { label: string; color: string; soft: string }> = {
  help: { label: "ขอความช่วยเหลือ", color: "#1d4ed8", soft: "#dbeafe" },
  water_receded: { label: "น้ำลดแล้ว", color: "#15803d", soft: "#dcfce7" },
  route_open: { label: "เส้นทางผ่านได้", color: "#0e7490", soft: "#cffafe" },
};

function reportBadge(report: FloodReport) {
  return report.reportType === "flood" ? severityMeta[report.severity] : reportTypeMeta[report.reportType];
}

function timeAgo(timestamp: number) {
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return "เมื่อสักครู่";
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} ชั่วโมงที่แล้ว` : `${Math.floor(hours / 24)} วันที่แล้ว`;
}

function readTokens(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || "{}"); } catch { return {}; }
}

function saveToken(id: string, token: string) {
  const tokens = readTokens(); tokens[id] = token; localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
}

function saveRouteToken(id: string, token: string) {
  if (typeof window === "undefined") return;
  let tokens: Record<string, string> = {};
  try { tokens = JSON.parse(localStorage.getItem(ROUTE_TOKEN_KEY) || "{}"); } catch { tokens = {}; }
  tokens[id] = token;
  localStorage.setItem(ROUTE_TOKEN_KEY, JSON.stringify(tokens));
}

function readRouteTokens(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(ROUTE_TOKEN_KEY) || "{}"); } catch { return {}; }
}

function removeRouteToken(id: string) {
  const tokens = readRouteTokens(); delete tokens[id]; localStorage.setItem(ROUTE_TOKEN_KEY, JSON.stringify(tokens));
}

function removeToken(id: string) {
  const tokens = readTokens(); delete tokens[id]; localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
}

export function FloodApp() {
  const [reports, setReports] = useState<FloodReport[]>([]);
  const [safeRoutes, setSafeRoutes] = useState<SafeRoute[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);
  const [formType, setFormType] = useState<ReportType>("flood");
  const [filter, setFilter] = useState<Severity | ReportType | "all">("all");
  const [position, setPosition] = useState<[number, number]>([13.6904, 101.0779]);
  const [locating, setLocating] = useState(false);
  const [locationReady, setLocationReady] = useState(false);
  const [mapStyle, setMapStyle] = useState<MapStyle>("street");
  const [rainEnabled, setRainEnabled] = useState(false);
  const [officialFloodEnabled, setOfficialFloodEnabled] = useState(false);
  const [routeDrawing, setRouteDrawing] = useState(false);
  const [routeTracking, setRouteTracking] = useState(false);
  const [trackingAccuracy, setTrackingAccuracy] = useState<number | null>(null);
  const [routePoints, setRoutePoints] = useState<[number, number][]>([]);
  const [routeListOpen, setRouteListOpen] = useState(false);
  const [routeSaveOpen, setRouteSaveOpen] = useState(false);
  const [ownedIds, setOwnedIds] = useState<Set<string>>(new Set());
  const [ownedRouteIds, setOwnedRouteIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<FloodReport | null>(null);
  const [routeDeleteTarget, setRouteDeleteTarget] = useState<SafeRoute | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deletingRoute, setDeletingRoute] = useState(false);
  const [imageViewer, setImageViewer] = useState<{ urls: string[]; index: number } | null>(null);
  const mapSectionRef = useRef<HTMLDivElement>(null);
  const routeWatchIdRef = useRef<number | null>(null);

  const loadReports = useCallback(async () => {
    try {
      const response = await fetch("/api/reports", { cache: "no-store" });
      if (!response.ok) throw new Error();
      const data = await response.json() as { reports: FloodReport[] };
      setReports(data.reports);
      const tokens = readTokens();
      setOwnedIds(new Set(data.reports.filter((report) => Boolean(tokens[report.id])).map((report) => report.id)));
    } catch { toast.error("ยังโหลดรายงานไม่ได้", { description: "โปรดลองใหม่อีกครั้งในอีกสักครู่" }); }
    finally { setLoading(false); }
  }, []);

  const loadSafeRoutes = useCallback(async () => {
    try {
      const response = await fetch("/api/safe-routes", { cache: "no-store" });
      if (!response.ok) throw new Error();
      const data = await response.json() as { routes: SafeRoute[] };
      setSafeRoutes(data.routes);
      const tokens = readRouteTokens();
      setOwnedRouteIds(new Set(data.routes.filter((route) => Boolean(tokens[route.id])).map((route) => route.id)));
    } catch { toast.error("ยังโหลดเส้นทางปลอดน้ำท่วมไม่ได้"); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadReports(), 0);
    return () => window.clearTimeout(timer);
  }, [loadReports]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadSafeRoutes(), 0);
    return () => window.clearTimeout(timer);
  }, [loadSafeRoutes]);

  useEffect(() => () => {
    if (routeWatchIdRef.current !== null) navigator.geolocation.clearWatch(routeWatchIdRef.current);
  }, []);

  const openForm = useCallback((type: ReportType) => { setFormType(type); setReportOpen(true); }, []);

  useEffect(() => {
    type ToolContext = { registerTool?: (tool: unknown, options: { signal: AbortSignal }) => void | Promise<void> };
    const context = (document as Document & { modelContext?: ToolContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(context.registerTool({
        name: "start_flood_report", title: "เริ่มแจ้งเหตุบนแผนที่", description: "เปิดแบบฟอร์มแจ้งน้ำท่วมหรือขอความช่วยเหลือด้วยพิกัดที่ระบุ",
        inputSchema: { type: "object", properties: { latitude: { type: "number" }, longitude: { type: "number" }, reportType: { type: "string", enum: ["flood", "help", "water_receded", "route_open"] } }, required: ["latitude", "longitude"], additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: (input: { latitude: number; longitude: number; reportType?: ReportType }) => {
          if (!Number.isFinite(input.latitude) || !Number.isFinite(input.longitude)) throw new Error("พิกัดไม่ถูกต้อง");
          setPosition([input.latitude, input.longitude]); setLocationReady(true); openForm(input.reportType ?? "flood");
          return { status: "ready", latitude: input.latitude, longitude: input.longitude };
        },
      }, { signal: lifecycle.signal })).catch(() => undefined);
    } catch { return; }
    return () => lifecycle.abort();
  }, [openForm]);

  const visibleReports = useMemo(() => reports.filter((report) => {
    if (filter === "all") return true;
    if (["flood", "help", "water_receded", "route_open"].includes(filter)) return report.reportType === filter;
    return report.reportType === "flood" && report.severity === filter;
  }), [filter, reports]);
  const selectedReport = reports.find((report) => report.id === selectedId) ?? null;
  const selectedRoute = safeRoutes.find((route) => route.id === selectedRouteId) ?? null;
  const highCount = reports.filter((report) => report.reportType === "flood" && report.severity === "high").length;
  const helpCount = reports.filter((report) => report.reportType === "help").length;

  const stopRouteWatch = useCallback(() => {
    if (routeWatchIdRef.current !== null) {
      navigator.geolocation.clearWatch(routeWatchIdRef.current);
      routeWatchIdRef.current = null;
    }
    setRouteTracking(false);
    setTrackingAccuracy(null);
  }, []);

  const startRouteDrawing = useCallback(() => {
    stopRouteWatch(); setSelectedId(null); setSelectedRouteId(null); setRoutePoints([]); setRouteDrawing(true); setRouteListOpen(false);
    window.requestAnimationFrame(() => mapSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    toast.info("แตะตามแนวถนนเพื่อวาดเส้นทาง อย่างน้อย 2 จุด");
  }, [stopRouteWatch]);

  const startRouteTracking = useCallback(() => {
    if (!navigator.geolocation) return toast.error("อุปกรณ์นี้ไม่รองรับการติดตามตำแหน่ง");
    stopRouteWatch(); setRouteDrawing(false); setSelectedId(null); setSelectedRouteId(null); setRoutePoints([]); setRouteListOpen(false); setRouteTracking(true);
    window.requestAnimationFrame(() => mapSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    routeWatchIdRef.current = navigator.geolocation.watchPosition(({ coords }) => {
      const nextPoint: [number, number] = [coords.latitude, coords.longitude];
      setPosition(nextPoint); setLocationReady(true); setTrackingAccuracy(Math.round(coords.accuracy));
      setRoutePoints((points) => {
        const previous = points.at(-1);
        if (previous && routeDistanceKm([previous, nextPoint]) < 0.015) return points;
        if (points.length < 200) return [...points, nextPoint];
        return [...points.filter((_, index) => index % 2 === 0), nextPoint];
      });
    }, (error) => {
      stopRouteWatch();
      toast.error("ไม่สามารถบันทึกเส้นทางจาก GPS ได้", { description: error.code === 1 ? "กรุณาอนุญาตให้เว็บไซต์เข้าถึงตำแหน่ง" : "ตรวจสอบสัญญาณ GPS แล้วลองใหม่อีกครั้ง" });
    }, { enableHighAccuracy: true, maximumAge: 2_000, timeout: 15_000 });
    toast.success("เริ่มบันทึกเส้นทางแล้ว", { description: "เปิดหน้านี้ไว้ และให้ผู้โดยสารเป็นผู้ควบคุมโทรศัพท์" });
  }, [stopRouteWatch]);

  const finishRouteTracking = useCallback(() => {
    stopRouteWatch();
    if (routePoints.length < 2) return toast.error("ยังมีจุด GPS ไม่เพียงพอ", { description: "ต้องเคลื่อนที่อย่างน้อยประมาณ 15 เมตรก่อนบันทึก" });
    setRouteDrawing(true);
    setRouteSaveOpen(true);
  }, [routePoints.length, stopRouteWatch]);

  const cancelRouteCapture = useCallback(() => {
    stopRouteWatch(); setRouteDrawing(false); setRoutePoints([]);
  }, [stopRouteWatch]);

  const useMyLocation = useCallback(() => {
    if (!navigator.geolocation) return toast.error("อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      setPosition([coords.latitude, coords.longitude]); setLocationReady(true); setLocating(false); toast.success("พบตำแหน่งของคุณแล้ว");
    }, () => { setLocating(false); toast.error("ไม่สามารถเข้าถึงตำแหน่งได้", { description: "อนุญาตการเข้าถึงตำแหน่ง แล้วลองใหม่อีกครั้ง" }); }, { enableHighAccuracy: true, timeout: 10_000 });
  }, []);

  const selectFromList = useCallback((id: string) => {
    setSelectedId(id);
    if (window.matchMedia("(max-width: 1023px)").matches) {
      window.requestAnimationFrame(() => mapSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }, []);

  async function confirmDelete() {
    if (!deleteTarget) return;
    const token = readTokens()[deleteTarget.id];
    if (!token) return toast.error("เครื่องนี้ไม่มีสิทธิ์ลบรายการดังกล่าว");
    setDeleting(true);
    try {
      const response = await fetch("/api/reports", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: deleteTarget.id, deleteToken: token }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "ลบรายการไม่สำเร็จ");
      removeToken(deleteTarget.id); setSelectedId(null); setDeleteTarget(null); await loadReports(); toast.success("ลบตำแหน่งเรียบร้อยแล้ว");
    } catch (error) { toast.error(error instanceof Error ? error.message : "ลบรายการไม่สำเร็จ"); }
    finally { setDeleting(false); }
  }

  async function confirmRouteDelete() {
    if (!routeDeleteTarget) return;
    const token = readRouteTokens()[routeDeleteTarget.id];
    if (!token) return toast.error("เครื่องนี้ไม่มีสิทธิ์ลบเส้นทางดังกล่าว");
    setDeletingRoute(true);
    try {
      const response = await fetch("/api/safe-routes", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: routeDeleteTarget.id, deleteToken: token }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "ลบเส้นทางไม่สำเร็จ");
      removeRouteToken(routeDeleteTarget.id); setSelectedRouteId(null); setRouteDeleteTarget(null); await loadSafeRoutes(); toast.success("ลบเส้นทางเรียบร้อยแล้ว");
    } catch (error) { toast.error(error instanceof Error ? error.message : "ลบเส้นทางไม่สำเร็จ"); }
    finally { setDeletingRoute(false); }
  }

  return (
    <main className="app-shell min-h-screen w-full min-w-0 max-w-[100vw] overflow-x-clip bg-[#eef6f8] text-[#102a33]">
      <header className="safe-app-header relative z-[1000] w-full min-w-0 border-b border-white/60 bg-[#073b4c] px-3 py-3 text-white shadow-lg shadow-[#073b4c]/10 sm:px-5 lg:flex lg:h-20 lg:items-center lg:justify-between lg:px-8 lg:py-0">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#13b8a6] shadow-inner shadow-white/25"><Droplets className="h-6 w-6" strokeWidth={2.4} /></div>
          <div className="min-w-0"><h1 className="text-base font-extrabold leading-tight tracking-tight sm:text-xl">น้ำท่วมไหน</h1><p className="truncate text-xs font-bold text-[#67ead4] sm:text-sm">#ฉะเชิงเทราเราช่วยกัน</p></div>
        </div>
        <div className="mt-3 grid min-w-0 grid-cols-2 gap-2 lg:mt-0 lg:grid-cols-4">
          <button onClick={() => openForm("help")} className="inline-flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl bg-[#2563eb] px-2 text-xs font-extrabold shadow-lg shadow-blue-950/20 transition hover:bg-[#1d4ed8] sm:gap-2 sm:px-3 sm:text-sm"><HandHelping className="h-5 w-5 shrink-0" /><span className="text-center leading-tight">ขอความช่วยเหลือ</span></button>
          <button onClick={() => openForm("flood")} className="inline-flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl bg-[#ff7a3d] px-2 text-xs font-extrabold shadow-lg shadow-orange-950/20 transition hover:bg-[#ff8b55] sm:gap-2 sm:px-3 sm:text-sm"><Plus className="h-5 w-5 shrink-0" /><span className="text-center leading-tight">แจ้งจุดน้ำท่วม</span></button>
          <button onClick={() => openForm("water_receded")} className="inline-flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl bg-[#16a34a] px-2 text-xs font-extrabold shadow-lg shadow-green-950/20 transition hover:bg-[#15803d] sm:gap-2 sm:px-3 sm:text-sm"><TrendingDown className="h-5 w-5 shrink-0" /><span className="text-center leading-tight">แจ้งน้ำลดแล้ว</span></button>
          <button onClick={() => openForm("route_open")} className="inline-flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl bg-[#0891b2] px-2 text-xs font-extrabold shadow-lg shadow-cyan-950/20 transition hover:bg-[#0e7490] sm:gap-2 sm:px-3 sm:text-sm"><Route className="h-5 w-5 shrink-0" /><span className="text-center leading-tight">แจ้งเส้นทางผ่านได้</span></button>
        </div>
      </header>

      <section className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)] min-h-[calc(100vh-80px)] lg:grid-cols-[minmax(0,1fr)_400px]">
        <div ref={mapSectionRef} className="relative w-full min-w-0 max-w-full min-h-[60dvh] scroll-mt-0 overflow-hidden border-b border-slate-200 lg:min-h-0 lg:border-b-0 lg:border-r">
          <FloodMap reports={visibleReports} safeRoutes={safeRoutes} routePoints={routePoints} routeDrawing={routeDrawing} routeTracking={routeTracking} position={position} locationReady={locationReady} selectedId={selectedId} selectedRouteId={selectedRouteId} mapStyle={mapStyle} rainEnabled={rainEnabled} officialFloodEnabled={officialFloodEnabled} onSelect={(id) => { setSelectedRouteId(null); setSelectedId(id); }} onSelectRoute={(id) => { setSelectedId(null); setSelectedRouteId(id); }} onPickLocation={(lat, lng) => { setPosition([lat, lng]); setLocationReady(true); setSelectedId(null); setSelectedRouteId(null); }} onAddRoutePoint={(lat, lng) => setRoutePoints((points) => points.length >= 200 ? points : [...points, [lat, lng]])} />
          <div className="pointer-events-none absolute inset-x-0 top-0 z-[500] p-3 sm:p-5">
            <div className="flex items-start justify-between gap-2">
              <div className="pointer-events-auto flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-white/80 bg-white/95 p-2 shadow-xl shadow-slate-900/10 backdrop-blur sm:max-w-md">
                <Crosshair className="ml-2 h-5 w-5 shrink-0 text-[#087e72]" /><span className="min-w-0 flex-1 text-xs font-semibold leading-5 text-slate-600 sm:text-sm"><strong className="text-[#087e72]">เลือกจุดเกิดเหตุ:</strong> แตะแผนที่ตรงตำแหน่งจริง</span>
                <button aria-label="ใช้ตำแหน่งของฉัน" onClick={useMyLocation} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e8f8f6] text-[#087e72]">{locating ? <Loader2 className="h-5 w-5 animate-spin" /> : <LocateFixed className="h-5 w-5" />}</button>
              </div>
              <div className="pointer-events-auto flex flex-col items-end gap-2">
                <div className="flex rounded-xl border border-white/80 bg-white/95 p-1 shadow-xl"><button aria-label="แผนที่ถนน" onClick={() => setMapStyle("street")} className={`grid h-9 w-9 place-items-center rounded-lg ${mapStyle === "street" ? "bg-[#073b4c] text-white" : "text-slate-500"}`}><MapIcon className="h-4 w-4" /></button><button aria-label="แผนที่ดาวเทียม" onClick={() => setMapStyle("satellite")} className={`grid h-9 w-9 place-items-center rounded-lg ${mapStyle === "satellite" ? "bg-[#073b4c] text-white" : "text-slate-500"}`}><Satellite className="h-4 w-4" /></button></div>
                <button aria-label={officialFloodEnabled ? "ปิดพื้นที่น้ำท่วมทั่วไทย" : "เปิดพื้นที่น้ำท่วมทั่วไทย"} onClick={() => setOfficialFloodEnabled((enabled) => !enabled)} className={`flex min-h-10 items-center gap-2 whitespace-nowrap rounded-xl border border-white/80 px-3 text-xs font-extrabold shadow-xl ${officialFloodEnabled ? "bg-[#0e7490] text-white" : "bg-white/95 text-[#0e7490]"}`}><Layers3 className="h-4 w-4" />{officialFloodEnabled ? "ปิดน้ำท่วมทั่วไทย" : "น้ำท่วมทั่วไทย"}</button>
                <button aria-label={rainEnabled ? "ปิดเรดาร์ฝน" : "เปิดเรดาร์ฝน"} onClick={() => setRainEnabled((enabled) => !enabled)} className={`flex min-h-10 items-center gap-2 whitespace-nowrap rounded-xl border border-white/80 px-3 text-xs font-extrabold shadow-xl ${rainEnabled ? "bg-[#2563eb] text-white" : "bg-white/95 text-[#1646a0]"}`}><CloudRain className="h-4 w-4" />{rainEnabled ? "ปิดเรดาร์ฝน" : "เปิดเรดาร์ฝน"}</button>
              </div>
            </div>
          </div>


          {routeTracking ? <div className="absolute inset-x-3 bottom-5 z-[550] mx-auto w-auto max-w-lg rounded-2xl border border-red-100 bg-white/95 p-3 shadow-2xl backdrop-blur"><div className="flex items-start gap-3"><span className="mt-1 h-3 w-3 shrink-0 animate-pulse rounded-full bg-red-500" /><div className="min-w-0 flex-1"><p className="text-sm font-extrabold text-red-700">กำลังบันทึกเส้นทางขณะขับขี่</p><p className="mt-0.5 text-[11px] text-slate-500">{routePoints.length} จุด · {routeDistanceKm(routePoints).toFixed(1)} กม.{trackingAccuracy !== null ? ` · GPS ±${trackingAccuracy} ม.` : " · กำลังค้นหา GPS"}</p><p className="mt-1 text-[10px] font-semibold text-amber-700">เปิดหน้านี้ไว้ และให้ผู้โดยสารเป็นผู้ควบคุมโทรศัพท์</p></div></div><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={cancelRouteCapture} className="h-11 rounded-xl border border-slate-200 bg-white text-sm font-extrabold text-slate-600">ยกเลิก</button><button type="button" onClick={finishRouteTracking} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-red-600 text-sm font-extrabold text-white"><Square className="h-4 w-4 fill-current" />หยุดและบันทึก</button></div></div> : routeDrawing ? <div className="absolute inset-x-3 bottom-5 z-[550] mx-auto w-auto max-w-lg rounded-2xl border border-cyan-100 bg-white/95 p-3 shadow-2xl backdrop-blur"><div className="flex items-center justify-between gap-2"><div><p className="text-sm font-extrabold text-cyan-800">กำลังวาดเส้นทางปลอดน้ำท่วม</p><p className="text-[11px] text-slate-500">แตะตามแนวถนน · {routePoints.length} จุด</p></div><button type="button" disabled={!routePoints.length} onClick={() => setRoutePoints((points) => points.slice(0, -1))} className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-600 disabled:opacity-40" aria-label="ย้อนกลับหนึ่งจุด"><Undo2 className="h-4 w-4" /></button></div><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={cancelRouteCapture} className="h-11 rounded-xl border border-slate-200 bg-white text-sm font-extrabold text-slate-600">ยกเลิก</button><button type="button" disabled={routePoints.length < 2} onClick={() => setRouteSaveOpen(true)} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0891b2] text-sm font-extrabold text-white disabled:opacity-40"><Save className="h-4 w-4" />บันทึกเส้นทาง</button></div></div> : locationReady && <div className="absolute inset-x-3 bottom-5 z-[550] mx-auto w-auto max-w-md rounded-2xl border border-white/80 bg-white/95 p-2 shadow-2xl backdrop-blur">
            <div className="min-w-0"><div className="hidden px-2 pb-2 sm:block"><p className="text-xs font-bold text-[#087e72]">เลือกตำแหน่งแล้ว · {position[0].toFixed(5)}, {position[1].toFixed(5)}</p></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><button onClick={() => openForm("help")} className="h-11 min-w-0 rounded-xl bg-[#eaf1ff] px-1.5 text-[11px] font-extrabold text-[#1d4ed8]">ขอความช่วยเหลือ</button><button onClick={() => openForm("flood")} className="h-11 min-w-0 rounded-xl bg-[#ff7a3d] px-1.5 text-[11px] font-extrabold text-white">แจ้งน้ำท่วม</button><button onClick={() => openForm("water_receded")} className="h-11 min-w-0 rounded-xl bg-green-100 px-1.5 text-[11px] font-extrabold text-green-800">น้ำลดแล้ว</button><button onClick={() => openForm("route_open")} className="h-11 min-w-0 rounded-xl bg-cyan-100 px-1.5 text-[11px] font-extrabold text-cyan-800">เส้นทางผ่านได้</button></div></div>
          </div>}

          {!locationReady && <div className="absolute bottom-5 left-4 z-[500] flex items-center gap-3 rounded-2xl border border-white/80 bg-white/95 px-4 py-3 shadow-xl"><Layers3 className="h-5 w-5 text-[#087e72]" /><div><p className="text-sm font-extrabold">{reports.length} รายการ</p><p className="text-[11px] text-slate-500">อันตราย {highCount} · ขอความช่วยเหลือ {helpCount}</p></div></div>}
          {!routeDrawing && !routeTracking && selectedReport && <ReportPopup report={selectedReport} canDelete={ownedIds.has(selectedReport.id)} onViewImages={(urls, index) => setImageViewer({ urls, index })} onDelete={() => setDeleteTarget(selectedReport)} onClose={() => setSelectedId(null)} />}
          {!routeDrawing && !routeTracking && selectedRoute && <SafeRoutePopup route={selectedRoute} canDelete={ownedRouteIds.has(selectedRoute.id)} onDelete={() => setRouteDeleteTarget(selectedRoute)} onClose={() => setSelectedRouteId(null)} />}
        </div>

        <aside className="flex w-full min-w-0 max-w-full min-h-[40dvh] flex-col overflow-hidden bg-white lg:h-[calc(100vh-80px)]">
          <div className="min-w-0 border-b border-slate-100 px-4 pb-4 pt-5 sm:px-5">
            <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#0a8d80]">สถานการณ์ล่าสุด</p><h2 className="mt-1 text-xl font-extrabold">รายงานจากพื้นที่</h2></div><button aria-label="โหลดข้อมูลใหม่" onClick={() => void loadReports()} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-500"><RefreshCw className="h-4 w-4" /></button></div>
            <div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={startRouteDrawing} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#0891b2] px-2 text-xs font-extrabold text-white"><Route className="h-4 w-4" />วาดเส้นทาง</button><button type="button" onClick={startRouteTracking} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-600 px-2 text-xs font-extrabold text-white"><Navigation className="h-4 w-4" />บันทึกขณะขับขี่</button><button type="button" onClick={() => setRouteListOpen(true)} className="col-span-2 flex min-h-11 items-center justify-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-2 text-xs font-extrabold text-cyan-800"><MapIcon className="h-4 w-4" />ดูเส้นทางที่บันทึก ({safeRoutes.length})</button></div>
            <div className="mt-4 flex gap-2 overflow-x-auto pb-1 scrollbar-none"><FilterButton active={filter === "all"} onClick={() => setFilter("all")}><ListFilter className="h-4 w-4" />ทั้งหมด</FilterButton><FilterButton active={filter === "flood"} onClick={() => setFilter("flood")} dot="#f97316">น้ำท่วม</FilterButton><FilterButton active={filter === "help"} onClick={() => setFilter("help")} dot="#2563eb">ขอความช่วยเหลือ</FilterButton><FilterButton active={filter === "water_receded"} onClick={() => setFilter("water_receded")} dot="#16a34a">น้ำลดแล้ว</FilterButton><FilterButton active={filter === "route_open"} onClick={() => setFilter("route_open")} dot="#0891b2">เส้นทางผ่านได้</FilterButton>{(Object.keys(severityMeta) as Severity[]).map((key) => <FilterButton key={key} active={filter === key} onClick={() => setFilter(key)} dot={severityMeta[key].color}>{severityMeta[key].label}</FilterButton>)}</div>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-4">
            {loading ? <div className="grid h-52 place-items-center text-sm text-slate-500"><span className="text-center"><Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-[#0a8d80]" />กำลังโหลดรายงาน...</span></div> : visibleReports.length === 0 ? <EmptyState onCreate={() => openForm("flood")} /> : <div className="space-y-3">{visibleReports.map((report) => <ReportCard key={report.id} report={report} active={selectedId === report.id} canDelete={ownedIds.has(report.id)} onClick={() => selectFromList(report.id)} onViewImages={(urls, index) => setImageViewer({ urls, index })} onDelete={() => setDeleteTarget(report)} />)}</div>}
          </div>
          <div className="border-t border-slate-100 bg-[#f7fbfc] p-4"><p className="flex items-start gap-2 text-xs leading-5 text-slate-500"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#0a8d80]" />ข้อมูลมาจากผู้ใช้งาน โปรดตรวจสอบประกาศทางการก่อนเดินทาง หากเป็นเหตุฉุกเฉินโทร 191 หรือ 1669</p></div>
        </aside>
      </section>

      <ReportDialog open={reportOpen} reportType={formType} onOpenChange={setReportOpen} position={position} onPositionChange={(lat, lng) => { setPosition([lat, lng]); setLocationReady(true); }} locating={locating} onUseCurrentLocation={useMyLocation} onChooseOnMap={() => { setReportOpen(false); window.requestAnimationFrame(() => mapSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })); toast.info("แตะแผนที่ตรงตำแหน่งจริง แล้วเลือกประเภทรายงานที่ต้องการ"); }} onSuccess={async (id, token) => { saveToken(id, token); await loadReports(); setReportOpen(false); }} />
      <RouteSaveDialog open={routeSaveOpen} path={routePoints} onOpenChange={setRouteSaveOpen} onSuccess={async (route, token) => { saveRouteToken(route.id, token); await loadSafeRoutes(); setRouteSaveOpen(false); setRouteDrawing(false); setRouteTracking(false); setRoutePoints([]); setSelectedRouteId(route.id); toast.success("บันทึกเส้นทางปลอดน้ำท่วมแล้ว"); }} />
      <RouteListDialog open={routeListOpen} routes={safeRoutes} onOpenChange={setRouteListOpen} onCreate={startRouteDrawing} onTrack={startRouteTracking} onSelect={(id) => { setSelectedId(null); setSelectedRouteId(id); setRouteListOpen(false); window.requestAnimationFrame(() => mapSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })); }} />
      <ImageViewer viewer={imageViewer} onChange={setImageViewer} />
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>ลบตำแหน่งนี้หรือไม่?</AlertDialogTitle><AlertDialogDescription>รายการและรูปภาพจะถูกลบถาวร เฉพาะเครื่องที่สร้างรายการเท่านั้นที่มีสิทธิ์ลบ</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={deleting}>ยกเลิก</AlertDialogCancel><AlertDialogAction disabled={deleting} onClick={(event) => { event.preventDefault(); void confirmDelete(); }} className="bg-rose-600 text-white hover:bg-rose-700">{deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}ลบรายการ</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <AlertDialog open={Boolean(routeDeleteTarget)} onOpenChange={(open) => { if (!open && !deletingRoute) setRouteDeleteTarget(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>ลบเส้นทางนี้หรือไม่?</AlertDialogTitle><AlertDialogDescription>เส้นทางจะถูกลบถาวร และลบได้เฉพาะจากเครื่องที่ใช้สร้างเส้นทางนี้เท่านั้น</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={deletingRoute}>ยกเลิก</AlertDialogCancel><AlertDialogAction disabled={deletingRoute} onClick={(event) => { event.preventDefault(); void confirmRouteDelete(); }} className="bg-rose-600 text-white hover:bg-rose-700">{deletingRoute ? <Loader2 className="animate-spin" /> : <Trash2 />}ลบเส้นทาง</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <Toaster richColors position="top-center" />
    </main>
  );
}

function FilterButton({ active, onClick, dot, children }: { active: boolean; onClick: () => void; dot?: string; children: ReactNode }) {
  return <button onClick={onClick} className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-bold transition ${active ? "border-[#073b4c] bg-[#073b4c] text-white" : "border-slate-200 bg-white text-slate-600"}`}>{dot && <span className="h-2 w-2 rounded-full" style={{ background: dot }} />}{children}</button>;
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return <div className="mx-auto flex max-w-xs flex-col items-center px-5 py-10 text-center"><div className="grid h-16 w-16 place-items-center rounded-3xl bg-[#e7f7f5] text-[#0a8d80]"><ShieldCheck className="h-8 w-8" /></div><h3 className="mt-4 text-lg font-bold">ยังไม่มีรายการในมุมมองนี้</h3><p className="mt-2 text-sm leading-6 text-slate-500">แตะแผนที่เพื่อเลือกตำแหน่ง หรือสร้างรายงานได้ทันที</p><button onClick={onCreate} className="mt-5 rounded-xl bg-[#073b4c] px-5 py-3 text-sm font-bold text-white">แจ้งเป็นคนแรก</button></div>;
}

function getReportImages(report: FloodReport) {
  return report.imageUrls?.length ? report.imageUrls : report.imageUrl ? [report.imageUrl] : [];
}

function ReportTypeIcon({ type, className = "h-7 w-7" }: { type: ReportType; className?: string }) {
  if (type === "help") return <HandHelping className={className} />;
  if (type === "water_receded") return <TrendingDown className={className} />;
  if (type === "route_open") return <Route className={className} />;
  return <Droplets className={className} />;
}

function googleMapsDirectionsUrl(report: FloodReport) {
  const destination = `${report.latitude},${report.longitude}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`;
}

function ReportCard({ report, active, canDelete, onClick, onViewImages, onDelete }: { report: FloodReport; active: boolean; canDelete: boolean; onClick: () => void; onViewImages: (urls: string[], index: number) => void; onDelete: () => void }) {
  const meta = reportBadge(report);
  const images = getReportImages(report);
  return <article className={`overflow-hidden rounded-2xl border bg-white transition ${active ? "border-[#0a8d80] ring-4 ring-[#0a8d80]/10" : "border-slate-200"}`}>
    <div className="flex gap-3 p-3.5">
      {images.length ? <button type="button" onClick={() => onViewImages(images, 0)} className="relative h-[88px] w-[96px] shrink-0 overflow-hidden rounded-xl bg-slate-100" aria-label={`เปิดดูรูปภาพ ${images.length} รูป`}><img src={images[0]} alt="ภาพสถานการณ์" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-contain" />{images.length > 1 && <span className="absolute bottom-1 right-1 rounded-full bg-slate-950/75 px-2 py-0.5 text-[10px] font-bold text-white">+{images.length - 1}</span>}</button> : <div className="grid h-[88px] w-[96px] shrink-0 place-items-center rounded-xl" style={{ color: meta.color, background: meta.soft }}><ReportTypeIcon type={report.reportType} /></div>}
      <button type="button" onClick={onClick} className="min-w-0 flex-1 text-left"><div className="flex items-center justify-between gap-2"><span className="rounded-full px-2.5 py-1 text-[11px] font-extrabold" style={{ color: meta.color, background: meta.soft }}>{meta.label}</span><span className="flex items-center gap-1 text-[11px] text-slate-400"><Clock3 className="h-3 w-3" />{timeAgo(report.createdAt)}</span></div><p className="mt-2 truncate text-sm font-extrabold">{report.areaName || "ตำแหน่งที่แจ้ง"}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{report.reportType === "help" ? report.helpNeeds || report.description : report.description}</p></button>
    </div>
    {canDelete && <button onClick={onDelete} className="mx-3 mb-3 inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600"><Trash2 className="h-3.5 w-3.5" />ลบตำแหน่งนี้</button>}
  </article>;
}

function ReportPopup({ report, canDelete, onViewImages, onDelete, onClose }: { report: FloodReport; canDelete: boolean; onViewImages: (urls: string[], index: number) => void; onDelete: () => void; onClose: () => void }) {
  const meta = reportBadge(report);
  const images = getReportImages(report);
  return <div className="absolute inset-x-3 bottom-24 z-[600] mx-auto w-auto max-w-sm overflow-hidden rounded-2xl border border-white/80 bg-white shadow-2xl sm:left-auto sm:right-5 sm:w-[min(24rem,calc(100%-2.5rem))]">
    {images.length > 0 && <div className="flex gap-1.5 overflow-x-auto bg-slate-100 p-2 scrollbar-none">{images.map((url, index) => <button type="button" key={url} onClick={() => onViewImages(images, index)} className="relative h-24 min-w-[7rem] flex-1 overflow-hidden rounded-xl bg-slate-200" aria-label={`เปิดรูปที่ ${index + 1} จาก ${images.length}`}><img src={url} alt={`ภาพสถานการณ์ ${index + 1}`} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-contain" />{index === 0 && <span className="absolute bottom-1 left-1 rounded-md bg-slate-950/70 px-1.5 py-0.5 text-[10px] font-bold text-white">แตะเพื่อดูเต็ม</span>}</button>)}</div>}
    <button onClick={onClose} aria-label="ปิดรายละเอียด" className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full bg-slate-900/75 text-white"><X className="h-4 w-4" /></button>
    <div className="max-h-[calc(60dvh-7rem)] overflow-y-auto p-4"><div className="flex min-w-0 items-center justify-between gap-2"><span className="shrink-0 rounded-full px-3 py-1 text-xs font-bold" style={{ color: meta.color, background: meta.soft }}>{meta.label}</span><span className="truncate text-xs text-slate-400">{timeAgo(report.createdAt)}</span></div><h3 className="mt-3 break-words font-extrabold">{report.areaName || "ตำแหน่งที่แจ้ง"}</h3><p className="mt-1 break-words text-sm leading-6 text-slate-600">{report.description}</p>{report.reportType === "help" ? <div className="mt-3 space-y-3 break-words rounded-xl bg-blue-50 px-3 py-3 text-sm text-blue-900"><div><p><strong>ต้องการ:</strong> {report.helpNeeds}</p><p className="mt-1"><strong>ติดต่อ:</strong> {report.contactName ? `${report.contactName} · ` : ""}<a className="font-bold underline" href={`tel:${report.contactPhone}`}>{report.contactPhone}</a></p></div><a href={googleMapsDirectionsUrl(report)} target="_blank" rel="noopener noreferrer" className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#2563eb] px-4 py-2.5 font-extrabold text-white shadow-sm"><Navigation className="h-4 w-4" />นำทางไปจุดนี้ด้วย Google Maps</a></div> : report.reportType === "flood" ? <div className="mt-3 flex min-w-0 items-center justify-between gap-2 rounded-xl bg-[#eef8f8] px-3 py-2 text-sm"><span className="min-w-0 text-slate-500">ระดับน้ำโดยประมาณ</span><strong className="shrink-0 text-[#087e72]">{report.waterDepth} ซม.</strong></div> : <a href={googleMapsDirectionsUrl(report)} target="_blank" rel="noopener noreferrer" className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-extrabold text-white shadow-sm" style={{ background: meta.color }}><Navigation className="h-4 w-4" />เปิดจุดนี้ใน Google Maps</a>}{canDelete && <button onClick={onDelete} className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-rose-600"><Trash2 className="h-4 w-4" />ลบตำแหน่งนี้</button>}</div>
  </div>;
}

function routeDistanceKm(path: [number, number][]) {
  const earthRadius = 6371;
  return path.slice(1).reduce((total, point, index) => {
    const previous = path[index];
    const lat1 = previous[0] * Math.PI / 180; const lat2 = point[0] * Math.PI / 180;
    const deltaLat = (point[0] - previous[0]) * Math.PI / 180; const deltaLng = (point[1] - previous[1]) * Math.PI / 180;
    const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
    return total + earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }, 0);
}

function googleMapsSafeRouteUrl(route: SafeRoute) {
  const origin = route.path[0]; const destination = route.path.at(-1);
  if (!origin || !destination) return "https://www.google.com/maps";
  const middle = route.path.slice(1, -1);
  const step = Math.max(1, Math.ceil(middle.length / 8));
  const waypoints = middle.filter((_, index) => index % step === 0).slice(0, 8).map((point) => `${point[0]},${point[1]}`).join("|");
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(`${origin[0]},${origin[1]}`)}&destination=${encodeURIComponent(`${destination[0]},${destination[1]}`)}${waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : ""}&travelmode=driving`;
}

function SafeRoutePopup({ route, canDelete, onDelete, onClose }: { route: SafeRoute; canDelete: boolean; onDelete: () => void; onClose: () => void }) {
  return <div className="absolute inset-x-3 bottom-24 z-[600] mx-auto w-auto max-w-sm rounded-2xl border border-green-100 bg-white p-4 shadow-2xl sm:left-auto sm:right-5 sm:w-[min(24rem,calc(100%-2.5rem))]"><button onClick={onClose} aria-label="ปิดรายละเอียดเส้นทาง" className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full bg-slate-900/75 text-white"><X className="h-4 w-4" /></button><div className="flex items-center gap-2 text-green-700"><Route className="h-5 w-5" /><span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-extrabold">เส้นทางปลอดน้ำท่วม</span></div><h3 className="mt-3 pr-10 text-lg font-extrabold">{route.name}</h3>{route.description && <p className="mt-1 text-sm leading-6 text-slate-600">{route.description}</p>}<p className="mt-2 text-xs text-slate-400">ระยะทางโดยประมาณ {routeDistanceKm(route.path).toFixed(1)} กม. · {route.path.length} จุด</p><a href={googleMapsSafeRouteUrl(route)} target="_blank" rel="noopener noreferrer" className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#16a34a] px-4 py-2.5 text-sm font-extrabold text-white"><Navigation className="h-4 w-4" />นำทางด้วย Google Maps</a>{canDelete && <button type="button" onClick={onDelete} className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-extrabold text-rose-600"><Trash2 className="h-4 w-4" />ลบเส้นทางนี้</button>}</div>;
}

function RouteSaveDialog({ open, path, onOpenChange, onSuccess }: { open: boolean; path: [number, number][]; onOpenChange: (open: boolean) => void; onSuccess: (route: SafeRoute, token: string) => Promise<void> }) {
  const [name, setName] = useState(""); const [description, setDescription] = useState(""); const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || path.length < 2) return toast.error("กรุณาระบุชื่อและวาดเส้นทางอย่างน้อย 2 จุด");
    setSaving(true);
    try {
      const response = await fetch("/api/safe-routes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), description: description.trim(), path }) });
      const data = await response.json() as { route?: SafeRoute; deleteToken?: string; error?: string };
      if (!response.ok || !data.route || !data.deleteToken) throw new Error(data.error || "บันทึกเส้นทางไม่สำเร็จ");
      setName(""); setDescription(""); await onSuccess(data.route, data.deleteToken);
    } catch (error) { toast.error(error instanceof Error ? error.message : "บันทึกเส้นทางไม่สำเร็จ"); }
    finally { setSaving(false); }
  }
  return <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next); }}><DialogContent className="w-[calc(100%-1.5rem)] max-w-md rounded-3xl p-5 sm:p-6"><DialogHeader><DialogTitle className="flex items-center gap-2"><Route className="h-5 w-5 text-[#0891b2]" />บันทึกเส้นทางปลอดน้ำท่วม</DialogTitle><DialogDescription>เส้นทางมี {path.length} จุด ระยะทางประมาณ {routeDistanceKm(path).toFixed(1)} กม.</DialogDescription></DialogHeader><form onSubmit={submit} className="mt-4 space-y-4"><div><label className="mb-2 block text-sm font-bold">ชื่อเส้นทาง *</label><input required value={name} onChange={(event) => setName(event.target.value)} maxLength={100} placeholder="เช่น ถนนเลี่ยงตลาดไปโรงพยาบาล" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-cyan-600" /></div><div><label className="mb-2 block text-sm font-bold">รายละเอียดเพิ่มเติม</label><textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} rows={3} placeholder="บอกจุดเริ่มต้น ปลายทาง หรือข้อควรระวัง" className="w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-cyan-600" /></div><button disabled={saving} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0891b2] font-extrabold text-white disabled:opacity-60">{saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}{saving ? "กำลังบันทึก..." : "ยืนยันบันทึกเส้นทาง"}</button></form></DialogContent></Dialog>;
}

function RouteListDialog({ open, routes, onOpenChange, onCreate, onTrack, onSelect }: { open: boolean; routes: SafeRoute[]; onOpenChange: (open: boolean) => void; onCreate: () => void; onTrack: () => void; onSelect: (id: string) => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="!left-auto !right-0 !top-0 flex h-[100dvh] w-full !max-w-md !translate-x-0 !translate-y-0 flex-col overflow-hidden rounded-none border-0 p-0 sm:rounded-l-3xl"><DialogHeader className="safe-panel-header bg-[#0e7490] px-5 pb-5 pt-5 text-left text-white"><DialogTitle className="text-2xl font-extrabold">เส้นทางปลอดน้ำท่วม</DialogTitle><DialogDescription className="text-white/75">กดรายการเพื่อแสดงเส้นทางบนแผนที่</DialogDescription></DialogHeader><div className="min-h-0 flex-1 overflow-y-auto p-4">{routes.length === 0 ? <div className="py-12 text-center"><Route className="mx-auto h-10 w-10 text-cyan-600" /><p className="mt-3 font-extrabold">ยังไม่มีเส้นทางที่บันทึก</p><p className="mt-1 text-sm text-slate-500">ช่วยชุมชนด้วยการเพิ่มเส้นทางที่น้ำไม่ท่วม</p></div> : <div className="space-y-3">{routes.map((route) => <button type="button" key={route.id} onClick={() => onSelect(route.id)} className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-cyan-400"><div className="flex items-start gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-green-100 text-green-700"><Route className="h-5 w-5" /></div><div className="min-w-0 flex-1"><p className="truncate font-extrabold">{route.name}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{route.description || "เส้นทางที่ผู้ใช้ยืนยันว่าไม่มีน้ำท่วม"}</p><p className="mt-2 text-[11px] font-semibold text-cyan-700">{routeDistanceKm(route.path).toFixed(1)} กม. · {timeAgo(route.createdAt)}</p></div></div></button>)}</div>}</div><div className="safe-panel-footer grid grid-cols-2 gap-2 border-t border-slate-100 bg-white p-4"><button type="button" onClick={onCreate} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#0891b2] px-2 text-xs font-extrabold text-white"><Plus className="h-5 w-5" />วาดเส้นทาง</button><button type="button" onClick={onTrack} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-red-600 px-2 text-xs font-extrabold text-white"><Navigation className="h-5 w-5" />บันทึกขณะขับขี่</button></div></DialogContent></Dialog>;
}

function ImageViewer({ viewer, onChange }: { viewer: { urls: string[]; index: number } | null; onChange: (viewer: { urls: string[]; index: number } | null) => void }) {
  if (!viewer) return null;
  const { urls, index } = viewer;
  const show = (nextIndex: number) => onChange({ urls, index: (nextIndex + urls.length) % urls.length });
  return <Dialog open onOpenChange={(open) => { if (!open) onChange(null); }}><DialogContent showCloseButton={false} className="!inset-0 flex h-[100dvh] w-screen !max-w-none !translate-x-0 !translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-black p-0 text-white">
    <div className="safe-panel-header flex items-center justify-between bg-black/95 px-4 pb-3 pt-3"><p className="text-sm font-bold">รูปที่ {index + 1} จาก {urls.length}</p><button type="button" onClick={() => onChange(null)} aria-label="ปิดรูปภาพ" className="grid h-11 w-11 place-items-center rounded-full bg-white/15"><X className="h-5 w-5" /></button></div>
    <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black"><ViewerImage key={urls[index]} src={urls[index]} alt={`ภาพสถานการณ์ขนาดเต็ม ${index + 1}`} />{urls.length > 1 && <><button type="button" onClick={() => show(index - 1)} aria-label="รูปก่อนหน้า" className="absolute left-3 grid h-11 w-11 place-items-center rounded-full bg-black/60"><ChevronLeft className="h-6 w-6" /></button><button type="button" onClick={() => show(index + 1)} aria-label="รูปถัดไป" className="absolute right-3 grid h-11 w-11 place-items-center rounded-full bg-black/60"><ChevronRight className="h-6 w-6" /></button></>}</div>
    {urls.length > 1 && <div className="safe-panel-footer flex gap-2 overflow-x-auto bg-black/95 px-4 py-3 scrollbar-none">{urls.map((url, imageIndex) => <button type="button" key={url} onClick={() => show(imageIndex)} className={`grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg border-2 bg-slate-900 ${imageIndex === index ? "border-white" : "border-transparent opacity-60"}`}><img src={url} alt={`เลือกรูปที่ ${imageIndex + 1}`} loading="lazy" decoding="async" className="h-full w-full object-contain" /></button>)}</div>}
  </DialogContent></Dialog>;
}

function ViewerImage({ src, alt }: { src: string; alt: string }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  return <>
    {status === "loading" && <div className="absolute inset-0 grid place-items-center text-center text-sm text-white/80"><span><Loader2 className="mx-auto mb-2 h-7 w-7 animate-spin" />กำลังโหลดรูปภาพ...</span></div>}
    {status === "error" && <div className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-white/80">โหลดรูปภาพไม่สำเร็จ กรุณาปิดแล้วลองเปิดใหม่</div>}
    <img src={src} alt={alt} decoding="async" onLoad={() => setStatus("loaded")} onError={() => setStatus("error")} className={`h-full w-full object-contain transition-opacity ${status === "loaded" ? "opacity-100" : "opacity-0"}`} />
  </>;
}

function ReportDialog({ open, reportType, onOpenChange, position, onPositionChange, locating, onUseCurrentLocation, onChooseOnMap, onSuccess }: { open: boolean; reportType: ReportType; onOpenChange: (open: boolean) => void; position: [number, number]; onPositionChange: (lat: number, lng: number) => void; locating: boolean; onUseCurrentLocation: () => void; onChooseOnMap: () => void; onSuccess: (id: string, token: string) => Promise<void> }) {
  const [severity, setSeverity] = useState<Severity>("medium"); const [depth, setDepth] = useState(20); const [areaName, setAreaName] = useState(""); const [description, setDescription] = useState("");
  const [contactName, setContactName] = useState(""); const [contactPhone, setContactPhone] = useState(""); const [helpNeeds, setHelpNeeds] = useState("");
  const [imageItems, setImageItems] = useState<{ file: File; url: string }[]>([]); const [submitting, setSubmitting] = useState(false);
  const previewUrlsRef = useRef<string[]>([]);
  useEffect(() => () => { previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url)); }, []);

  function clearImages() {
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrlsRef.current = [];
    setImageItems([]);
  }

  function addImages(files: FileList | null) {
    if (!files) return;
    const nextFiles = Array.from(files);
    if (imageItems.length + nextFiles.length > 6) return toast.error("เลือกรูปได้ไม่เกิน 6 รูปต่อรายการ");
    const nextItems = nextFiles.map((file) => ({ file, url: URL.createObjectURL(file) }));
    previewUrlsRef.current.push(...nextItems.map((item) => item.url));
    setImageItems((current) => [...current, ...nextItems]);
  }

  function removeImage(index: number) {
    setImageItems((current) => {
      const item = current[index];
      if (item) { URL.revokeObjectURL(item.url); previewUrlsRef.current = previewUrlsRef.current.filter((url) => url !== item.url); }
      return current.filter((_, itemIndex) => itemIndex !== index);
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!description.trim()) return toast.error("กรุณาบอกรายละเอียดสถานการณ์");
    if (reportType === "help" && (!helpNeeds.trim() || !contactPhone.trim())) return toast.error("กรุณาระบุสิ่งที่ต้องการและเบอร์โทรติดต่อ");
    setSubmitting(true);
    try {
      const body = new FormData();
      body.set("reportType", reportType); body.set("latitude", String(position[0])); body.set("longitude", String(position[1])); body.set("severity", reportType === "flood" ? severity : "low"); body.set("waterDepth", reportType === "flood" ? String(depth) : "0"); body.set("areaName", areaName.trim()); body.set("description", description.trim()); body.set("contactName", contactName.trim()); body.set("contactPhone", contactPhone.trim()); body.set("helpNeeds", helpNeeds.trim()); imageItems.forEach((item) => body.append("images", item.file));
      const response = await fetch("/api/reports", { method: "POST", body }); const data = await response.json() as { report?: FloodReport; deleteToken?: string; error?: string };
      if (!response.ok || !data.report || !data.deleteToken) throw new Error(data.error || "บันทึกรายงานไม่สำเร็จ");
      const successMessage: Record<ReportType, string> = { flood: "แจ้งจุดน้ำท่วมเรียบร้อยแล้ว", help: "ส่งคำขอความช่วยเหลือแล้ว", water_receded: "รายงานน้ำลดเรียบร้อยแล้ว", route_open: "รายงานเส้นทางผ่านได้เรียบร้อยแล้ว" };
      toast.success(successMessage[reportType], { description: "เครื่องนี้สามารถลบรายการนี้ได้ภายหลัง" });
      setDescription(""); setAreaName(""); setContactName(""); setContactPhone(""); setHelpNeeds(""); clearImages(); setDepth(20); setSeverity("medium"); await onSuccess(data.report.id, data.deleteToken);
    } catch (error) { toast.error(error instanceof Error ? error.message : "เกิดข้อผิดพลาด โปรดลองใหม่"); }
    finally { setSubmitting(false); }
  }

  const isHelp = reportType === "help";
  const isFlood = reportType === "flood";
  const formMeta: Record<ReportType, { title: string; description: string; header: string; submit: string; button: string; placeholder: string }> = {
    flood: { title: "แจ้งจุดน้ำท่วม", description: "ข้อมูลของคุณจะช่วยให้คนใกล้เคียงเดินทางปลอดภัยขึ้น", header: "bg-[#073b4c]", submit: "ยืนยันการแจ้งน้ำท่วม", button: "bg-[#ff7a3d] shadow-orange-500/20", placeholder: "เช่น รถเล็กผ่านไม่ได้ น้ำกำลังเพิ่มสูงขึ้น" },
    help: { title: "ขอความช่วยเหลือ", description: "ระบุสิ่งที่ต้องการและช่องทางติดต่อให้ชัดเจน", header: "bg-[#1646a0]", submit: "ยืนยันขอความช่วยเหลือ", button: "bg-[#2563eb] shadow-blue-500/20", placeholder: "จำนวนคน สภาพพื้นที่ หรือข้อจำกัดที่ควรทราบ" },
    water_receded: { title: "รายงานน้ำลดแล้ว", description: "แจ้งพื้นที่ที่ระดับน้ำลดลง เพื่ออัปเดตสถานการณ์ให้ชุมชน", header: "bg-[#15803d]", submit: "ยืนยันรายงานน้ำลด", button: "bg-[#16a34a] shadow-green-500/20", placeholder: "เช่น น้ำลดจนเห็นผิวถนนแล้ว รถเล็กเริ่มผ่านได้" },
    route_open: { title: "แจ้งเส้นทางผ่านได้", description: "ระบุเส้นทางและประเภทพาหนะที่สามารถสัญจรได้", header: "bg-[#0e7490]", submit: "ยืนยันว่าเส้นทางผ่านได้", button: "bg-[#0891b2] shadow-cyan-500/20", placeholder: "เช่น รถทุกชนิดผ่านได้แล้ว หรือผ่านได้เฉพาะรถยกสูง" },
  };
  const currentForm = formMeta[reportType];
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent showCloseButton={false} className="!left-auto !right-0 !top-0 h-[100dvh] w-full !max-w-lg !translate-x-0 !translate-y-0 overflow-hidden rounded-none border-0 p-0 sm:rounded-l-3xl"><DialogHeader className={`safe-panel-header ${currentForm.header} relative px-5 pb-5 pt-5 text-left text-white sm:px-7`}><button type="button" onClick={() => onOpenChange(false)} className="safe-panel-close absolute grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white" aria-label="ปิดหน้าต่าง"><X className="h-5 w-5" /></button><div className="mb-2 grid h-11 w-11 place-items-center rounded-2xl bg-white/15">{isHelp ? <HandHelping className="h-6 w-6" /> : reportType === "water_receded" ? <TrendingDown className="h-6 w-6" /> : reportType === "route_open" ? <Route className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6" />}</div><DialogTitle className="pr-14 text-2xl font-extrabold">{currentForm.title}</DialogTitle><DialogDescription className="pr-8 text-white/75">{currentForm.description}</DialogDescription></DialogHeader><form onSubmit={submit} className="min-h-0 flex-1 space-y-5 overflow-x-hidden overflow-y-auto p-5 pb-28 sm:p-7 sm:pb-28">
    <div><label className="mb-2 block text-sm font-bold">ตำแหน่งบนแผนที่</label><div className="rounded-2xl border border-slate-200 bg-[#f6fafb] p-3"><div className="flex items-start gap-2 text-xs font-bold leading-5 text-[#087e72]"><Crosshair className="mt-0.5 h-4 w-4 shrink-0" /><span>{isHelp ? "ใช้ตำแหน่งปัจจุบัน หรือเลือกจุดเกิดเหตุจริงบนแผนที่" : "แก้พิกัดได้ หรือปิดหน้าต่างแล้วแตะแผนที่ใหม่"}</span></div>{isHelp && <div className="mt-3 grid gap-2 sm:grid-cols-2"><button type="button" disabled={locating} onClick={onUseCurrentLocation} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#2563eb] px-3 text-sm font-extrabold text-white shadow-sm disabled:opacity-60">{locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}{locating ? "กำลังหาตำแหน่ง..." : "ใช้ตำแหน่งปัจจุบัน"}</button><button type="button" onClick={onChooseOnMap} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-3 text-sm font-extrabold text-[#1d4ed8]"><MapIcon className="h-4 w-4" />เลือกจุดจริงบนแผนที่</button></div>}<div className="mt-3 grid grid-cols-2 gap-2"><input aria-label="ละติจูด" type="number" step="any" value={position[0]} onChange={(e) => onPositionChange(Number(e.target.value), position[1])} className="w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#0a8d80]" /><input aria-label="ลองจิจูด" type="number" step="any" value={position[1]} onChange={(e) => onPositionChange(position[0], Number(e.target.value))} className="w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#0a8d80]" /></div></div></div>
    <div><label className="mb-2 block text-sm font-bold">ชื่อพื้นที่ <span className="font-normal text-slate-400">(ไม่บังคับ)</span></label><input value={areaName} onChange={(e) => setAreaName(e.target.value)} maxLength={100} placeholder="เช่น หน้าโรงเรียน ถนนศรีโสธร" className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#0a8d80]" /></div>
    {isFlood && <><div><label className="mb-2 block text-sm font-bold">ความรุนแรง</label><div className="grid grid-cols-3 gap-2">{(Object.keys(severityMeta) as Severity[]).map((key) => { const meta = severityMeta[key]; return <button type="button" key={key} onClick={() => setSeverity(key)} className={`rounded-2xl border px-1 py-3 text-center text-[11px] font-bold sm:text-xs ${severity === key ? `border-transparent ring-4 ${meta.ring}` : "border-slate-200"}`} style={severity === key ? { color: meta.color, background: meta.soft } : undefined}><span className="mx-auto mb-2 block h-3 w-3 rounded-full" style={{ background: meta.color }} />{meta.label}</button>; })}</div></div><div><div className="mb-2 flex items-center justify-between"><label className="text-sm font-bold">ระดับน้ำโดยประมาณ</label><strong className="rounded-lg bg-[#e7f7f5] px-2 py-1 text-sm text-[#087e72]">{depth} ซม.</strong></div><input aria-label="ระดับน้ำ" type="range" min="0" max="200" step="5" value={depth} onChange={(e) => setDepth(Number(e.target.value))} className="w-full accent-[#0a8d80]" /></div></>}
    {isHelp && <div className="space-y-4 rounded-2xl bg-blue-50 p-4"><div><label className="mb-2 block text-sm font-bold text-blue-950">ต้องการความช่วยเหลือเรื่องใด</label><input required value={helpNeeds} onChange={(e) => setHelpNeeds(e.target.value)} maxLength={200} placeholder="เช่น อาหาร น้ำดื่ม เรือรับส่ง ยารักษาโรค" className="w-full rounded-xl border border-blue-100 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500" /></div><div className="grid gap-3 sm:grid-cols-2"><div><label className="mb-2 block text-sm font-bold text-blue-950">ชื่อผู้ติดต่อ</label><input value={contactName} onChange={(e) => setContactName(e.target.value)} maxLength={100} placeholder="ชื่อหรือนามแฝง" className="w-full rounded-xl border border-blue-100 bg-white px-4 py-3 text-sm outline-none" /></div><div><label className="mb-2 block text-sm font-bold text-blue-950">เบอร์โทรติดต่อ *</label><input required type="tel" inputMode="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} maxLength={30} placeholder="08x-xxx-xxxx" className="w-full rounded-xl border border-blue-100 bg-white px-4 py-3 text-sm outline-none" /></div></div><p className="text-xs leading-5 text-blue-700">ข้อมูลติดต่อจะแสดงต่อสาธารณะ เพื่อให้ผู้ช่วยเหลือติดต่อกลับได้</p></div>}
    <div><label className="mb-2 block text-sm font-bold">รายละเอียดสถานการณ์</label><textarea required value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={3} placeholder={currentForm.placeholder} className="w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#0a8d80]" /></div>
    <div><div className="mb-2 flex items-center justify-between gap-2"><label className="text-sm font-bold">รูปภาพประกอบ <span className="font-normal text-slate-400">(ไม่บังคับ)</span></label><span className="text-xs font-bold text-[#087e72]">{imageItems.length}/6 รูป</span></div>{imageItems.length > 0 && <div className="mb-3 grid grid-cols-3 gap-2">{imageItems.map((item, index) => <div key={item.url} className="relative grid aspect-square place-items-center overflow-hidden rounded-xl bg-slate-100"><img src={item.url} alt={`ภาพที่เลือก ${index + 1}`} decoding="async" className="h-full w-full object-contain" /><button type="button" onClick={() => removeImage(index)} aria-label={`ลบรูปที่ ${index + 1}`} className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-slate-950/75 text-white"><X className="h-3.5 w-3.5" /></button></div>)}</div>}<label className="relative flex min-h-28 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50"><div className="py-5 text-center text-slate-500"><ImagePlus className="mx-auto mb-2 h-7 w-7 text-[#0a8d80]" /><span className="text-sm font-bold">{imageItems.length ? "เพิ่มรูปจากอัลบั้ม" : "เลือกรูปจากอัลบั้มมือถือ"}</span><p className="mt-1 text-xs">เลือกได้หลายรูป สูงสุด 6 รูป · รูปละไม่เกิน 5 MB</p></div><input aria-label="เลือกรูปจากอัลบั้มมือถือหลายรูป" type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => { addImages(e.target.files); e.target.value = ""; }} /></label></div>
    <div className="safe-panel-footer fixed bottom-0 right-0 z-10 w-full max-w-lg border-t border-slate-200 bg-white/95 p-4 backdrop-blur sm:rounded-bl-3xl"><button disabled={submitting} className={`flex h-12 w-full items-center justify-center gap-2 rounded-2xl font-extrabold text-white shadow-lg disabled:opacity-60 ${currentForm.button}`}>{submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}{submitting ? "กำลังส่งข้อมูล..." : currentForm.submit}</button></div>
  </form></DialogContent></Dialog>;
}
