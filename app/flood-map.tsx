"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CloudRain, Loader2, Pause, Play } from "lucide-react";
import "leaflet/dist/leaflet.css";
import type { FloodReport, SafeRoute } from "./flood-app";

const colors = { low: "#eab308", medium: "#f97316", high: "#e11d48" };
const layers = {
  street: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    options: { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' },
  },
  satellite: {
    url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    options: { maxZoom: 19, attribution: "Esri, Maxar, Earthstar Geographics, and the GIS User Community" },
  },
};

export type MapStyle = keyof typeof layers;
type RainFrame = { time: number; path: string };
type OfficialFloodWindow = "1day" | "3days";

export function FloodMap({ reports, safeRoutes, routePoints, routeDrawing, routeTracking, position, locationReady, selectedId, selectedRouteId, mapStyle, rainEnabled, officialFloodEnabled, onSelect, onSelectRoute, onPickLocation, onAddRoutePoint }: {
  reports: FloodReport[];
  safeRoutes: SafeRoute[];
  routePoints: [number, number][];
  routeDrawing: boolean;
  routeTracking: boolean;
  position: [number, number];
  locationReady: boolean;
  selectedId: string | null;
  selectedRouteId: string | null;
  mapStyle: MapStyle;
  rainEnabled: boolean;
  officialFloodEnabled: boolean;
  onSelect: (id: string) => void;
  onSelectRoute: (id: string) => void;
  onPickLocation: (lat: number, lng: number) => void;
  onAddRoutePoint: (lat: number, lng: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markerLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const safeRouteLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const drawingLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const baseLayerRef = useRef<import("leaflet").TileLayer | null>(null);
  const radarLayerRef = useRef<import("leaflet").TileLayer | null>(null);
  const officialFloodLayerRef = useRef<import("leaflet").TileLayer | null>(null);
  const pickerRef = useRef<import("leaflet").Marker | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const onPickLocationRef = useRef(onPickLocation);
  const onAddRoutePointRef = useRef(onAddRoutePoint);
  const routeDrawingRef = useRef(routeDrawing);
  const initialPositionRef = useRef(position);
  const [mapReady, setMapReady] = useState(false);
  const [rainStatus, setRainStatus] = useState<{ state: "off" | "loading" | "ready" | "error"; message?: string }>({ state: "off" });
  const [officialFloodStatus, setOfficialFloodStatus] = useState<{ state: "off" | "loading" | "ready" | "error"; message?: string; loadedAt?: number }>({ state: "off" });
  const [officialFloodWindow, setOfficialFloodWindow] = useState<OfficialFloodWindow>("3days");
  const [radarHost, setRadarHost] = useState("");
  const [radarFrames, setRadarFrames] = useState<RainFrame[]>([]);
  const [radarFrameIndex, setRadarFrameIndex] = useState(0);
  const [radarPlaying, setRadarPlaying] = useState(false);
  const activeRadarFrame = radarFrames[radarFrameIndex];
  const radarTimeFormatter = useMemo(() => new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }), []);

  useEffect(() => { onPickLocationRef.current = onPickLocation; }, [onPickLocation]);
  useEffect(() => { onAddRoutePointRef.current = onAddRoutePoint; }, [onAddRoutePoint]);
  useEffect(() => { routeDrawingRef.current = routeDrawing; }, [routeDrawing]);

  useEffect(() => {
    let mounted = true;
    void import("leaflet").then((L) => {
      if (!mounted || !containerRef.current || mapRef.current) return;
      leafletRef.current = L;
      const map = L.map(containerRef.current, { zoomControl: false, attributionControl: true }).setView(initialPositionRef.current, 12);
      baseLayerRef.current = L.tileLayer(layers.street.url, layers.street.options).addTo(map);
      L.control.zoom({ position: "bottomright" }).addTo(map);
      safeRouteLayerRef.current = L.layerGroup().addTo(map);
      drawingLayerRef.current = L.layerGroup().addTo(map);
      markerLayerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      map.on("click", (event) => routeDrawingRef.current ? onAddRoutePointRef.current(event.latlng.lat, event.latlng.lng) : onPickLocationRef.current(event.latlng.lat, event.latlng.lng));
      setMapReady(true);
    });
    return () => { mounted = false; mapRef.current?.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map || !mapReady) return;
    baseLayerRef.current?.remove();
    baseLayerRef.current = L.tileLayer(layers[mapStyle].url, layers[mapStyle].options).addTo(map);
    baseLayerRef.current.bringToBack();
  }, [mapStyle, mapReady]);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map || !mapReady) return;
    let cancelled = false;
    officialFloodLayerRef.current?.remove();
    officialFloodLayerRef.current = null;
    if (!officialFloodEnabled) return;

    queueMicrotask(() => { if (!cancelled) setOfficialFloodStatus({ state: "loading" }); });
    void fetch("/api/official-flood/status", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("ตรวจสอบบริการข้อมูลน้ำท่วมไม่ได้");
      const status = await response.json() as { configured?: boolean };
      if (!status.configured) throw new Error("ยังไม่ได้เชื่อมต่อ GISTDA API Key");
      if (cancelled) return;
      const layer = L.tileLayer(`/api/official-flood/tiles/{z}/{x}/{y}?scheme=xyz-v3&window=${officialFloodWindow}`, {
        opacity: 0.68,
        maxZoom: 19,
        zIndex: 260,
        attribution: 'พื้นที่น้ำท่วมจากดาวเทียม © <a href="https://disaster.gistda.or.th/" target="_blank" rel="noopener noreferrer">GISTDA</a>',
      });
      layer.once("load", () => { if (!cancelled) setOfficialFloodStatus({ state: "ready", loadedAt: Date.now() }); });
      layer.once("tileerror", () => { if (!cancelled) setOfficialFloodStatus({ state: "error", message: "โหลดภาพพื้นที่น้ำท่วมไม่สำเร็จ กรุณาตรวจสอบ API Key" }); });
      officialFloodLayerRef.current = layer.addTo(map);
      map.fitBounds([[5.6, 97.3], [20.6, 105.7]], { padding: [18, 18] });
    }).catch((error) => {
      if (!cancelled) setOfficialFloodStatus({ state: "error", message: error instanceof Error ? error.message : "โหลดข้อมูลน้ำท่วมไม่ได้" });
    });
    return () => { cancelled = true; officialFloodLayerRef.current?.remove(); officialFloodLayerRef.current = null; };
  }, [officialFloodEnabled, officialFloodWindow, mapReady]);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map || !mapReady) return;
    let cancelled = false;

    if (!rainEnabled) return;

    async function loadLatestRadar() {
      setRainStatus((current) => current.state === "ready" ? current : { state: "loading" });
      try {
        const response = await fetch("https://api.rainviewer.com/public/weather-maps.json", { cache: "no-store" });
        if (!response.ok) throw new Error("โหลดข้อมูลเรดาร์ไม่ได้");
        const data = await response.json() as { host?: string; radar?: { past?: { time: number; path: string }[] } };
        const frames = data.radar?.past ?? [];
        if (!data.host || !frames.length) throw new Error("ยังไม่มีข้อมูลเรดาร์ในขณะนี้");
        if (cancelled) return;
        setRadarHost(data.host);
        setRadarFrames(frames);
        setRadarFrameIndex(frames.length - 1);
        setRainStatus({ state: "ready" });
      } catch (error) {
        if (!cancelled) setRainStatus({ state: "error", message: error instanceof Error ? error.message : "โหลดข้อมูลเรดาร์ไม่ได้" });
      }
    }

    void loadLatestRadar();
    const refreshTimer = window.setInterval(() => void loadLatestRadar(), 5 * 60_000);
    return () => { cancelled = true; window.clearInterval(refreshTimer); };
  }, [rainEnabled, mapReady]);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map || !mapReady) return;
    radarLayerRef.current?.remove();
    radarLayerRef.current = null;
    if (!rainEnabled || !radarHost || !activeRadarFrame) return;
    radarLayerRef.current = L.tileLayer(`${radarHost}${activeRadarFrame.path}/256/{z}/{x}/{y}/2/1_0.png`, {
      opacity: 0.68,
      maxNativeZoom: 7,
      maxZoom: 19,
      zIndex: 250,
      attribution: 'ข้อมูลเรดาร์ฝน © <a href="https://www.rainviewer.com/" target="_blank" rel="noopener noreferrer">RainViewer</a>',
    }).addTo(map);
  }, [activeRadarFrame, radarHost, rainEnabled, mapReady]);

  useEffect(() => {
    if (!rainEnabled || !radarPlaying || radarFrames.length < 2) return;
    const playbackTimer = window.setInterval(() => {
      setRadarFrameIndex((current) => {
        if (current >= radarFrames.length - 1) { setRadarPlaying(false); return current; }
        return current + 1;
      });
    }, 900);
    return () => window.clearInterval(playbackTimer);
  }, [rainEnabled, radarPlaying, radarFrames.length]);

  useEffect(() => {
    const L = leafletRef.current;
    const layer = markerLayerRef.current;
    if (!L || !layer || !mapReady) return;
    layer.clearLayers();
    reports.forEach((report) => {
      const markerColor = report.reportType === "help" ? "#2563eb" : report.reportType === "water_receded" ? "#16a34a" : report.reportType === "route_open" ? "#0891b2" : colors[report.severity];
      const markerLabel = report.reportType === "help" ? "จุดขอความช่วยเหลือ" : report.reportType === "water_receded" ? "จุดรายงานน้ำลด" : report.reportType === "route_open" ? "จุดรายงานเส้นทางผ่านได้" : "จุดแจ้งน้ำท่วม";
      const icon = L.divIcon({
        className: "flood-marker-wrap",
        html: `<button aria-label="${markerLabel}" class="flood-marker ${report.id === selectedId ? "is-selected" : ""}" style="--marker:${markerColor}"><svg viewBox="0 0 40 50" aria-hidden="true"><path d="M20 1.5C9.8 1.5 1.5 9.8 1.5 20c0 13.8 18.5 28.5 18.5 28.5S38.5 33.8 38.5 20C38.5 9.8 30.2 1.5 20 1.5Z" fill="var(--marker)" stroke="white" stroke-width="3"/><circle cx="20" cy="20" r="7" fill="white"/></svg></button>`,
        iconSize: [40, 50], iconAnchor: [20, 49],
      });
      L.marker([report.latitude, report.longitude], { icon }).addTo(layer).on("click", () => onSelect(report.id));
    });
  }, [reports, selectedId, onSelect, mapReady]);

  useEffect(() => {
    const L = leafletRef.current;
    const layer = safeRouteLayerRef.current;
    if (!L || !layer || !mapReady) return;
    layer.clearLayers();
    safeRoutes.forEach((route) => {
      if (route.path.length < 2) return;
      const selected = route.id === selectedRouteId;
      L.polyline(route.path, { color: selected ? "#f59e0b" : "#16a34a", weight: selected ? 7 : 5, opacity: selected ? 1 : 0.82 }).addTo(layer).on("click", () => onSelectRoute(route.id));
    });
  }, [safeRoutes, selectedRouteId, onSelectRoute, mapReady]);

  useEffect(() => {
    const L = leafletRef.current;
    const layer = drawingLayerRef.current;
    if (!L || !layer || !mapReady) return;
    layer.clearLayers();
    if ((!routeDrawing && !routeTracking) || routePoints.length === 0) return;
    if (routePoints.length > 1) L.polyline(routePoints, { color: routeTracking ? "#dc2626" : "#0891b2", weight: 6, opacity: 0.95, dashArray: routeTracking ? undefined : "10 8" }).addTo(layer);
    routePoints.forEach((point, index) => L.circleMarker(point, { radius: index === 0 ? 7 : 5, color: "white", weight: 2, fillColor: index === 0 ? "#16a34a" : "#0891b2", fillOpacity: 1 }).addTo(layer));
  }, [routeDrawing, routeTracking, routePoints, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !selectedId) return;
    const selectedReport = reports.find((report) => report.id === selectedId);
    if (selectedReport) map.flyTo([selectedReport.latitude, selectedReport.longitude], Math.max(map.getZoom(), 15), { duration: 0.8 });
  }, [reports, selectedId, mapReady]);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map || !mapReady || !selectedRouteId) return;
    const selectedRoute = safeRoutes.find((route) => route.id === selectedRouteId);
    if (selectedRoute?.path.length) map.fitBounds(L.latLngBounds(selectedRoute.path), { padding: [48, 48], maxZoom: 16 });
  }, [safeRoutes, selectedRouteId, mapReady]);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map || !locationReady || !mapReady) return;
    if (routeTracking) map.panTo(position, { animate: true, duration: 0.4 });
    else map.flyTo(position, Math.max(map.getZoom(), 15), { duration: 0.8 });
    const icon = L.divIcon({
      className: "picker-marker-wrap",
      html: '<div class="picker-marker"><svg viewBox="0 0 40 50" aria-hidden="true"><path d="M20 1.5C9.8 1.5 1.5 9.8 1.5 20c0 13.8 18.5 28.5 18.5 28.5S38.5 33.8 38.5 20C38.5 9.8 30.2 1.5 20 1.5Z" fill="#087e72" stroke="white" stroke-width="3"/><circle cx="20" cy="20" r="7" fill="white"/></svg></div>',
      iconSize: [40, 50], iconAnchor: [20, 49],
    });
    if (!pickerRef.current) pickerRef.current = L.marker(position, { icon, zIndexOffset: 1000 }).addTo(map);
    else pickerRef.current.setLatLng(position);
  }, [position, locationReady, routeTracking, mapReady]);

  return <>
    <div ref={containerRef} className="h-full min-h-[60dvh] w-full bg-[#dcebee] lg:min-h-[calc(100vh-80px)]" aria-label="แผนที่จุดน้ำท่วมและขอความช่วยเหลือ" />
    {officialFloodEnabled && <div className="pointer-events-auto absolute left-3 top-[11.25rem] z-[500] w-[min(14rem,calc(100%-1.5rem))] rounded-2xl border border-cyan-100 bg-white/95 p-3 shadow-xl backdrop-blur sm:left-5 sm:top-[8.75rem]">
      <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-[#0ea5e9]/70 ring-1 ring-[#0369a1]" /><p className="text-xs font-extrabold text-[#075985]">พื้นที่น้ำท่วมทั่วไทย</p></div>
      <div className="mt-2 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1" role="group" aria-label="เลือกช่วงข้อมูลดาวเทียม">
        <button type="button" onClick={() => setOfficialFloodWindow("1day")} className={`min-h-8 rounded-lg px-2 text-[10px] font-extrabold ${officialFloodWindow === "1day" ? "bg-[#0e7490] text-white shadow" : "text-slate-500"}`}>ล่าสุด 1 วัน</button>
        <button type="button" onClick={() => setOfficialFloodWindow("3days")} className={`min-h-8 rounded-lg px-2 text-[10px] font-extrabold ${officialFloodWindow === "3days" ? "bg-[#0e7490] text-white shadow" : "text-slate-500"}`}>ย้อนหลัง 3 วัน</button>
      </div>
      {officialFloodStatus.state === "loading" && <p className="mt-2 flex items-center gap-2 text-[11px] text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />กำลังโหลดข้อมูล GISTDA...</p>}
      {officialFloodStatus.state === "ready" && <><p className="mt-2 text-[11px] font-semibold text-slate-600">สีน้ำเงินคือพื้นที่ที่ดาวเทียมตรวจพบ{officialFloodWindow === "1day" ? "ย้อนหลัง 1 วัน" : "ในช่วง 3 วันล่าสุด"}</p><p className="mt-1 text-[9px] text-slate-400">โหลดล่าสุด {new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit" }).format(new Date(officialFloodStatus.loadedAt ?? 0))} น.</p></>}
      {officialFloodWindow === "1day" && <p className="mt-1 text-[9px] font-semibold text-amber-600">หากวันนี้ดาวเทียมยังไม่ผ่านพื้นที่ อาจยังไม่แสดงสีฟ้า</p>}
      {officialFloodStatus.state === "error" && <p className="mt-2 text-[11px] font-semibold text-rose-600">{officialFloodStatus.message || "ยังโหลดข้อมูลไม่ได้"}</p>}
      <a href="https://disaster.gistda.or.th/" target="_blank" rel="noopener noreferrer" className="mt-2 block text-[9px] font-semibold text-slate-400 underline">ข้อมูลดาวเทียมโดย GISTDA · ไม่ใช่ทุกซอยแบบทันที</a>
    </div>}
    {rainEnabled && <div className={`pointer-events-auto absolute right-3 z-[500] w-[min(16rem,calc(100%-1.5rem))] rounded-2xl border border-white/80 bg-white/95 p-3 shadow-xl backdrop-blur sm:right-5 ${officialFloodEnabled ? "top-[18.5rem] sm:top-[15.75rem]" : "top-[11.25rem] sm:top-[8.75rem]"}`}>
      <div className="flex items-center gap-2"><CloudRain className="h-4 w-4 shrink-0 text-[#2563eb]" /><p className="text-xs font-extrabold text-[#1646a0]">เรดาร์ฝนย้อนหลัง 2 ชั่วโมง</p></div>
      {rainStatus.state === "loading" && <p className="mt-2 flex items-center gap-2 text-[11px] text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />กำลังโหลดข้อมูลฝน...</p>}
      {rainStatus.state === "error" && <p className="mt-2 text-[11px] font-semibold text-rose-600">{rainStatus.message || "ยังโหลดข้อมูลเรดาร์ไม่ได้"}</p>}
      {rainStatus.state === "ready" && activeRadarFrame && <>
        <div className="mt-2 flex items-center justify-between gap-2"><button type="button" onClick={() => { if (radarPlaying) setRadarPlaying(false); else { if (radarFrameIndex >= radarFrames.length - 1) setRadarFrameIndex(0); setRadarPlaying(true); } }} className="flex min-h-9 items-center gap-1.5 rounded-lg bg-[#2563eb] px-3 text-[11px] font-extrabold text-white">{radarPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}{radarPlaying ? "หยุด" : "เล่นภาพฝน"}</button><p className="text-[11px] font-bold text-slate-600">{radarTimeFormatter.format(new Date(activeRadarFrame.time * 1000))} น.</p></div>
        <input aria-label="เลือกเวลาเรดาร์ฝน" type="range" min={0} max={Math.max(0, radarFrames.length - 1)} value={radarFrameIndex} onChange={(event) => { setRadarPlaying(false); setRadarFrameIndex(Number(event.target.value)); }} className="mt-2 w-full accent-[#2563eb]" />
        <div className="flex justify-between text-[9px] text-slate-400"><span>2 ชม.ก่อน</span><span>ปัจจุบัน</span></div>
      </>}
      <div className="mt-2 h-2 rounded-full bg-gradient-to-r from-[#88ddee] via-[#005588] via-60% to-[#ff4400]" />
      <div className="mt-1 flex justify-between text-[9px] text-slate-400"><span>ฝนเบา</span><span>ฝนหนัก</span></div>
      <a href="https://www.rainviewer.com/" target="_blank" rel="noopener noreferrer" className="mt-1 block text-[9px] font-semibold text-slate-400 underline">ข้อมูลเรดาร์โดย RainViewer</a>
    </div>}
  </>;
}
