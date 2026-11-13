import { Building2, MapPin, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { DESTINATION_PRESETS } from '../data/sampleTokyo';
import type { BaseHotel, PacePreference } from '../types/trip';

interface TripContextBarProps {
  destination: string;
  baseHotel: BaseHotel;
  numDays: number;
  pace: PacePreference;
  startDateISO: string;
  onChangeDestination: (destination: string, hotel?: BaseHotel) => void;
  onChangeHotel: (hotel: BaseHotel) => void;
  onChangeNumDays: (days: number) => void;
  onChangePace: (pace: PacePreference) => void;
  onChangeStartDate: (dateISO: string) => void;
  onRestoreSample: () => void;
}

const PACES: PacePreference[] = ['Relaxed', 'Balanced', 'Packed'];
const DAY_OPTIONS = [2, 3, 4];

export function TripContextBar({
  destination,
  baseHotel,
  numDays,
  pace,
  startDateISO,
  onChangeDestination,
  onChangeHotel,
  onChangeNumDays,
  onChangePace,
  onChangeStartDate,
  onRestoreSample,
}: TripContextBarProps) {
  const [editingHotel, setEditingHotel] = useState(false);
  const [hotelDraftName, setHotelDraftName] = useState(baseHotel.name);
  const [hotelDraftAddr, setHotelDraftAddr] = useState(baseHotel.address);

  const handleSaveHotel = () => {
    if (hotelDraftName.trim()) {
      onChangeHotel({
        ...baseHotel,
        name: hotelDraftName.trim(),
        address: hotelDraftAddr.trim() || baseHotel.address,
      });
    }
    setEditingHotel(false);
  };

  return (
    <section
      aria-label="Trip parameters"
      className="bg-[#FAF7F2] border-b border-[#E6DFD3]"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-4">
        {/* Destination & Hotel Anchor */}
        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
          <div className="flex items-center gap-2">
            <MapPin
              className="w-4 h-4 text-[#E26D4F] shrink-0"
              aria-hidden="true"
            />
            <label htmlFor="destination-select" className="sr-only">
              Destination City
            </label>
            <select
              id="destination-select"
              value={
                DESTINATION_PRESETS.some((p) => p.destination === destination)
                  ? destination
                  : 'custom'
              }
              onChange={(e) => {
                const preset = DESTINATION_PRESETS.find(
                  (p) => p.destination === e.target.value
                );
                if (preset) {
                  onChangeDestination(preset.destination, preset.hotel);
                  setHotelDraftName(preset.hotel.name);
                  setHotelDraftAddr(preset.hotel.address);
                }
              }}
              className="bg-white border border-[#E6DFD3] rounded px-2.5 py-1.5 text-sm font-medium text-[#111827] focus:outline-none focus:border-[#E26D4F] focus:ring-2 focus:ring-[#E26D4F]/20 cursor-pointer"
            >
              {DESTINATION_PRESETS.map((p) => (
                <option key={p.destination} value={p.destination}>
                  {p.destination}
                </option>
              ))}
            </select>
          </div>

          <div className="relative flex items-center gap-2 text-sm text-[#1F2A37]">
            <Building2
              className="w-4 h-4 text-[#57423D] shrink-0"
              aria-hidden="true"
            />
            <span className="text-[#57423D] hidden sm:inline">Base:</span>
            <button
              type="button"
              onClick={() => {
                setHotelDraftName(baseHotel.name);
                setHotelDraftAddr(baseHotel.address);
                setEditingHotel((prev) => !prev);
              }}
              className="font-medium text-[#111827] hover:text-[#E26D4F] underline decoration-[#E6DFD3] underline-offset-4 transition-colors cursor-pointer whitespace-nowrap"
            >
              {baseHotel.name}
            </button>

            {editingHotel && (
              <div className="absolute left-0 top-full mt-2 z-40 w-80 bg-white border border-[#E6DFD3] rounded-lg p-4 shadow-lg">
                <p className="font-serif text-base font-medium text-[#111827] mb-3">
                  Base Accommodation Anchor
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-[#57423D] mb-1">
                      Hotel / Stay Name
                    </label>
                    <input
                      type="text"
                      value={hotelDraftName}
                      onChange={(e) => setHotelDraftName(e.target.value)}
                      className="w-full bg-white border border-[#E6DFD3] rounded px-2.5 py-1.5 text-sm text-[#111827] focus:outline-none focus:border-[#E26D4F] focus:ring-2 focus:ring-[#E26D4F]/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#57423D] mb-1">
                      Street / Neighborhood
                    </label>
                    <input
                      type="text"
                      value={hotelDraftAddr}
                      onChange={(e) => setHotelDraftAddr(e.target.value)}
                      className="w-full bg-white border border-[#E6DFD3] rounded px-2.5 py-1.5 text-sm text-[#111827] focus:outline-none focus:border-[#E26D4F] focus:ring-2 focus:ring-[#E26D4F]/20"
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setEditingHotel(false)}
                      className="px-3 py-1.5 text-xs font-medium text-[#1F2A37] bg-white border border-[#E6DFD3] rounded hover:bg-[#FAF7F2] cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveHotel}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-[#E26D4F] hover:bg-[#CF5A3D] rounded cursor-pointer"
                    >
                      Save Anchor
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <label
              htmlFor="start-date-input"
              className="text-xs font-mono text-[#57423D] hidden md:inline"
            >
              START
            </label>
            <input
              id="start-date-input"
              type="date"
              value={startDateISO}
              onChange={(e) => {
                if (e.target.value) onChangeStartDate(e.target.value);
              }}
              className="bg-white border border-[#E6DFD3] rounded px-2 py-1 font-mono text-xs text-[#111827] tabular-nums focus:outline-none focus:border-[#E26D4F]"
            />
          </div>
        </div>

        {/* Days, Pace & Sample Reset */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Trip Days Segmented Control */}
          <div
            role="group"
            aria-label="Number of days"
            className="inline-flex items-center bg-white border border-[#E6DFD3] rounded p-0.5"
          >
            {DAY_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => onChangeNumDays(d)}
                className={`px-2.5 py-1 text-xs font-mono tabular-nums rounded-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  numDays === d
                    ? 'bg-[#111827] text-white'
                    : 'text-[#57423D] hover:text-[#111827]'
                }`}
              >
                {d}D
              </button>
            ))}
          </div>

          {/* Pace Segmented Control */}
          <div
            role="group"
            aria-label="Daily pace preference"
            className="inline-flex items-center bg-white border border-[#E6DFD3] rounded p-0.5"
          >
            {PACES.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onChangePace(p)}
                className={`px-3 py-1 text-xs font-medium rounded-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  pace === p
                    ? 'bg-[#E26D4F] text-white'
                    : 'text-[#57423D] hover:text-[#111827]'
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onRestoreSample}
            title="Restore Tokyo sample saves"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#57423D] hover:text-[#111827] bg-white border border-[#E6DFD3] rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Reset Sample</span>
          </button>
        </div>
      </div>
    </section>
  );
}
