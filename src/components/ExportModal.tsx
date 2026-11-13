import { Calendar, Check, Copy, ExternalLink, X } from 'lucide-react';
import { useState } from 'react';
import type { BaseHotel, DayItinerary } from '../types/trip';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  destination: string;
  baseHotel: BaseHotel;
  days: DayItinerary[];
}

export function buildGoogleMapsDayUrl(
  day: DayItinerary,
  baseHotel: BaseHotel
): string {
  if (day.stops.length === 0) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      baseHotel.address
    )}`;
  }

  const origin = `${baseHotel.lat},${baseHotel.lng}`;
  const lastStop = day.stops[day.stops.length - 1];
  const destination = `${lastStop.lat},${lastStop.lng}`;
  const intermediate = day.stops.slice(0, -1).map((s) => `${s.lat},${s.lng}`);

  const params = new URLSearchParams({
    api: '1',
    origin,
    destination,
    travelmode: 'walking',
  });
  if (intermediate.length > 0) {
    params.set('waypoints', intermediate.join('|'));
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function ExportModal({
  isOpen,
  onClose,
  destination,
  baseHotel,
  days,
}: ExportModalProps) {
  const [downloading, setDownloading] = useState(false);
  const [copiedDay, setCopiedDay] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleDownloadIcs = async () => {
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch('/api/export/ics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination, days }),
      });
      if (!res.ok) throw new Error('Could not generate calendar file.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `detourist-${destination
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')}.ics`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setDownloading(false);
    }
  };

  const handleCopyUrl = async (dayIndex: number, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedDay(dayIndex);
      setTimeout(() => setCopiedDay(null), 2000);
    } catch {
      // Clipboard blocked in sandbox
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#111827]/40 backdrop-blur-[1px] p-4"
    >
      <div className="w-full max-w-lg bg-white border border-[#E6DFD3] rounded-lg shadow-xl overflow-hidden">
        <div className="px-6 py-4 bg-[#FAF7F2] border-b border-[#E6DFD3] flex items-center justify-between">
          <div>
            <h2
              id="export-modal-title"
              className="font-serif text-xl font-semibold text-[#111827]"
            >
              Export Field Itinerary
            </h2>
            <p className="text-xs text-[#57423D] mt-0.5">
              {destination} · {days.length} days · Ordered waypoints &amp; calendar
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close export modal"
            className="p-1.5 text-[#57423D] hover:text-[#111827] rounded hover:bg-[#E6DFD3]/40 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* ICS Calendar Download */}
          <div className="p-4 bg-[#FAF7F2] border border-[#E6DFD3] rounded-lg flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-medium text-[#111827]">
                Calendar Schedule (.ICS)
              </h3>
              <p className="text-xs text-[#57423D] mt-0.5">
                Imports all verified stops, addresses, and opening notes into Apple
                or Google Calendar.
              </p>
            </div>
            <button
              type="button"
              onClick={handleDownloadIcs}
              disabled={downloading}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-[#E26D4F] hover:bg-[#CF5A3D] rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{downloading ? 'Preparing...' : 'Download .ICS'}</span>
            </button>
          </div>

          {error && (
            <p className="text-xs text-[#BA1A1A] bg-[#FFDAD6]/50 px-3 py-2 rounded border border-[#BA1A1A]/20">
              {error}
            </p>
          )}

          {/* Google Maps Multi-Waypoint Deep Links */}
          <div>
            <h3 className="text-sm font-medium text-[#111827] mb-3">
              Google Maps Ordered Routes
            </h3>
            <div className="divide-y divide-[#E6DFD3] border border-[#E6DFD3] rounded-lg overflow-hidden">
              {days.map((day) => {
                const mapsUrl = buildGoogleMapsDayUrl(day, baseHotel);
                return (
                  <div
                    key={day.dayIndex}
                    className="px-4 py-3 bg-white flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#111827] truncate">
                        Day {day.dayIndex} · {day.title}
                      </p>
                      <p className="font-mono text-[11px] text-[#57423D] tabular-nums">
                        {day.stops.length} waypoints · {day.audit.totalWalkingMins}m walk
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleCopyUrl(day.dayIndex, mapsUrl)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#1F2A37] bg-[#FAF7F2] border border-[#E6DFD3] rounded hover:bg-[#E6DFD3]/40 cursor-pointer"
                      >
                        {copiedDay === day.dayIndex ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-[#446650]" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                      <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#111827] bg-white border border-[#E6DFD3] rounded hover:border-[#E26D4F] hover:text-[#E26D4F] transition-colors whitespace-nowrap"
                      >
                        <span>Open Map</span>
                        <ExternalLink className="w-3 h-3" aria-hidden="true" />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
