import { CalendarCheck2, Compass } from 'lucide-react';

export type ActiveScreen = 'scrapbook' | 'itinerary';

interface TopBarProps {
  activeScreen: ActiveScreen;
  onNavigate: (screen: ActiveScreen) => void;
  confirmedCount: number;
  needsReviewCount: number;
  hasItinerary: boolean;
  isPlanning: boolean;
  onBuildItinerary: () => void;
  onOpenExport: () => void;
}

export function TopBar({
  activeScreen,
  onNavigate,
  confirmedCount,
  needsReviewCount,
  hasItinerary,
  isPlanning,
  onBuildItinerary,
  onOpenExport,
}: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 bg-[#F6F1E7]/95 backdrop-blur-sm border-b border-[#E6DFD3]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single text element wordmark */}
        <button
          type="button"
          onClick={() => onNavigate('scrapbook')}
          className="font-serif text-2xl font-semibold tracking-tight text-[#111827] whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E26D4F] rounded"
        >
          De-tourist
        </button>

        {/* Zone 2: Clean single-line text navigation links */}
        <nav
          aria-label="Workspace views"
          className="flex items-center gap-6 sm:gap-8 overflow-x-auto"
        >
          <button
            type="button"
            onClick={() => onNavigate('scrapbook')}
            className={`py-5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E26D4F] ${
              activeScreen === 'scrapbook'
                ? 'border-[#E26D4F] text-[#111827]'
                : 'border-transparent text-[#57423D] hover:text-[#111827]'
            }`}
          >
            01. Scrapbook &amp; Triage
            <span className="ml-2 font-mono text-xs tabular-nums text-[#57423D]">
              ({confirmedCount}
              {needsReviewCount > 0 ? ` + ${needsReviewCount} review` : ''})
            </span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('itinerary')}
            className={`py-5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E26D4F] ${
              activeScreen === 'itinerary'
                ? 'border-[#E26D4F] text-[#111827]'
                : 'border-transparent text-[#57423D] hover:text-[#111827]'
            }`}
          >
            02. Route &amp; Schedule
          </button>
        </nav>

        {/* Zone 3: Single primary action */}
        <div className="shrink-0">
          {activeScreen === 'scrapbook' ? (
            <button
              type="button"
              disabled={isPlanning || confirmedCount === 0}
              onClick={onBuildItinerary}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#E26D4F] hover:bg-[#CF5A3D] disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E26D4F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F6F1E7]"
            >
              <Compass className="w-4 h-4" aria-hidden="true" />
              <span>{isPlanning ? 'Routing...' : 'Build Itinerary'}</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={!hasItinerary}
              onClick={onOpenExport}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#E26D4F] hover:bg-[#CF5A3D] disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E26D4F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F6F1E7]"
            >
              <CalendarCheck2 className="w-4 h-4" aria-hidden="true" />
              <span>Export Trip</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
