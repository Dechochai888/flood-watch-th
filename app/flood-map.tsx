"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { FloodReport } from "./flood-app";

const colors = { low: "#eab308", medium: "#f97316", high: "#e11d48" };

export function FloodMap({ reports, position, locationReady, selectedId, onSelect, onPickLocation }: {
  reports: FloodReport[];
  position: [number, number];
  locationReady: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onPickLocation: (lat: number, lng: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markerLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const pickerRef = useRef<import("leaflet").Marker | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);

  useEffect(() => {
    let mounted = true;
    void import("leaflet").then((L) => {
      if (!mounted || !containerRef.current || mapRef.current) return;
      leafletRef.current = L;
      const map = L.map(containerRef.current, { zoomControl: false, attributionControl: true }).setView(position, 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      L.control.zoom({ position: "bottomright" }).addTo(map);
      markerLayerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      map.on("click", (event) => onPickLocation(event.latlng.lat, event.latlng.lng));
    });
    return () => {
      mounted = false;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const L = leafletRef.current;
    const layer = markerLayerRef.current;
    if (!L || !layer) return;
    layer.clearLayers();
    reports.forEach((report) => {
      const icon = L.divIcon({
        className: "flood-marker-wrap",
        html: `<button aria-label="จุดแจ้งน้ำท่วม" class="flood-marker ${report.id === selectedId ? "is-selected" : ""}" style="--marker:${colors[report.severity]}"><span></span></button>`,
        iconSize: [42, 48], iconAnchor: [21, 45],
      });
      L.marker([report.latitude, report.longitude], { icon }).addTo(layer).on("click", () => onSelect(report.id));
    });
  }, [reports, selectedId, onSelect]);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map || !locationReady) return;
    map.flyTo(position, Math.max(map.getZoom(), 15), { duration: 0.8 });
    const icon = L.divIcon({ className: "picker-marker-wrap", html: '<div class="picker-marker"><span></span></div>', iconSize: [32, 42], iconAnchor: [16, 39] });
    if (!pickerRef.current) pickerRef.current = L.marker(position, { icon, zIndexOffset: 1000 }).addTo(map);
    else pickerRef.current.setLatLng(position);
  }, [position, locationReady]);

  return <div ref={containerRef} className="h-full min-h-[56vh] w-full bg-[#dcebee] lg:min-h-[calc(100vh-72px)]" aria-label="แผนที่จุดน้ำท่วม" />;
}
