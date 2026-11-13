import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  Footprints,
  Image as ImageIcon,
  Layers,
  PlusCircle,
  Sparkles,
  TrainFront,
  X,
} from 'lucide-react';
import { useState } from 'react';
import type {
  BaseHotel,
  DayColorToken,
  DayItinerary,
  LeftoverItem,
  PacePreference,
} from '../types/trip';
import { EditorialMap } from './EditorialMap';
import { buildGoogleMapsDayUrl } from './ExportModal';

interface ItineraryScreenProps {
  destination: string;
  baseHotel: BaseHotel;
  pace: PacePreference;
  days: DayItinerary[];
  leftovers: LeftoverItem[];
  onBackToScrapbook: () => void;
  onRemoveStopToLeftovers: (dayIndex: number, stopId: string) => void;
  onSuggestSlot: (placeId: string) => Promise<void>;
  onInsertLeftover: (placeId: string) => void;
}

const DAY_ACCENT_TEXT: Record<DayColorToken, string> = {
  terracotta: 'text-[#E26D4F]',
  sage: 'text-[#446650]',
  sky: 'text-[#1E6285]',
  sun: 'text-[#9A6B13]',
};

const DAY_TAB_ACTIVE: Record<DayColorToken, string> = {
  terracotta: 'bg-[#E26D4F]/12 text-[#9F3B22] border-[#E26D4F]',
  sage: 'bg-[#8FB39A]/20 text-[#2D4E3A] border-[#8FB39A]',
  sky: 'bg-[#6BA6CD]/18 text-[#1E6285] border-[#6BA6CD]',
  sun: 'bg-[#F2B84B]/20 text-[#7A530B] border-[#F2B84B]',
};

function formatDurationHm(totalMins: number): string {
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function ItineraryScreen({
  destination,
  baseHotel,
  pace,
  days,
  leftovers,
  onBackToScrapbook,
  onRemoveStopToLeftovers,
  onSuggestSlot,
  onInsertLeftover,
}: ItineraryScreenProps) {
  const [activeDayFilter, setActiveDayFilter] = useState<number | 'all'>(
    days[0]?.dayIndex ?? 1
  );
  const [selectedStopId, setSelectedStopId] = useState<string | null>(
    days[0]?.stops[0]?.id ?? null
  );
  const [expandedWhyId, setExpandedWhyId] = useState<string | null>(null);
  const [leftoversOpen, setLeftoversOpen] = useState(leftovers.length > 0);
  const [suggestingPlaceId, setSuggestingPlaceId] = useState<string | null>(
    null
  );

  const visibleDays =
    activeDayFilter === 'all'
      ? days
      : days.filter((d) => d.dayIndex === activeDayFilter);

  const auditTotals = visibleDays.reduce(
    (acc, d) => ({
      walkingMins: acc.walkingMins + d.audit.totalWalkingMins,
      walkingMeters: acc.walkingMeters + d.audit.totalWalkingMeters,
      transitMins: acc.transitMins + d.audit.totalTransitMins,
      breathingMins: acc.breathingMins + d.audit.breathingRoomMins,
      stopCount: acc.stopCount + d.audit.stopCount,
      allOpenVerified: acc.allOpenVerified && d.audit.zeroClosedStopsVerified,
    }),
    {
      walkingMins: 0,
      walkingMeters: 0,
      transitMins: 0,
      breathingMins: 0,
      stopCount: 0,
      allOpenVerified: true,
    }
  );

  if (days.length === 0) {
    return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <div className="paper-card max-w-md mx-auto rounded-lg p-8">
          <h1 className="font-serif text-2xl font-semibold text-[#111827] mb-2">
            No itinerary built yet
          </h1>
          <p className="text-sm text-[#57423D] mb-6">
            Confirm at least one saved place in your scrapbook to run the
            deterministic clustering and routing engine.
          </p>
          <button
            type="button"
            onClick={onBackToScrapbook}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#E26D4F] hover:bg-[#CF5A3D] rounded cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Scrapbook</span>
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24">
      {/* Step 6: Open Audit Banner */}
      <section
        aria-label="Daily realism and opening hours audit"
        className="paper-card rounded-lg mb-6 overflow-hidden"
      >
        <div className="px-5 py-3 bg-[#FAF7F2] border-b border-[#E6DFD3] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2
              className="w-4 h-4 text-[#446650]"
              aria-hidden="true"
            />
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#111827]">
              Realism Audit ·{' '}
              {activeDayFilter === 'all'
                ? `${days.length}-Day Trip`
                : `Day ${activeDayFilter}`}
            </span>
          </div>
          <span className="text-xs text-[#57423D]">
            Deterministic travel matrix · Zero LLM travel-time guessing ·{' '}
            <strong className="font-medium text-[#111827]">{pace}</strong> pace
          </span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-[#E6DFD3]">
          <div className="px-5 py-3.5">
            <p className="font-mono text-[11px] uppercase text-[#57423D]">
              Walking Distance &amp; Time
            </p>
            <p className="font-mono text-lg font-bold text-[#111827] tabular-nums mt-0.5">
              {auditTotals.walkingMins} min ·{' '}
              {(auditTotals.walkingMeters / 1000).toFixed(1)} km
            </p>
          </div>

          <div className="px-5 py-3.5">
            <p className="font-mono text-[11px] uppercase text-[#57423D]">
              Calm Breathing Room
            </p>
            <p className="font-mono text-lg font-bold text-[#446650] tabular-nums mt-0.5">
              +{formatDurationHm(auditTotals.breathingMins)}
            </p>
          </div>

          <div className="px-5 py-3.5">
            <p className="font-mono text-[11px] uppercase text-[#57423D]">
              Opening Hours Check
            </p>
            <p className="text-sm font-medium text-[#446650] mt-1 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>
                {auditTotals.allOpenVerified
                  ? 'Zero closed stops verified'
                  : 'Review closed hours'}
              </span>
            </p>
          </div>

          <div className="px-5 py-3.5">
            <p className="font-mono text-[11px] uppercase text-[#57423D]">
              Scheduled Stops
            </p>
            <p className="font-mono text-lg font-bold text-[#111827] tabular-nums mt-0.5">
              {auditTotals.stopCount} stops
              {auditTotals.transitMins > 0
                ? ` · ${auditTotals.transitMins}m rail`
                : ''}
            </p>
          </div>
        </div>
      </section>

      {/* Day Switcher Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div
          role="tablist"
          aria-label="Filter by itinerary day"
          className="flex flex-wrap items-center gap-2"
        >
          {days.map((d) => {
            const isActive = activeDayFilter === d.dayIndex;
            return (
              <button
                key={d.dayIndex}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => {
                  setActiveDayFilter(d.dayIndex);
                  if (d.stops[0]) setSelectedStopId(d.stops[0].id);
                }}
                className={`px-3.5 py-1.5 text-xs font-mono uppercase tracking-wider rounded border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isActive
                    ? DAY_TAB_ACTIVE[d.colorToken]
                    : 'bg-white border-[#E6DFD3] text-[#57423D] hover:text-[#111827]'
                }`}
              >
                Day {d.dayIndex} · {d.weekdayLabel.slice(0, 3)}
              </button>
            );
          })}

          <button
            type="button"
            role="tab"
            aria-selected={activeDayFilter === 'all'}
            onClick={() => setActiveDayFilter('all')}
            className={`px-3.5 py-1.5 text-xs font-mono uppercase tracking-wider rounded border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeDayFilter === 'all'
                ? 'bg-[#111827] text-white border-[#111827]'
                : 'bg-white border-[#E6DFD3] text-[#57423D] hover:text-[#111827]'
            }`}
          >
            All {days.length} Days
          </button>
        </div>

        <button
          type="button"
          onClick={onBackToScrapbook}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#57423D] hover:text-[#111827] cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Edit Scrapbook Saves</span>
        </button>
      </div>

      {/* 12-Column Map & Ticket Timeline Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* LEFT 5 COLS: Sticky Spatial Route Canvas */}
        <div className="lg:col-span-5 lg:sticky lg:top-24 space-y-3">
          <EditorialMap
            baseHotel={baseHotel}
            days={days}
            activeDayFilter={activeDayFilter}
            selectedStopId={selectedStopId}
            onSelectStop={(stopId, dayIndex) => {
              setSelectedStopId(stopId);
              if (activeDayFilter !== 'all' && activeDayFilter !== dayIndex) {
                setActiveDayFilter(dayIndex);
              }
            }}
          />

          {visibleDays.length === 1 && (
            <div className="flex items-center justify-between px-1 text-xs text-[#57423D]">
              <span>Origin: {baseHotel.name}</span>
              <a
                href={buildGoogleMapsDayUrl(visibleDays[0], baseHotel)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-[#E26D4F] hover:text-[#CF5A3D] underline underline-offset-4"
              >
                <span>Open Day {visibleDays[0].dayIndex} in Google Maps</span>
                <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </a>
            </div>
          )}
        </div>

        {/* RIGHT 7 COLS: Ticket-Styled Day Timeline */}
        <div className="lg:col-span-7 space-y-10">
          {visibleDays.map((day) => (
            <section
              key={day.dayIndex}
              aria-label={`Day ${day.dayIndex} schedule`}
              className="space-y-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2 pb-3 border-b border-[#E6DFD3]">
                <div>
                  <span
                    className={`font-mono text-xs uppercase tracking-wider font-bold ${
                      DAY_ACCENT_TEXT[day.colorToken]
                    }`}
                  >
                    Day 0{day.dayIndex} · {day.weekdayLabel} · {day.dateISO}
                  </span>
                  <h2 className="font-serif text-2xl font-semibold text-[#111827] mt-0.5 text-balance">
                    {day.title}
                  </h2>
                </div>
                <span className="font-mono text-xs text-[#57423D] tabular-nums">
                  {day.stops.length} STOPS · {day.audit.totalWalkingMins}M WALK
                </span>
              </div>

              {day.stops.length === 0 ? (
                <div className="paper-card rounded-lg p-6 text-sm text-[#57423D]">
                  No stops assigned to Day {day.dayIndex}. Expand the Leftovers
                  Drawer below to slot in an unassigned save.
                </div>
              ) : (
                <div className="space-y-0">
                  {day.stops.map((stop, idx) => {
                    const isSelected = stop.id === selectedStopId;
                    const isWhyExpanded = expandedWhyId === stop.id;
                    const displayThumb =
                      stop.placePhotoUrl || stop.whySavedMediaUrl;
                    const mapsSearchUrl =
                      stop.googleMapsUri ||
                      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                        `${stop.placeName} ${stop.address}`
                      )}`;

                    return (
                      <div key={stop.id}>
                        {/* Transit & Buffer Gauge */}
                        <div className="relative py-3 flex items-center justify-center">
                          <div
                            aria-hidden="true"
                            className="absolute inset-x-4 top-1/2 border-t border-dashed border-[#D8CFC0]"
                          />
                          <div className="relative z-10 inline-flex items-center gap-2 px-3 py-1 bg-[#FAF7F2] border border-[#E6DFD3] rounded font-mono text-[11px] text-[#57423D] tabular-nums stamp-shadow">
                            {stop.travelMode === 'walk' ? (
                              <Footprints
                                className="w-3 h-3 text-[#E26D4F]"
                                aria-hidden="true"
                              />
                            ) : (
                              <TrainFront
                                className="w-3 h-3 text-[#1E6285]"
                                aria-hidden="true"
                              />
                            )}
                            <span>
                              {stop.travelFromPrevMins}M{' '}
                              {stop.travelMode.toUpperCase()} (
                              {stop.travelFromPrevMeters >= 1000
                                ? `${(stop.travelFromPrevMeters / 1000).toFixed(
                                    1
                                  )}KM`
                                : `${stop.travelFromPrevMeters}M`}
                              )
                              {idx === 0
                                ? ` FROM ${baseHotel.name.split(' ')[0].toUpperCase()}`
                                : stop.bufferBeforeMins > 0
                                  ? ` · +${stop.bufferBeforeMins}M CALM BUFFER`
                                  : ''}
                            </span>
                          </div>
                        </div>

                        {/* Boarding-Pass / Ticket Stop Card */}
                        <article
                          onClick={() => setSelectedStopId(stop.id)}
                          className={`paper-card paper-card-interactive rounded-lg overflow-hidden cursor-pointer transition-colors ${
                            isSelected ? 'ring-1 ring-[#E26D4F]' : ''
                          }`}
                        >
                          <div className="px-5 py-2.5 bg-[#FAF7F2] flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-3 font-mono text-xs tabular-nums">
                              <span
                                className={`font-bold ${
                                  DAY_ACCENT_TEXT[day.colorToken]
                                }`}
                              >
                                #{idx + 1}
                              </span>
                              <span className="font-bold text-[#111827]">
                                {stop.arrivalTime} – {stop.departureTime}
                              </span>
                              <span className="text-[#57423D]">
                                ({stop.durationMins}m stay)
                              </span>
                            </div>

                            <div className="flex items-center gap-2 font-mono text-[11px] tabular-nums text-[#446650]">
                              <Clock
                                className="w-3 h-3"
                                aria-hidden="true"
                              />
                              <span>{stop.openWindowLabel} · VERIFIED</span>
                            </div>
                          </div>

                          <div className="ticket-perforation" />

                          <div className="p-5 flex flex-col sm:flex-row gap-4 justify-between">
                            <div className="space-y-1.5 min-w-0 flex-1">
                              <div className="flex items-center gap-2 text-xs text-[#57423D]">
                                <span className="font-medium text-[#1F2A37]">
                                  {stop.category}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span>{stop.neighborhood}</span>
                              </div>

                              <h3 className="font-serif text-xl font-medium text-[#111827] leading-snug">
                                {stop.placeName}
                              </h3>

                              <p className="text-sm text-[#1F2A37] leading-relaxed">
                                {stop.rationale}
                              </p>

                              <div className="pt-2 flex flex-wrap items-center gap-4 text-xs">
                                {(displayThumb || stop.vibeContext) && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setExpandedWhyId((prev) =>
                                        prev === stop.id ? null : stop.id
                                      );
                                    }}
                                    className="inline-flex items-center gap-1.5 font-medium text-[#E26D4F] hover:text-[#CF5A3D] cursor-pointer"
                                  >
                                    <ImageIcon
                                      className="w-3.5 h-3.5"
                                      aria-hidden="true"
                                    />
                                    <span>
                                      {isWhyExpanded
                                        ? 'Hide reference'
                                        : 'Why I saved this'}
                                    </span>
                                  </button>
                                )}

                                <a
                                  href={mapsSearchUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 text-[#57423D] hover:text-[#111827]"
                                >
                                  <span>Maps</span>
                                  <ExternalLink
                                    className="w-3 h-3"
                                    aria-hidden="true"
                                  />
                                </a>

                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onRemoveStopToLeftovers(
                                      day.dayIndex,
                                      stop.id
                                    );
                                  }}
                                  className="inline-flex items-center gap-1 text-[#8A726C] hover:text-[#BA1A1A] cursor-pointer"
                                >
                                  <X className="w-3 h-3" aria-hidden="true" />
                                  <span>Move to leftovers</span>
                                </button>
                              </div>

                              {isWhyExpanded && (
                                <div className="mt-3 p-3 bg-[#FAF7F2] border border-[#E6DFD3] rounded flex items-center gap-3">
                                  {displayThumb && (
                                    <img
                                      src={displayThumb}
                                      alt={stop.placeName}
                                      referrerPolicy="no-referrer"
                                      className="w-16 h-12 object-cover rounded-sm border border-[#E6DFD3] shrink-0"
                                    />
                                  )}
                                  <div className="text-xs text-[#57423D] min-w-0">
                                    <p className="font-mono text-[10px] uppercase text-[#8A726C]">
                                      Original Save Note
                                    </p>
                                    <p className="text-[#111827] mt-0.5">
                                      {stop.vibeContext || stop.address}
                                    </p>
                                    {stop.photoAttribution && (
                                      <p className="font-mono text-[10px] text-[#8A726C] mt-0.5 truncate">
                                        Photo: {stop.photoAttribution.displayName}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>

                            {displayThumb && !isWhyExpanded && (
                              <div className="hidden sm:block w-24 shrink-0">
                                <div className="p-1 pb-2.5 bg-white border border-[#E6DFD3] rounded-sm shadow-xs">
                                  <img
                                    src={displayThumb}
                                    alt={stop.placeName}
                                    referrerPolicy="no-referrer"
                                    className="w-full aspect-[4/3] object-cover rounded-[2px]"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        </article>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          ))}
        </div>
      </div>

      {/* Step 7: Collapsible Leftovers Drawer */}
      <section
        aria-label="Leftovers drawer"
        className="mt-12 paper-card rounded-lg overflow-hidden"
      >
        <button
          type="button"
          onClick={() => setLeftoversOpen((prev) => !prev)}
          className="w-full px-5 py-4 bg-[#FAF7F2] flex items-center justify-between gap-4 text-left cursor-pointer hover:bg-[#F4EDE1]/60 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Layers className="w-4 h-4 text-[#E26D4F]" aria-hidden="true" />
            <div>
              <h2 className="font-serif text-lg font-medium text-[#111827]">
                Leftovers Drawer
              </h2>
              <p className="text-xs text-[#57423D]">
                Unassigned places held back to protect pace budgets and opening
                windows
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="font-mono text-xs tabular-nums text-[#57423D]">
              {leftovers.length} UNASSIGNED
            </span>
            {leftoversOpen ? (
              <ChevronUp className="w-4 h-4 text-[#57423D]" />
            ) : (
              <ChevronDown className="w-4 h-4 text-[#57423D]" />
            )}
          </div>
        </button>

        {leftoversOpen && (
          <div className="border-t border-[#E6DFD3] bg-white">
            {leftovers.length === 0 ? (
              <div className="p-6 text-sm text-[#446650]">
                All confirmed saves fit cleanly inside your {destination}{' '}
                schedule with breathing room intact.
              </div>
            ) : (
              <div className="divide-y divide-[#E6DFD3]">
                {leftovers.map((item) => (
                  <div
                    key={item.place.id}
                    className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs text-[#57423D]">
                        <span className="font-medium text-[#1F2A37]">
                          {item.place.category}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{item.place.neighborhood}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono text-[11px]">
                          Open {item.place.hoursSummary}
                        </span>
                      </div>
                      <h3 className="font-serif text-lg font-medium text-[#111827]">
                        {item.place.resolvedName}
                      </h3>
                      <p className="text-xs text-[#9F3B22]">
                        Held back: {item.reason}
                      </p>

                      {item.suggestedSlot && (
                        <p className="font-mono text-xs text-[#446650] pt-1">
                          Open slot found: {item.suggestedSlot.note} (
                          {item.suggestedSlot.arrivalTime}–
                          {item.suggestedSlot.departureTime})
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={suggestingPlaceId === item.place.id}
                        onClick={async () => {
                          setSuggestingPlaceId(item.place.id);
                          await onSuggestSlot(item.place.id);
                          setSuggestingPlaceId(null);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#111827] bg-[#FAF7F2] border border-[#E6DFD3] hover:border-[#E26D4F] rounded transition-colors cursor-pointer"
                      >
                        <Sparkles
                          className="w-3.5 h-3.5 text-[#E26D4F]"
                          aria-hidden="true"
                        />
                        <span>
                          {suggestingPlaceId === item.place.id
                            ? 'Scanning...'
                            : 'Suggest open slot'}
                        </span>
                      </button>

                      {item.suggestedSlot && (
                        <button
                          type="button"
                          onClick={() => onInsertLeftover(item.place.id)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#446650] hover:bg-[#2D4E3A] rounded transition-colors cursor-pointer"
                        >
                          <PlusCircle
                            className="w-3.5 h-3.5"
                            aria-hidden="true"
                          />
                          <span>
                            Insert into Day {item.suggestedSlot.dayIndex}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
