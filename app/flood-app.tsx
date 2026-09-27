"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Crosshair, Droplets, ImagePlus, ListFilter, Loader2, LocateFixed, MapPin, Plus, RefreshCw, Search, ShieldCheck, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { FloodMap } from "./flood-map";

export type Severity = "low" | "medium" | "high";
export type FloodReport = { id: string; latitude: number; longitude: number; severity: Severity; waterDepth: number; description: string; areaName: string; imageUrl: string | null; createdAt: number };

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

export function FloodApp() {
  const [reports, setReports] = useState<FloodReport[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);
  const [filter, setFilter] = useState<Severity | "all">("all");
  const [position, setPosition] = useState<[number, number]>([13.7563, 100.5018]);
  const [locating, setLocating] = useState(false);
  const [locationReady, setLocationReady] = useState(false);

  const loadReports = useCallback(async () => {
    try {
      const response = await fetch("/api/reports", { cache: "no-store" });
      if (!response.ok) throw new Error();
      const data = (await response.json()) as { reports: FloodReport[] };
      setReports(data.reports);
    } catch {
      toast.error("ยังโหลดรายงานไม่ได้", { description: "โปรดลองใหม่อีกครั้งในอีกสักครู่" });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadReports(); }, [loadReports]);

  useEffect(() => {
    type ToolContext = { registerTool?: (tool: unknown, options: { signal: AbortSignal }) => void | Promise<void> };
    const context = (document as Document & { modelContext?: ToolContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(context.registerTool({
        name: "start_flood_report", title: "เริ่มแจ้งจุดน้ำท่วม", description: "เปิดแบบฟอร์มแจ้งจุดน้ำท่วมด้วยพิกัดที่ระบุ",
        inputSchema: { type: "object", properties: { latitude: { type: "number" }, longitude: { type: "number" } }, required: ["latitude", "longitude"], additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: (input: { latitude: number; longitude: number }) => {
          if (!Number.isFinite(input.latitude) || !Number.isFinite(input.longitude)) throw new Error("พิกัดไม่ถูกต้อง");
          setPosition([input.latitude, input.longitude]); setLocationReady(true); setReportOpen(true);
          return { status: "ready", latitude: input.latitude, longitude: input.longitude };
        },
      }, { signal: lifecycle.signal })).catch(() => undefined);
    } catch { return; }
    return () => lifecycle.abort();
  }, []);

  const visibleReports = useMemo(() => filter === "all" ? reports : reports.filter((report) => report.severity === filter), [filter, reports]);
  const selectedReport = reports.find((report) => report.id === selectedId) ?? null;
  const highCount = reports.filter((report) => report.severity === "high").length;

  const useMyLocation = useCallback((openAfter = false) => {
    if (!navigator.geolocation) return toast.error("อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      setPosition([coords.latitude, coords.longitude]); setLocationReady(true); setLocating(false);
      if (openAfter) setReportOpen(true);
      toast.success("พบตำแหน่งของคุณแล้ว");
    }, () => {
      setLocating(false);
      toast.error("ไม่สามารถเข้าถึงตำแหน่งได้", { description: "อนุญาตการเข้าถึงตำแหน่ง แล้วลองใหม่อีกครั้ง" });
    }, { enableHighAccuracy: true, timeout: 10_000 });
  }, []);

  return (
    <main className="min-h-screen bg-[#eef6f8] text-[#102a33]">
      <header className="relative z-[1000] flex h-[72px] items-center justify-between border-b border-white/60 bg-[#073b4c] px-4 text-white shadow-lg shadow-[#073b4c]/10 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[#13b8a6] shadow-inner shadow-white/25"><Droplets className="h-6 w-6" strokeWidth={2.4} /></div>
          <div><h1 className="text-lg font-extrabold tracking-tight sm:text-xl">น้ำท่วมไหน</h1><p className="hidden text-xs text-cyan-100/75 sm:block">แผนที่แจ้งเตือนจากคนในพื้นที่</p></div>
        </div>
        <div className="hidden items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm text-cyan-50 md:flex"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#51e6c8]" />อัปเดตจากชุมชนแบบเรียลไทม์</div>
        <button onClick={() => useMyLocation(true)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#ff7a3d] px-4 text-sm font-bold shadow-lg shadow-orange-950/20 transition hover:-translate-y-0.5 hover:bg-[#ff8b55] focus:outline-none focus:ring-4 focus:ring-orange-200/30">
          {locating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}<span className="hidden sm:inline">แจ้งจุดน้ำท่วม</span><span className="sm:hidden">แจ้งเหตุ</span>
        </button>
      </header>

      <section className="grid min-h-[calc(100vh-72px)] lg:grid-cols-[minmax(0,1fr)_390px]">
        <div className="relative min-h-[56vh] overflow-hidden border-b border-slate-200 lg:min-h-0 lg:border-b-0 lg:border-r">
          <FloodMap reports={visibleReports} position={position} locationReady={locationReady} selectedId={selectedId} onSelect={setSelectedId} onPickLocation={(lat, lng) => { setPosition([lat, lng]); setLocationReady(true); }} />
          <div className="pointer-events-none absolute inset-x-0 top-0 z-[500] flex items-start justify-between gap-3 p-3 sm:p-5">
            <div className="pointer-events-auto flex w-full max-w-md items-center gap-2 rounded-2xl border border-white/80 bg-white/95 p-2 shadow-xl shadow-slate-900/10 backdrop-blur">
              <Search className="ml-2 h-5 w-5 shrink-0 text-slate-400" /><span className="flex-1 truncate text-sm text-slate-500">แตะแผนที่เพื่อปักหมุดตำแหน่ง</span>
              <button aria-label="ใช้ตำแหน่งของฉัน" onClick={() => useMyLocation(false)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e8f8f6] text-[#087e72] transition hover:bg-[#d4f3ef]">{locating ? <Loader2 className="h-5 w-5 animate-spin" /> : <LocateFixed className="h-5 w-5" />}</button>
            </div>
          </div>
          <div className="absolute bottom-4 left-4 z-[500] sm:bottom-5 sm:left-5">
            <div className="flex items-center gap-3 rounded-2xl border border-white/80 bg-white/95 px-4 py-3 shadow-xl shadow-slate-900/10 backdrop-blur">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#e4f7f4] text-[#087e72]"><MapPin className="h-5 w-5" /></div>
              <div><p className="text-lg font-black leading-none">{reports.length}</p><p className="mt-1 text-xs text-slate-500">จุดรายงานทั้งหมด</p></div><span className="mx-1 h-8 w-px bg-slate-200" />
              <div><p className="text-lg font-black leading-none text-rose-600">{highCount}</p><p className="mt-1 text-xs text-slate-500">จุดอันตราย</p></div>
            </div>
          </div>
          {selectedReport && <ReportPopup report={selectedReport} onClose={() => setSelectedId(null)} />}
        </div>

        <aside className="flex min-h-[44vh] flex-col bg-white lg:h-[calc(100vh-72px)]">
          <div className="border-b border-slate-100 px-5 pb-4 pt-5">
            <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0a8d80]">สถานการณ์ล่าสุด</p><h2 className="mt-1 text-xl font-extrabold">รายงานจากพื้นที่</h2></div><button aria-label="โหลดข้อมูลใหม่" onClick={() => void loadReports()} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"><RefreshCw className="h-4 w-4" /></button></div>
            <div className="mt-4 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              <FilterButton active={filter === "all"} onClick={() => setFilter("all")}><ListFilter className="h-4 w-4" />ทั้งหมด</FilterButton>
              {(Object.keys(severityMeta) as Severity[]).map((key) => <FilterButton key={key} active={filter === key} onClick={() => setFilter(key)} dot={severityMeta[key].color}>{severityMeta[key].label}</FilterButton>)}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {loading ? <div className="grid h-56 place-items-center text-sm text-slate-500"><span className="text-center"><Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-[#0a8d80]" />กำลังโหลดรายงาน...</span></div> : visibleReports.length === 0 ? (
              <div className="mx-auto flex max-w-xs flex-col items-center px-5 py-12 text-center"><div className="grid h-16 w-16 place-items-center rounded-3xl bg-[#e7f7f5] text-[#0a8d80]"><ShieldCheck className="h-8 w-8" /></div><h3 className="mt-4 text-lg font-bold">ยังไม่มีรายงานในมุมมองนี้</h3><p className="mt-2 text-sm leading-6 text-slate-500">หากพบระดับน้ำผิดปกติ ใช้ตำแหน่งของคุณเพื่อช่วยแจ้งเตือนคนใกล้เคียง</p><button onClick={() => useMyLocation(true)} className="mt-5 rounded-xl bg-[#073b4c] px-5 py-3 text-sm font-bold text-white hover:bg-[#0a5167]">แจ้งเป็นคนแรก</button></div>
            ) : <div className="space-y-3">{visibleReports.map((report) => <ReportCard key={report.id} report={report} active={selectedId === report.id} onClick={() => setSelectedId(report.id)} />)}</div>}
          </div>
          <div className="border-t border-slate-100 bg-[#f7fbfc] p-4"><p className="flex items-start gap-2 text-xs leading-5 text-slate-500"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#0a8d80]" />ข้อมูลมาจากผู้ใช้งานในพื้นที่ โปรดตรวจสอบเส้นทางกับประกาศทางการก่อนเดินทาง</p></div>
        </aside>
      </section>
      <ReportDialog open={reportOpen} onOpenChange={setReportOpen} position={position} onPositionChange={(lat, lng) => { setPosition([lat, lng]); setLocationReady(true); }} onSuccess={async () => { await loadReports(); setReportOpen(false); }} />
      <Toaster richColors position="top-center" />
    </main>
  );
}

function FilterButton({ active, onClick, dot, children }: { active: boolean; onClick: () => void; dot?: string; children: React.ReactNode }) {
  return <button onClick={onClick} className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-bold transition ${active ? "border-[#073b4c] bg-[#073b4c] text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}>{dot && <span className="h-2 w-2 rounded-full" style={{ background: dot }} />}{children}</button>;
}

function ReportCard({ report, active, onClick }: { report: FloodReport; active: boolean; onClick: () => void }) {
  const meta = severityMeta[report.severity];
  return <button onClick={onClick} className={`w-full overflow-hidden rounded-2xl border bg-white text-left transition hover:-translate-y-0.5 hover:shadow-lg ${active ? "border-[#0a8d80] ring-4 ring-[#0a8d80]/10" : "border-slate-200"}`}><div className="flex gap-3 p-3.5">
    {report.imageUrl ? <img src={report.imageUrl} alt="ภาพสถานการณ์น้ำท่วม" className="h-[86px] w-[96px] shrink-0 rounded-xl object-cover" /> : <div className="grid h-[86px] w-[96px] shrink-0 place-items-center rounded-xl bg-[#e9f5f7] text-[#0a8d80]"><Droplets className="h-7 w-7" /></div>}
    <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><span className="rounded-full px-2.5 py-1 text-[11px] font-extrabold" style={{ color: meta.color, background: meta.soft }}>{meta.label}</span><span className="flex items-center gap-1 text-[11px] text-slate-400"><Clock3 className="h-3 w-3" />{timeAgo(report.createdAt)}</span></div><p className="mt-2 truncate text-sm font-extrabold">{report.areaName || "ตำแหน่งที่แจ้ง"}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{report.description}</p><p className="mt-2 text-xs font-bold text-[#087e72]">ระดับน้ำประมาณ {report.waterDepth} ซม.</p></div>
  </div></button>;
}

function ReportPopup({ report, onClose }: { report: FloodReport; onClose: () => void }) {
  const meta = severityMeta[report.severity];
  return <div className="absolute bottom-28 left-4 right-4 z-[600] mx-auto max-w-sm overflow-hidden rounded-2xl border border-white/80 bg-white shadow-2xl shadow-slate-900/20 sm:left-auto sm:right-5 sm:mx-0">
    {report.imageUrl && <img src={report.imageUrl} alt="ภาพสถานการณ์น้ำท่วม" className="h-32 w-full object-cover" />}<button onClick={onClose} aria-label="ปิดรายละเอียด" className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-slate-900/70 text-white"><X className="h-4 w-4" /></button>
    <div className="p-4"><div className="flex items-center justify-between gap-3"><span className="rounded-full px-3 py-1 text-xs font-bold" style={{ color: meta.color, background: meta.soft }}>{meta.label}</span><span className="text-xs text-slate-400">{timeAgo(report.createdAt)}</span></div><h3 className="mt-3 font-extrabold">{report.areaName || "ตำแหน่งที่แจ้ง"}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{report.description}</p><div className="mt-3 flex items-center justify-between rounded-xl bg-[#eef8f8] px-3 py-2 text-sm"><span className="text-slate-500">ระดับน้ำโดยประมาณ</span><strong className="text-[#087e72]">{report.waterDepth} ซม.</strong></div></div>
  </div>;
}

function ReportDialog({ open, onOpenChange, position, onPositionChange, onSuccess }: { open: boolean; onOpenChange: (open: boolean) => void; position: [number, number]; onPositionChange: (lat: number, lng: number) => void; onSuccess: () => Promise<void> }) {
  const [severity, setSeverity] = useState<Severity>("medium");
  const [depth, setDepth] = useState(20);
  const [areaName, setAreaName] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!description.trim()) return toast.error("กรุณาบอกรายละเอียดสถานการณ์");
    setSubmitting(true);
    try {
      const body = new FormData();
      body.set("latitude", String(position[0])); body.set("longitude", String(position[1])); body.set("severity", severity);
      body.set("waterDepth", String(depth)); body.set("areaName", areaName.trim()); body.set("description", description.trim());
      if (image) body.set("image", image);
      const response = await fetch("/api/reports", { method: "POST", body });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "บันทึกรายงานไม่สำเร็จ");
      toast.success("แจ้งจุดน้ำท่วมเรียบร้อยแล้ว", { description: "ขอบคุณที่ช่วยแจ้งเตือนคนในพื้นที่" });
      setDescription(""); setAreaName(""); setImage(null); setPreview(null); setDepth(20); setSeverity("medium");
      await onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "เกิดข้อผิดพลาด โปรดลองใหม่");
    } finally { setSubmitting(false); }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl border-0 p-0 sm:max-w-xl">
      <DialogHeader className="bg-[#073b4c] px-6 pb-5 pt-6 text-left text-white">
        <div className="mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-[#13b8a6]"><AlertTriangle className="h-6 w-6" /></div>
        <DialogTitle className="text-2xl font-extrabold">แจ้งจุดน้ำท่วม</DialogTitle>
        <DialogDescription className="text-cyan-100/75">ข้อมูลของคุณจะช่วยให้คนใกล้เคียงวางแผนเดินทางได้ปลอดภัยขึ้น</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-5 p-6">
        <div>
          <label className="mb-2 block text-sm font-bold">ตำแหน่งที่พบ</label>
          <div className="rounded-2xl border border-slate-200 bg-[#f6fafb] p-3">
            <div className="flex items-center gap-2 text-sm font-bold text-[#087e72]"><Crosshair className="h-4 w-4" />พิกัดปัจจุบัน</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input aria-label="ละติจูด" type="number" step="any" value={position[0]} onChange={(e) => onPositionChange(Number(e.target.value), position[1])} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#0a8d80]" />
              <input aria-label="ลองจิจูด" type="number" step="any" value={position[1]} onChange={(e) => onPositionChange(position[0], Number(e.target.value))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#0a8d80]" />
            </div>
            <input value={areaName} onChange={(e) => setAreaName(e.target.value)} maxLength={100} placeholder="ชื่อถนน ซอย หรือจุดสังเกต (ถ้ามี)" className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#0a8d80]" />
          </div>
        </div>
        <div>
          <label className="mb-2 block text-sm font-bold">ความรุนแรง</label>
          <div className="grid grid-cols-3 gap-2">{(Object.keys(severityMeta) as Severity[]).map((key) => {
            const meta = severityMeta[key];
            return <button type="button" key={key} onClick={() => setSeverity(key)} className={`rounded-2xl border px-2 py-3 text-center text-xs font-bold transition ${severity === key ? `border-transparent ring-4 ${meta.ring}` : "border-slate-200"}`} style={severity === key ? { color: meta.color, background: meta.soft } : undefined}><span className="mx-auto mb-2 block h-3 w-3 rounded-full" style={{ background: meta.color }} />{meta.label}</button>;
          })}</div>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between"><label className="text-sm font-bold">ระดับน้ำโดยประมาณ</label><strong className="rounded-lg bg-[#e7f7f5] px-2 py-1 text-sm text-[#087e72]">{depth} ซม.</strong></div>
          <input aria-label="ระดับน้ำโดยประมาณ" type="range" min="0" max="200" step="5" value={depth} onChange={(e) => setDepth(Number(e.target.value))} className="w-full accent-[#0a8d80]" />
          <div className="flex justify-between text-xs text-slate-400"><span>แฉะ/รอระบาย</span><span>ท่วมสูงมาก</span></div>
        </div>
        <div><label className="mb-2 block text-sm font-bold">รายละเอียดสถานการณ์</label><textarea required value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={3} placeholder="เช่น รถเล็กผ่านไม่ได้ น้ำกำลังเพิ่มสูงขึ้น..." className="w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#0a8d80] focus:ring-4 focus:ring-[#0a8d80]/10" /></div>
        <div>
          <label className="mb-2 block text-sm font-bold">รูปภาพประกอบ <span className="font-normal text-slate-400">(ไม่บังคับ)</span></label>
          <label className="relative flex min-h-28 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 transition hover:border-[#13b8a6] hover:bg-[#f0fbf9]">
            {preview ? <img src={preview} alt="ภาพที่เลือก" className="h-44 w-full object-cover" /> : <div className="py-5 text-center text-slate-500"><ImagePlus className="mx-auto mb-2 h-7 w-7 text-[#0a8d80]" /><span className="text-sm font-bold">แตะเพื่อถ่ายหรือเลือกรูป</span><p className="mt-1 text-xs">JPG, PNG หรือ WebP ไม่เกิน 5 MB</p></div>}
            <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={(e) => { const file = e.target.files?.[0] ?? null; if (preview) URL.revokeObjectURL(preview); setImage(file); setPreview(file ? URL.createObjectURL(file) : null); }} />
          </label>
        </div>
        <button disabled={submitting} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#ff7a3d] font-extrabold text-white shadow-lg shadow-orange-500/20 transition hover:bg-[#ee672f] disabled:cursor-not-allowed disabled:opacity-60">
          {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}{submitting ? "กำลังส่งรายงาน..." : "ยืนยันการแจ้งเหตุ"}
        </button>
      </form>
    </DialogContent>
  </Dialog>;
}
