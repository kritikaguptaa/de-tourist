import { Compass, Minus, Plus, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { BaseHotel, DayColorToken, DayItinerary, Stop } from '../types/trip';

interface EditorialMapProps {
  baseHotel: BaseHotel;
  days: DayItinerary[];
  activeDayFilter: number | 'all';
  selectedStopId: string | null;
  onSelectStop: (stopId: string, dayIndex: number) => void;
}

const COLOR_HEX: Record<DayColorToken, string> = {
  terracotta: '#E26D4F',
  sage: '#8FB39A',
  sky: '#6BA6CD',
  sun: '#F2B84B',
};

export function EditorialMap({
  baseHotel,
  days,
  activeDayFilter,
  selectedStopId,
  onSelectStop,
}: EditorialMapProps) {
  const [zoom, setZoom] = useState(1);

  const visibleDays = useMemo(() => {
    if (activeDayFilter === 'all') return days;
    return days.filter((d) => d.dayIndex === activeDayFilter);
  }, [days, activeDayFilter]);

  const allPoints = useMemo(() => {
    const pts: Array<{ lat: number; lng: number; label: string }> = [
      { lat: baseHotel.lat, lng: baseHotel.lng, label: baseHotel.name },
    ];
    for (const d of visibleDays) {
      for (const s of d.stops) {
        pts.push({ lat: s.lat, lng: s.lng, label: s.placeName });
      }
    }
    return pts;
  }, [baseHotel, visibleDays]);

  const bounds = useMemo(() => {
    const lats = allPoints.map((p) => p.lat);
    const lngs = allPoints.map((p) => p.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    const latSpan = Math.max(0.018, (maxLat - minLat) * 1.38);
    const lngSpan = Math.max(0.024, (maxLng - minLng) * 1.38);
    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;

    return {
      centerLat,
      centerLng,
      latSpan: latSpan / zoom,
      lngSpan: lngSpan / zoom,
    };
  }, [allPoints, zoom]);

  const width = 560;
  const height = 430;

  const project = (lat: number, lng: number) => {
    const x =
      width / 2 + ((lng - bounds.centerLng) / bounds.lngSpan) * (width - 80);
    const y =
      height / 2 - ((lat - bounds.centerLat) / bounds.latSpan) * (height - 80);
    return { x, y };
  };

  const hotelPos = project(baseHotel.lat, baseHotel.lng);

  let selectedStop: { stop: Stop; dayIndex: number; color: string } | null = null;
  for (const d of visibleDays) {
    for (const s of d.stops) {
      if (s.id === selectedStopId) {
        selectedStop = {
          stop: s,
          dayIndex: d.dayIndex,
          color: COLOR_HEX[d.colorToken],
        };
      }
    }
  }

  // Unique neighborhood labels placed cleanly
  const neighborhoodLabels = useMemo(() => {
    const seen = new Map<string, { x: number; y: number }>();
    for (const d of visibleDays) {
      for (const s of d.stops) {
        if (!seen.has(s.neighborhood)) {
          const p = project(s.lat, s.lng);
          seen.set(s.neighborhood, { x: p.x, y: p.y - 20 });
        }
      }
    }
    return Array.from(seen.entries());
  }, [visibleDays, bounds]);

  return (
    <div className="paper-card rounded-lg overflow-hidden">
      {/* Map Header */}
      <div className="px-4 py-3 bg-[#FAF7F2] border-b border-[#E6DFD3] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Compass className="w-4 h-4 text-[#E26D4F]" aria-hidden="true" />
          <span className="font-mono text-xs text-[#111827] uppercase tracking-wider">
            Spatial Route Canvas
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Zoom out map"
            onClick={() => setZoom((z) => Math.max(0.7, Number((z - 0.2).toFixed(1))))}
            className="p-1.5 bg-white border border-[#E6DFD3] rounded hover:bg-[#FAF7F2] text-[#1F2A37] cursor-pointer"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            aria-label="Reset map zoom"
            onClick={() => setZoom(1)}
            className="p-1.5 bg-white border border-[#E6DFD3] rounded hover:bg-[#FAF7F2] text-[#1F2A37] cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            aria-label="Zoom in map"
            onClick={() => setZoom((z) => Math.min(2.2, Number((z + 0.2).toFixed(1))))}
            className="p-1.5 bg-white border border-[#E6DFD3] rounded hover:bg-[#FAF7F2] text-[#1F2A37] cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* SVG Cartographic Viewport */}
      <div className="relative atlas-grid-bg border-b border-[#E6DFD3]">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Interactive route map of scheduled stops"
          className="w-full h-auto block select-none"
        >
          {/* Subtle topographic contour lines */}
          <path
            d="M -20 90 Q 140 50, 290 110 T 580 80"
            fill="none"
            stroke="#E6DFD3"
            strokeWidth="1.2"
          />
          <path
            d="M -10 260 Q 180 210, 340 280 T 590 240"
            fill="none"
            stroke="#E6DFD3"
            strokeWidth="1.2"
          />
          <path
            d="M 110 -10 Q 160 190, 95 440"
            fill="none"
            stroke="#E6DFD3"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
          <path
            d="M 380 -10 Q 350 210, 420 440"
            fill="none"
            stroke="#E6DFD3"
            strokeWidth="1"
            strokeDasharray="4 4"
          />

          {/* Subtle river/waterway ribbon */}
          <path
            d="M -20 350 C 140 310, 280 390, 580 330"
            fill="none"
            stroke="#6BA6CD"
            strokeOpacity="0.18"
            strokeWidth="14"
            strokeLinecap="round"
          />

          {/* Neighborhood typographic callouts */}
          {neighborhoodLabels.map(([name, pos]) => (
            <text
              key={name}
              x={pos.x}
              y={Math.max(22, Math.min(height - 16, pos.y))}
              textAnchor="middle"
              className="fill-[#8A726C] font-mono text-[9px] uppercase tracking-widest"
            >
              {name}
            </text>
          ))}

          {/* Route Splines per Day */}
          {visibleDays.map((day) => {
            const stroke = COLOR_HEX[day.colorToken];
            const pts = [
              hotelPos,
              ...day.stops.map((s) => project(s.lat, s.lng)),
            ];

            return (
              <g key={`route-day-${day.dayIndex}`}>
                {day.stops.map((stop, idx) => {
                  const p1 = pts[idx];
                  const p2 = pts[idx + 1];
                  const midX = (p1.x + p2.x) / 2;
                  const midY = (p1.y + p2.y) / 2 - 12;
                  return (
                    <path
                      key={`seg-${stop.id}`}
                      d={`M ${p1.x} ${p1.y} Q ${midX} ${midY} ${p2.x} ${p2.y}`}
                      fill="none"
                      stroke={stroke}
                      strokeWidth={stop.id === selectedStopId ? 3 : 2.2}
                      strokeOpacity={0.85}
                      strokeDasharray={
                        stop.travelMode === 'transit' ? '6 4' : undefined
                      }
                    />
                  );
                })}
              </g>
            );
          })}

          {/* Base Hotel Anchor Pin */}
          <g transform={`translate(${hotelPos.x}, ${hotelPos.y})`}>
            <rect
              x={-11}
              y={-11}
              width={22}
              height={22}
              rx={3}
              fill="#111827"
              stroke="#FFFFFF"
              strokeWidth={2}
            />
            <text
              x={0}
              y={4}
              textAnchor="middle"
              className="fill-white font-mono text-[11px] font-bold"
            >
              H
            </text>
          </g>

          {/* Numbered Stop Stamp Pins */}
          {visibleDays.map((day) => {
            const fill = COLOR_HEX[day.colorToken];
            return day.stops.map((stop, idx) => {
              const pos = project(stop.lat, stop.lng);
              const isSelected = stop.id === selectedStopId;
              return (
                <g
                  key={stop.id}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  onClick={() => onSelectStop(stop.id, day.dayIndex)}
                  className="cursor-pointer"
                >
                  {isSelected && (
                    <circle
                      r={18}
                      fill={fill}
                      fillOpacity={0.18}
                      stroke={fill}
                      strokeWidth={1.5}
                    />
                  )}
                  <circle
                    r={isSelected ? 13 : 11}
                    fill={fill}
                    stroke="#FFFFFF"
                    strokeWidth={2}
                  />
                  <text
                    x={0}
                    y={4}
                    textAnchor="middle"
                    className="fill-white font-mono text-[11px] font-bold"
                  >
                    {idx + 1}
                  </text>
                </g>
              );
            });
          })}

          {/* Coordinate Stamp in Bottom Corner */}
          <text
            x={14}
            y={height - 12}
            className="fill-[#8A726C] font-mono text-[9px]"
          >
            {baseHotel.lat.toFixed(4)}°N {baseHotel.lng.toFixed(4)}°E
          </text>
        </svg>
      </div>

      {/* Map Legend & Active Stop Footer */}
      <div className="px-4 py-3 bg-white flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[#57423D]">
          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px]">
              <span className="w-3 h-3 rounded-xs bg-[#111827] inline-block" />
              Hotel Base
            </span>
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px]">
              <span className="w-5 border-t-2 border-[#E26D4F] inline-block" />
              Walk
            </span>
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px]">
              <span className="w-5 border-t-2 border-dashed border-[#6BA6CD] inline-block" />
              Transit
            </span>
          </div>

          <span className="font-mono text-[11px] tabular-nums">
            {visibleDays.reduce((sum, d) => sum + d.stops.length, 0)} PINS SHOWN
          </span>
        </div>

        {selectedStop && (
          <div className="pt-2 border-t border-[#E6DFD3] flex items-center justify-between gap-2 text-xs">
            <div className="min-w-0">
              <span className="font-mono text-[11px] text-[#57423D] mr-2">
                DAY {selectedStop.dayIndex} · {selectedStop.stop.arrivalTime}
              </span>
              <span className="font-medium text-[#111827] truncate">
                {selectedStop.stop.placeName}
              </span>
            </div>
            <span className="font-mono text-[11px] text-[#57423D] shrink-0">
              {selectedStop.stop.neighborhood}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
