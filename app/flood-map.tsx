"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { FloodReport } from "./flood-app";

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
export type RainRadarStatus = { state: "off" | "loading" | "ready" | "error"; time?: number; message?: string };

export function FloodMap({ reports, position, locationReady, selectedId, mapStyle, rainEnabled, onRainStatusChange, onSelect, onPickLocation }: {
  reports: FloodReport[];
  position: [number, number];
  locationReady: boolean;
  selectedId: string | null;
  mapStyle: MapStyle;
  rainEnabled: boolean;
  onRainStatusChange: (status: RainRadarStatus) => void;
  onSelect: (id: string) => void;
  onPickLocation: (lat: number, lng: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markerLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const baseLayerRef = useRef<import("leaflet").TileLayer | null>(null);
  const radarLayerRef = useRef<import("leaflet").TileLayer | null>(null);
  const pickerRef = useRef<import("leaflet").Marker | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const onPickLocationRef = useRef(onPickLocation);
  const onRainStatusChangeRef = useRef(onRainStatusChange);
  const initialPositionRef = useRef(position);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => { onPickLocationRef.current = onPickLocation; }, [onPickLocation]);
  useEffect(() => { onRainStatusChangeRef.current = onRainStatusChange; }, [onRainStatusChange]);

  useEffect(() => {
    let mounted = true;
    void import("leaflet").then((L) => {
      if (!mounted || !containerRef.current || mapRef.current) return;
      leafletRef.current = L;
      const map = L.map(containerRef.current, { zoomControl: false, attributionControl: true }).setView(initialPositionRef.current, 12);
      baseLayerRef.current = L.tileLayer(layers.street.url, layers.street.options).addTo(map);
      L.control.zoom({ position: "bottomright" }).addTo(map);
      markerLayerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      map.on("click", (event) => onPickLocationRef.current(event.latlng.lat, event.latlng.lng));
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

    if (!rainEnabled) {
      radarLayerRef.current?.remove();
      radarLayerRef.current = null;
      onRainStatusChangeRef.current({ state: "off" });
      return;
    }

    async function loadLatestRadar() {
      if (!radarLayerRef.current) onRainStatusChangeRef.current({ state: "loading" });
      try {
        const response = await fetch("https://api.rainviewer.com/public/weather-maps.json", { cache: "no-store" });
        if (!response.ok) throw new Error("โหลดข้อมูลเรดาร์ไม่ได้");
        const data = await response.json() as { host?: string; radar?: { past?: { time: number; path: string }[] } };
        const frames = data.radar?.past ?? [];
        const latest = frames.at(-1);
        if (!data.host || !latest) throw new Error("ยังไม่มีข้อมูลเรดาร์ในขณะนี้");
        if (cancelled) return;
        const tileUrl = `${data.host}${latest.path}/256/{z}/{x}/{y}/2/1_0.png`;
        const nextLayer = L.tileLayer(tileUrl, {
          opacity: 0.68,
          maxNativeZoom: 7,
          maxZoom: 19,
          zIndex: 250,
          attribution: 'ข้อมูลเรดาร์ฝน © <a href="https://www.rainviewer.com/" target="_blank" rel="noopener noreferrer">RainViewer</a>',
        }).addTo(map);
        radarLayerRef.current?.remove();
        radarLayerRef.current = nextLayer;
        onRainStatusChangeRef.current({ state: "ready", time: latest.time });
      } catch (error) {
        if (!cancelled) onRainStatusChangeRef.current({ state: "error", message: error instanceof Error ? error.message : "โหลดข้อมูลเรดาร์ไม่ได้" });
      }
    }

    void loadLatestRadar();
    const refreshTimer = window.setInterval(() => void loadLatestRadar(), 5 * 60_000);
    return () => { cancelled = true; window.clearInterval(refreshTimer); };
  }, [rainEnabled, mapReady]);

  useEffect(() => {
    const L = leafletRef.current;
    const layer = markerLayerRef.current;
    if (!L || !layer || !mapReady) return;
    layer.clearLayers();
    reports.forEach((report) => {
      const markerColor = report.reportType === "help" ? "#2563eb" : colors[report.severity];
      const icon = L.divIcon({
        className: "flood-marker-wrap",
        html: `<button aria-label="${report.reportType === "help" ? "จุดขอความช่วยเหลือ" : "จุดแจ้งน้ำท่วม"}" class="flood-marker ${report.id === selectedId ? "is-selected" : ""}" style="--marker:${markerColor}"><svg viewBox="0 0 40 50" aria-hidden="true"><path d="M20 1.5C9.8 1.5 1.5 9.8 1.5 20c0 13.8 18.5 28.5 18.5 28.5S38.5 33.8 38.5 20C38.5 9.8 30.2 1.5 20 1.5Z" fill="var(--marker)" stroke="white" stroke-width="3"/><circle cx="20" cy="20" r="7" fill="white"/></svg></button>`,
        iconSize: [40, 50], iconAnchor: [20, 49],
      });
      L.marker([report.latitude, report.longitude], { icon }).addTo(layer).on("click", () => onSelect(report.id));
    });
  }, [reports, selectedId, onSelect, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !selectedId) return;
    const selectedReport = reports.find((report) => report.id === selectedId);
    if (selectedReport) map.flyTo([selectedReport.latitude, selectedReport.longitude], Math.max(map.getZoom(), 15), { duration: 0.8 });
  }, [reports, selectedId, mapReady]);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map || !locationReady || !mapReady) return;
    map.flyTo(position, Math.max(map.getZoom(), 15), { duration: 0.8 });
    const icon = L.divIcon({
      className: "picker-marker-wrap",
      html: '<div class="picker-marker"><svg viewBox="0 0 40 50" aria-hidden="true"><path d="M20 1.5C9.8 1.5 1.5 9.8 1.5 20c0 13.8 18.5 28.5 18.5 28.5S38.5 33.8 38.5 20C38.5 9.8 30.2 1.5 20 1.5Z" fill="#087e72" stroke="white" stroke-width="3"/><circle cx="20" cy="20" r="7" fill="white"/></svg></div>',
      iconSize: [40, 50], iconAnchor: [20, 49],
    });
    if (!pickerRef.current) pickerRef.current = L.marker(position, { icon, zIndexOffset: 1000 }).addTo(map);
    else pickerRef.current.setLatLng(position);
  }, [position, locationReady, mapReady]);

  return <div ref={containerRef} className="h-full min-h-[60dvh] w-full bg-[#dcebee] lg:min-h-[calc(100vh-80px)]" aria-label="แผนที่จุดน้ำท่วมและขอความช่วยเหลือ" />;
}
