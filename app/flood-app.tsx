"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Crosshair, Droplets, HandHelping, ImagePlus, Layers3, ListFilter, Loader2, LocateFixed, Map as MapIcon, Plus, RefreshCw, Satellite, ShieldCheck, Trash2, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { FloodMap, type MapStyle } from "./flood-map";

export type Severity = "low" | "medium" | "high";
export type ReportType = "flood" | "help";
export type FloodReport = {
  id: string; latitude: number; longitude: number; severity: Severity; waterDepth: number;
  description: string; areaName: string; imageUrl: string | null; createdAt: number;
  reportType: ReportType; contactName: string; contactPhone: string; helpNeeds: string;
};

const TOKEN_KEY = "flood-watch-delete-tokens";
const severityMeta: Record<Severity, { label: string; color: string; soft: string; ring: string }> = {
  low: { label: "เฝ้าระวัง", color: "#ca8a04", soft: "#fef9c3", ring: "ring-yellow-500/20" },
  medium: { label: "ควรหลีกเลี่ยง", color: "#ea580c", soft: "#ffedd5", ring: "ring-orange-500/20" },
  high: { label: "อันตราย", color: "#e11d48", soft: "#ffe4e6", ring: "ring-rose-600/20" },
};

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

function removeToken(id: string) {
  const tokens = readTokens(); delete tokens[id]; localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
}

export function FloodApp() {
  const [reports, setReports] = useState<FloodReport[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);
  const [formType, setFormType] = useState<ReportType>("flood");
  const [filter, setFilter] = useState<Severity | ReportType | "all">("all");
  const [position, setPosition] = useState<[number, number]>([13.6904, 101.0779]);
  const [locating, setLocating] = useState(false);
  const [locationReady, setLocationReady] = useState(false);
  const [mapStyle, setMapStyle] = useState<MapStyle>("street");
  const [ownedIds, setOwnedIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<FloodReport | null>(null);
  const [deleting, setDeleting] = useState(false);
  const mapSectionRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const timer = window.setTimeout(() => void loadReports(), 0);
    return () => window.clearTimeout(timer);
  }, [loadReports]);

  const openForm = useCallback((type: ReportType) => { setFormType(type); setReportOpen(true); }, []);

  useEffect(() => {
    type ToolContext = { registerTool?: (tool: unknown, options: { signal: AbortSignal }) => void | Promise<void> };
    const context = (document as Document & { modelContext?: ToolContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(context.registerTool({
        name: "start_flood_report", title: "เริ่มแจ้งเหตุบนแผนที่", description: "เปิดแบบฟอร์มแจ้งน้ำท่วมหรือขอความช่วยเหลือด้วยพิกัดที่ระบุ",
        inputSchema: { type: "object", properties: { latitude: { type: "number" }, longitude: { type: "number" }, reportType: { type: "string", enum: ["flood", "help"] } }, required: ["latitude", "longitude"], additionalProperties: false },
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
    if (filter === "flood" || filter === "help") return report.reportType === filter;
    return report.reportType === "flood" && report.severity === filter;
  }), [filter, reports]);
  const selectedReport = reports.find((report) => report.id === selectedId) ?? null;
  const highCount = reports.filter((report) => report.reportType === "flood" && report.severity === "high").length;
  const helpCount = reports.filter((report) => report.reportType === "help").length;

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

  return (
    <main className="app-shell min-h-screen w-full min-w-0 max-w-[100vw] overflow-x-clip bg-[#eef6f8] text-[#102a33]">
      <header className="safe-app-header relative z-[1000] w-full min-w-0 border-b border-white/60 bg-[#073b4c] px-3 py-3 text-white shadow-lg shadow-[#073b4c]/10 sm:px-5 lg:flex lg:h-20 lg:items-center lg:justify-between lg:px-8 lg:py-0">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#13b8a6] shadow-inner shadow-white/25"><Droplets className="h-6 w-6" strokeWidth={2.4} /></div>
          <div className="min-w-0"><h1 className="text-base font-extrabold leading-tight tracking-tight sm:text-xl">น้ำท่วมไหน</h1><p className="truncate text-xs font-bold text-[#67ead4] sm:text-sm">#ฉะเชิงเทราเราช่วยกัน</p></div>
        </div>
        <div className="mt-3 grid min-w-0 grid-cols-2 gap-2 lg:mt-0">
          <button onClick={() => openForm("help")} className="inline-flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl bg-[#2563eb] px-2 text-xs font-extrabold shadow-lg shadow-blue-950/20 transition hover:bg-[#1d4ed8] sm:gap-2 sm:px-3 sm:text-sm"><HandHelping className="h-5 w-5 shrink-0" /><span className="text-center leading-tight">ขอความช่วยเหลือ</span></button>
          <button onClick={() => openForm("flood")} className="inline-flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl bg-[#ff7a3d] px-2 text-xs font-extrabold shadow-lg shadow-orange-950/20 transition hover:bg-[#ff8b55] sm:gap-2 sm:px-3 sm:text-sm"><Plus className="h-5 w-5 shrink-0" /><span className="text-center leading-tight">แจ้งจุดน้ำท่วม</span></button>
        </div>
      </header>

      <section className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)] min-h-[calc(100vh-80px)] lg:grid-cols-[minmax(0,1fr)_400px]">
        <div ref={mapSectionRef} className="relative w-full min-w-0 max-w-full min-h-[60dvh] scroll-mt-0 overflow-hidden border-b border-slate-200 lg:min-h-0 lg:border-b-0 lg:border-r">
          <FloodMap reports={visibleReports} position={position} locationReady={locationReady} selectedId={selectedId} mapStyle={mapStyle} onSelect={setSelectedId} onPickLocation={(lat, lng) => { setPosition([lat, lng]); setLocationReady(true); setSelectedId(null); }} />
          <div className="pointer-events-none absolute inset-x-0 top-0 z-[500] p-3 sm:p-5">
            <div className="flex items-start justify-between gap-2">
              <div className="pointer-events-auto flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-white/80 bg-white/95 p-2 shadow-xl shadow-slate-900/10 backdrop-blur sm:max-w-md">
                <Crosshair className="ml-2 h-5 w-5 shrink-0 text-[#087e72]" /><span className="min-w-0 flex-1 text-xs font-semibold text-slate-600 sm:text-sm">แตะแผนที่ตรงไหนก็ได้เพื่อเลือกจุด</span>
                <button aria-label="ใช้ตำแหน่งของฉัน" onClick={useMyLocation} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e8f8f6] text-[#087e72]">{locating ? <Loader2 className="h-5 w-5 animate-spin" /> : <LocateFixed className="h-5 w-5" />}</button>
              </div>
              <div className="pointer-events-auto flex rounded-xl border border-white/80 bg-white/95 p-1 shadow-xl">
                <button aria-label="แผนที่ถนน" onClick={() => setMapStyle("street")} className={`grid h-9 w-9 place-items-center rounded-lg ${mapStyle === "street" ? "bg-[#073b4c] text-white" : "text-slate-500"}`}><MapIcon className="h-4 w-4" /></button>
                <button aria-label="แผนที่ดาวเทียม" onClick={() => setMapStyle("satellite")} className={`grid h-9 w-9 place-items-center rounded-lg ${mapStyle === "satellite" ? "bg-[#073b4c] text-white" : "text-slate-500"}`}><Satellite className="h-4 w-4" /></button>
              </div>
            </div>
          </div>

          {locationReady && <div className="absolute inset-x-3 bottom-5 z-[550] mx-auto w-auto max-w-md rounded-2xl border border-white/80 bg-white/95 p-2 shadow-2xl backdrop-blur">
            <div className="grid min-w-0 grid-cols-2 gap-2 sm:flex sm:items-center"><div className="hidden min-w-0 flex-1 px-2 sm:block"><p className="text-xs font-bold text-[#087e72]">เลือกตำแหน่งแล้ว</p><p className="truncate text-[11px] text-slate-500">{position[0].toFixed(5)}, {position[1].toFixed(5)}</p></div><button onClick={() => openForm("help")} className="h-11 min-w-0 rounded-xl bg-[#eaf1ff] px-1.5 text-[11px] font-extrabold text-[#1d4ed8] sm:flex-1 sm:px-2 sm:text-sm">ขอความช่วยเหลือที่นี่</button><button onClick={() => openForm("flood")} className="h-11 min-w-0 rounded-xl bg-[#ff7a3d] px-1.5 text-[11px] font-extrabold text-white sm:flex-1 sm:px-2 sm:text-sm">แจ้งน้ำท่วมที่นี่</button></div>
          </div>}

          {!locationReady && <div className="absolute bottom-5 left-4 z-[500] flex items-center gap-3 rounded-2xl border border-white/80 bg-white/95 px-4 py-3 shadow-xl"><Layers3 className="h-5 w-5 text-[#087e72]" /><div><p className="text-sm font-extrabold">{reports.length} รายการ</p><p className="text-[11px] text-slate-500">อันตราย {highCount} · ขอความช่วยเหลือ {helpCount}</p></div></div>}
          {selectedReport && <ReportPopup report={selectedReport} canDelete={ownedIds.has(selectedReport.id)} onDelete={() => setDeleteTarget(selectedReport)} onClose={() => setSelectedId(null)} />}
        </div>

        <aside className="flex w-full min-w-0 max-w-full min-h-[40dvh] flex-col overflow-hidden bg-white lg:h-[calc(100vh-80px)]">
          <div className="min-w-0 border-b border-slate-100 px-4 pb-4 pt-5 sm:px-5">
            <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#0a8d80]">สถานการณ์ล่าสุด</p><h2 className="mt-1 text-xl font-extrabold">รายงานจากพื้นที่</h2></div><button aria-label="โหลดข้อมูลใหม่" onClick={() => void loadReports()} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-500"><RefreshCw className="h-4 w-4" /></button></div>
            <div className="mt-4 flex gap-2 overflow-x-auto pb-1 scrollbar-none"><FilterButton active={filter === "all"} onClick={() => setFilter("all")}><ListFilter className="h-4 w-4" />ทั้งหมด</FilterButton><FilterButton active={filter === "flood"} onClick={() => setFilter("flood")} dot="#f97316">น้ำท่วม</FilterButton><FilterButton active={filter === "help"} onClick={() => setFilter("help")} dot="#2563eb">ขอความช่วยเหลือ</FilterButton>{(Object.keys(severityMeta) as Severity[]).map((key) => <FilterButton key={key} active={filter === key} onClick={() => setFilter(key)} dot={severityMeta[key].color}>{severityMeta[key].label}</FilterButton>)}</div>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-4">
            {loading ? <div className="grid h-52 place-items-center text-sm text-slate-500"><span className="text-center"><Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-[#0a8d80]" />กำลังโหลดรายงาน...</span></div> : visibleReports.length === 0 ? <EmptyState onCreate={() => openForm("flood")} /> : <div className="space-y-3">{visibleReports.map((report) => <ReportCard key={report.id} report={report} active={selectedId === report.id} canDelete={ownedIds.has(report.id)} onClick={() => selectFromList(report.id)} onDelete={() => setDeleteTarget(report)} />)}</div>}
          </div>
          <div className="border-t border-slate-100 bg-[#f7fbfc] p-4"><p className="flex items-start gap-2 text-xs leading-5 text-slate-500"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#0a8d80]" />ข้อมูลมาจากผู้ใช้งาน โปรดตรวจสอบประกาศทางการก่อนเดินทาง หากเป็นเหตุฉุกเฉินโทร 191 หรือ 1669</p></div>
        </aside>
      </section>

      <ReportDialog open={reportOpen} reportType={formType} onOpenChange={setReportOpen} position={position} onPositionChange={(lat, lng) => { setPosition([lat, lng]); setLocationReady(true); }} onSuccess={async (id, token) => { saveToken(id, token); await loadReports(); setReportOpen(false); }} />
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>ลบตำแหน่งนี้หรือไม่?</AlertDialogTitle><AlertDialogDescription>รายการและรูปภาพจะถูกลบถาวร เฉพาะเครื่องที่สร้างรายการเท่านั้นที่มีสิทธิ์ลบ</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={deleting}>ยกเลิก</AlertDialogCancel><AlertDialogAction disabled={deleting} onClick={(event) => { event.preventDefault(); void confirmDelete(); }} className="bg-rose-600 text-white hover:bg-rose-700">{deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}ลบรายการ</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
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

function ReportCard({ report, active, canDelete, onClick, onDelete }: { report: FloodReport; active: boolean; canDelete: boolean; onClick: () => void; onDelete: () => void }) {
  const meta = severityMeta[report.severity];
  return <article className={`overflow-hidden rounded-2xl border bg-white transition ${active ? "border-[#0a8d80] ring-4 ring-[#0a8d80]/10" : "border-slate-200"}`}><button onClick={onClick} className="w-full text-left"><div className="flex gap-3 p-3.5">{report.imageUrl ? <img src={report.imageUrl} alt="ภาพสถานการณ์" className="h-[88px] w-[96px] shrink-0 rounded-xl object-cover" /> : <div className={`grid h-[88px] w-[96px] shrink-0 place-items-center rounded-xl ${report.reportType === "help" ? "bg-blue-50 text-blue-600" : "bg-[#e9f5f7] text-[#0a8d80]"}`}>{report.reportType === "help" ? <HandHelping className="h-7 w-7" /> : <Droplets className="h-7 w-7" />}</div>}<div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><span className="rounded-full px-2.5 py-1 text-[11px] font-extrabold" style={report.reportType === "help" ? { color: "#1d4ed8", background: "#dbeafe" } : { color: meta.color, background: meta.soft }}>{report.reportType === "help" ? "ขอความช่วยเหลือ" : meta.label}</span><span className="flex items-center gap-1 text-[11px] text-slate-400"><Clock3 className="h-3 w-3" />{timeAgo(report.createdAt)}</span></div><p className="mt-2 truncate text-sm font-extrabold">{report.areaName || "ตำแหน่งที่แจ้ง"}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{report.reportType === "help" ? report.helpNeeds || report.description : report.description}</p></div></div></button>{canDelete && <button onClick={onDelete} className="mx-3 mb-3 inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600"><Trash2 className="h-3.5 w-3.5" />ลบตำแหน่งนี้</button>}</article>;
}

function ReportPopup({ report, canDelete, onDelete, onClose }: { report: FloodReport; canDelete: boolean; onDelete: () => void; onClose: () => void }) {
  const meta = severityMeta[report.severity];
  return <div className="absolute inset-x-3 bottom-24 z-[600] mx-auto w-auto max-w-sm overflow-hidden rounded-2xl border border-white/80 bg-white shadow-2xl sm:left-auto sm:right-5 sm:w-[min(24rem,calc(100%-2.5rem))]">{report.imageUrl && <img src={report.imageUrl} alt="ภาพสถานการณ์" className="h-32 w-full object-cover" />}<button onClick={onClose} aria-label="ปิดรายละเอียด" className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full bg-slate-900/75 text-white"><X className="h-4 w-4" /></button><div className="max-h-[calc(60dvh-7rem)] overflow-y-auto p-4"><div className="flex min-w-0 items-center justify-between gap-2"><span className="shrink-0 rounded-full px-3 py-1 text-xs font-bold" style={report.reportType === "help" ? { color: "#1d4ed8", background: "#dbeafe" } : { color: meta.color, background: meta.soft }}>{report.reportType === "help" ? "ขอความช่วยเหลือ" : meta.label}</span><span className="truncate text-xs text-slate-400">{timeAgo(report.createdAt)}</span></div><h3 className="mt-3 break-words font-extrabold">{report.areaName || "ตำแหน่งที่แจ้ง"}</h3><p className="mt-1 break-words text-sm leading-6 text-slate-600">{report.description}</p>{report.reportType === "help" ? <div className="mt-3 break-words rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-900"><p><strong>ต้องการ:</strong> {report.helpNeeds}</p><p className="mt-1"><strong>ติดต่อ:</strong> {report.contactName ? `${report.contactName} · ` : ""}<a className="font-bold underline" href={`tel:${report.contactPhone}`}>{report.contactPhone}</a></p></div> : <div className="mt-3 flex min-w-0 items-center justify-between gap-2 rounded-xl bg-[#eef8f8] px-3 py-2 text-sm"><span className="min-w-0 text-slate-500">ระดับน้ำโดยประมาณ</span><strong className="shrink-0 text-[#087e72]">{report.waterDepth} ซม.</strong></div>}{canDelete && <button onClick={onDelete} className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-rose-600"><Trash2 className="h-4 w-4" />ลบตำแหน่งนี้</button>}</div></div>;
}

function ReportDialog({ open, reportType, onOpenChange, position, onPositionChange, onSuccess }: { open: boolean; reportType: ReportType; onOpenChange: (open: boolean) => void; position: [number, number]; onPositionChange: (lat: number, lng: number) => void; onSuccess: (id: string, token: string) => Promise<void> }) {
  const [severity, setSeverity] = useState<Severity>("medium"); const [depth, setDepth] = useState(20); const [areaName, setAreaName] = useState(""); const [description, setDescription] = useState("");
  const [contactName, setContactName] = useState(""); const [contactPhone, setContactPhone] = useState(""); const [helpNeeds, setHelpNeeds] = useState("");
  const [image, setImage] = useState<File | null>(null); const [preview, setPreview] = useState<string | null>(null); const [submitting, setSubmitting] = useState(false);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!description.trim()) return toast.error("กรุณาบอกรายละเอียดสถานการณ์");
    if (reportType === "help" && (!helpNeeds.trim() || !contactPhone.trim())) return toast.error("กรุณาระบุสิ่งที่ต้องการและเบอร์โทรติดต่อ");
    setSubmitting(true);
    try {
      const body = new FormData();
      body.set("reportType", reportType); body.set("latitude", String(position[0])); body.set("longitude", String(position[1])); body.set("severity", severity); body.set("waterDepth", String(depth)); body.set("areaName", areaName.trim()); body.set("description", description.trim()); body.set("contactName", contactName.trim()); body.set("contactPhone", contactPhone.trim()); body.set("helpNeeds", helpNeeds.trim()); if (image) body.set("image", image);
      const response = await fetch("/api/reports", { method: "POST", body }); const data = await response.json() as { report?: FloodReport; deleteToken?: string; error?: string };
      if (!response.ok || !data.report || !data.deleteToken) throw new Error(data.error || "บันทึกรายงานไม่สำเร็จ");
      toast.success(reportType === "help" ? "ส่งคำขอความช่วยเหลือแล้ว" : "แจ้งจุดน้ำท่วมเรียบร้อยแล้ว", { description: "เครื่องนี้สามารถลบรายการนี้ได้ภายหลัง" });
      setDescription(""); setAreaName(""); setContactName(""); setContactPhone(""); setHelpNeeds(""); setImage(null); setPreview(null); setDepth(20); setSeverity("medium"); await onSuccess(data.report.id, data.deleteToken);
    } catch (error) { toast.error(error instanceof Error ? error.message : "เกิดข้อผิดพลาด โปรดลองใหม่"); }
    finally { setSubmitting(false); }
  }

  const isHelp = reportType === "help";
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent showCloseButton={false} className="!left-auto !right-0 !top-0 h-[100dvh] w-full !max-w-lg !translate-x-0 !translate-y-0 overflow-hidden rounded-none border-0 p-0 sm:rounded-l-3xl"><DialogHeader className={`safe-panel-header ${isHelp ? "bg-[#1646a0]" : "bg-[#073b4c]"} relative px-5 pb-5 pt-5 text-left text-white sm:px-7`}><button type="button" onClick={() => onOpenChange(false)} className="safe-panel-close absolute grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white" aria-label="ปิดหน้าต่าง"><X className="h-5 w-5" /></button><div className="mb-2 grid h-11 w-11 place-items-center rounded-2xl bg-white/15">{isHelp ? <HandHelping className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6" />}</div><DialogTitle className="pr-14 text-2xl font-extrabold">{isHelp ? "ขอความช่วยเหลือ" : "แจ้งจุดน้ำท่วม"}</DialogTitle><DialogDescription className="pr-8 text-white/75">{isHelp ? "ระบุสิ่งที่ต้องการและช่องทางติดต่อให้ชัดเจน" : "ข้อมูลของคุณจะช่วยให้คนใกล้เคียงเดินทางปลอดภัยขึ้น"}</DialogDescription></DialogHeader><form onSubmit={submit} className="min-h-0 flex-1 space-y-5 overflow-x-hidden overflow-y-auto p-5 pb-28 sm:p-7 sm:pb-28">
    <div><label className="mb-2 block text-sm font-bold">ตำแหน่งบนแผนที่</label><div className="rounded-2xl border border-slate-200 bg-[#f6fafb] p-3"><div className="flex items-center gap-2 text-xs font-bold text-[#087e72]"><Crosshair className="h-4 w-4" />แก้พิกัดได้ หรือปิดหน้าต่างแล้วแตะแผนที่ใหม่</div><div className="mt-2 grid grid-cols-2 gap-2"><input aria-label="ละติจูด" type="number" step="any" value={position[0]} onChange={(e) => onPositionChange(Number(e.target.value), position[1])} className="w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#0a8d80]" /><input aria-label="ลองจิจูด" type="number" step="any" value={position[1]} onChange={(e) => onPositionChange(position[0], Number(e.target.value))} className="w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#0a8d80]" /></div></div></div>
    <div><label className="mb-2 block text-sm font-bold">ชื่อพื้นที่ <span className="font-normal text-slate-400">(ไม่บังคับ)</span></label><input value={areaName} onChange={(e) => setAreaName(e.target.value)} maxLength={100} placeholder="เช่น หน้าโรงเรียน ถนนศรีโสธร" className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#0a8d80]" /></div>
    {!isHelp && <><div><label className="mb-2 block text-sm font-bold">ความรุนแรง</label><div className="grid grid-cols-3 gap-2">{(Object.keys(severityMeta) as Severity[]).map((key) => { const meta = severityMeta[key]; return <button type="button" key={key} onClick={() => setSeverity(key)} className={`rounded-2xl border px-1 py-3 text-center text-[11px] font-bold sm:text-xs ${severity === key ? `border-transparent ring-4 ${meta.ring}` : "border-slate-200"}`} style={severity === key ? { color: meta.color, background: meta.soft } : undefined}><span className="mx-auto mb-2 block h-3 w-3 rounded-full" style={{ background: meta.color }} />{meta.label}</button>; })}</div></div><div><div className="mb-2 flex items-center justify-between"><label className="text-sm font-bold">ระดับน้ำโดยประมาณ</label><strong className="rounded-lg bg-[#e7f7f5] px-2 py-1 text-sm text-[#087e72]">{depth} ซม.</strong></div><input aria-label="ระดับน้ำ" type="range" min="0" max="200" step="5" value={depth} onChange={(e) => setDepth(Number(e.target.value))} className="w-full accent-[#0a8d80]" /></div></>}
    {isHelp && <div className="space-y-4 rounded-2xl bg-blue-50 p-4"><div><label className="mb-2 block text-sm font-bold text-blue-950">ต้องการความช่วยเหลือเรื่องใด</label><input required value={helpNeeds} onChange={(e) => setHelpNeeds(e.target.value)} maxLength={200} placeholder="เช่น อาหาร น้ำดื่ม เรือรับส่ง ยารักษาโรค" className="w-full rounded-xl border border-blue-100 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500" /></div><div className="grid gap-3 sm:grid-cols-2"><div><label className="mb-2 block text-sm font-bold text-blue-950">ชื่อผู้ติดต่อ</label><input value={contactName} onChange={(e) => setContactName(e.target.value)} maxLength={100} placeholder="ชื่อหรือนามแฝง" className="w-full rounded-xl border border-blue-100 bg-white px-4 py-3 text-sm outline-none" /></div><div><label className="mb-2 block text-sm font-bold text-blue-950">เบอร์โทรติดต่อ *</label><input required type="tel" inputMode="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} maxLength={30} placeholder="08x-xxx-xxxx" className="w-full rounded-xl border border-blue-100 bg-white px-4 py-3 text-sm outline-none" /></div></div><p className="text-xs leading-5 text-blue-700">ข้อมูลติดต่อจะแสดงต่อสาธารณะ เพื่อให้ผู้ช่วยเหลือติดต่อกลับได้</p></div>}
    <div><label className="mb-2 block text-sm font-bold">รายละเอียดสถานการณ์</label><textarea required value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={3} placeholder={isHelp ? "จำนวนคน สภาพพื้นที่ หรือข้อจำกัดที่ควรทราบ" : "เช่น รถเล็กผ่านไม่ได้ น้ำกำลังเพิ่มสูงขึ้น"} className="w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#0a8d80]" /></div>
    <div><label className="mb-2 block text-sm font-bold">รูปภาพประกอบ <span className="font-normal text-slate-400">(ไม่บังคับ)</span></label><label className="relative flex min-h-28 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50">{preview ? <img src={preview} alt="ภาพที่เลือก" className="h-44 w-full object-cover" /> : <div className="py-5 text-center text-slate-500"><ImagePlus className="mx-auto mb-2 h-7 w-7 text-[#0a8d80]" /><span className="text-sm font-bold">เลือกรูปจากอัลบั้มมือถือ</span><p className="mt-1 text-xs">หรือถ่ายรูปใหม่ · JPG, PNG, WebP ไม่เกิน 5 MB</p></div>}<input aria-label="เลือกรูปจากอัลบั้มมือถือ" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { const file = e.target.files?.[0] ?? null; if (preview) URL.revokeObjectURL(preview); setImage(file); setPreview(file ? URL.createObjectURL(file) : null); }} /></label></div>
    <div className="safe-panel-footer fixed bottom-0 right-0 z-10 w-full max-w-lg border-t border-slate-200 bg-white/95 p-4 backdrop-blur sm:rounded-bl-3xl"><button disabled={submitting} className={`flex h-12 w-full items-center justify-center gap-2 rounded-2xl font-extrabold text-white shadow-lg disabled:opacity-60 ${isHelp ? "bg-[#2563eb] shadow-blue-500/20" : "bg-[#ff7a3d] shadow-orange-500/20"}`}>{submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}{submitting ? "กำลังส่งข้อมูล..." : isHelp ? "ยืนยันขอความช่วยเหลือ" : "ยืนยันการแจ้งน้ำท่วม"}</button></div>
  </form></DialogContent></Dialog>;
}
