import { useCallback, useEffect, useRef, useState } from 'react';
import { ExportModal } from './components/ExportModal';
import { ItineraryScreen } from './components/ItineraryScreen';
import { ScrapbookScreen } from './components/ScrapbookScreen';
import { type ActiveScreen, TopBar } from './components/TopBar';
import { TripContextBar } from './components/TripContextBar';
import { INITIAL_TOKYO_SAVES, TOKYO_DEFAULT_HOTEL } from './data/sampleTokyo';
import type {
  BaseHotel,
  DayItinerary,
  InputSourceType,
  LeftoverItem,
  PacePreference,
  SavedPlace,
} from './types/trip';

export default function App() {
  const [activeScreen, setActiveScreen] = useState<ActiveScreen>('scrapbook');
  const [destination, setDestination] = useState('Tokyo, Japan');
  const [baseHotel, setBaseHotel] = useState<BaseHotel>(TOKYO_DEFAULT_HOTEL);
  const [numDays, setNumDays] = useState(3);
  const [pace, setPace] = useState<PacePreference>('Balanced');
  const [startDateISO, setStartDateISO] = useState('2026-11-14');

  const [savedPlaces, setSavedPlaces] =
    useState<SavedPlace[]>(INITIAL_TOKYO_SAVES);
  const [days, setDays] = useState<DayItinerary[]>([]);
  const [leftovers, setLeftovers] = useState<LeftoverItem[]>([]);

  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [dedupeNotice, setDedupeNotice] = useState<string | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const hydratedRef = useRef(false);

  const runPlanner = useCallback(
    async (
      placesToPlan: SavedPlace[],
      hotel: BaseHotel,
      dayCount: number,
      pacePref: PacePreference,
      startDate: string,
      dest: string,
      switchToItinerary = false
    ) => {
      const confirmed = placesToPlan.filter((p) => p.status === 'confirmed');
      if (confirmed.length === 0) {
        setDays([]);
        setLeftovers([]);
        return;
      }

      setIsPlanning(true);
      try {
        const res = await fetch('/api/plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            places: confirmed,
            baseHotel: hotel,
            numDays: dayCount,
            startDateISO: startDate,
            pace: pacePref,
            destination: dest,
          }),
        });
        if (!res.ok) throw new Error('Planning engine request failed.');
        const data = (await res.json()) as {
          days: DayItinerary[];
          leftovers: LeftoverItem[];
        };
        setDays(data.days);
        setLeftovers(data.leftovers);
        if (switchToItinerary) {
          setActiveScreen('itinerary');
        }
      } catch (err) {
        setExtractError(
          err instanceof Error ? err.message : 'Unable to build itinerary.'
        );
      } finally {
        setIsPlanning(false);
      }
    },
    []
  );

  // Load persisted trip state on initial mount
  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      try {
        const tripRes = await fetch('/api/trip');

        if (active && tripRes.ok) {
          const tripData = (await tripRes.json()) as {
            trip?: {
              destination: string;
              baseHotel: BaseHotel;
              numDays: number;
              pace: PacePreference;
              startDateISO: string;
              savedPlaces: SavedPlace[];
            } | null;
          };

          if (tripData.trip && tripData.trip.savedPlaces.length > 0) {
            const t = tripData.trip;
            setDestination(t.destination);
            setBaseHotel(t.baseHotel);
            setNumDays(t.numDays);
            setPace(t.pace);
            setStartDateISO(t.startDateISO);
            setSavedPlaces(t.savedPlaces);
            hydratedRef.current = true;
            void runPlanner(
              t.savedPlaces,
              t.baseHotel,
              t.numDays,
              t.pace,
              t.startDateISO,
              t.destination,
              false
            );
            return;
          }
        }
      } catch {
        // Fallback to Tokyo sample state
      }

      if (active) {
        hydratedRef.current = true;
        void runPlanner(
          INITIAL_TOKYO_SAVES,
          TOKYO_DEFAULT_HOTEL,
          3,
          'Balanced',
          '2026-11-14',
          'Tokyo, Japan',
          false
        );
      }
    };

    void bootstrap();
    return () => {
      active = false;
    };
  }, [runPlanner]);

  // Persist stored trip & Google Maps locations cleanly whenever state updates
  useEffect(() => {
    if (!hydratedRef.current) return;
    const timer = setTimeout(() => {
      void fetch('/api/trip', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination,
          baseHotel,
          numDays,
          pace,
          startDateISO,
          savedPlaces,
        }),
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [destination, baseHotel, numDays, pace, startDateISO, savedPlaces]);

  const mergeExtractedPlaces = (incoming: SavedPlace[]) => {
    setSavedPlaces((prev) => {
      const existingIds = new Set(prev.map((p) => p.resolvedPlaceId));
      const next = [...prev];
      let dupes = 0;

      for (const item of incoming) {
        if (
          item.status === 'confirmed' &&
          existingIds.has(item.resolvedPlaceId)
        ) {
          dupes += 1;
          continue;
        }
        existingIds.add(item.resolvedPlaceId);
        next.unshift(item);
      }

      if (dupes > 0) {
        setDedupeNotice(
          `Deduplicated ${dupes} matching place${dupes > 1 ? 's' : ''} already in your ledger.`
        );
      }
      return next;
    });
  };

  const handleExtractImages = async (
    files: Array<{ dataUrl: string; mimeType: string; fileName: string }>
  ) => {
    setIsExtracting(true);
    setExtractError(null);
    setDedupeNotice(null);
    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: files,
          destination,
          baseHotel,
          inputType: 'screenshot',
        }),
      });
      const data = (await res.json()) as {
        places?: SavedPlace[];
        error?: string;
      };
      if (!res.ok || !data.places) {
        throw new Error(data.error || 'Screenshot extraction failed.');
      }
      mergeExtractedPlaces(data.places);
    } catch (err) {
      setExtractError(
        err instanceof Error ? err.message : 'Screenshot extraction failed.'
      );
    } finally {
      setIsExtracting(false);
    }
  };

  const handleExtractText = async (text: string, mode: InputSourceType) => {
    setIsExtracting(true);
    setExtractError(null);
    setDedupeNotice(null);
    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          destination,
          baseHotel,
          inputType: mode,
        }),
      });
      const data = (await res.json()) as {
        places?: SavedPlace[];
        error?: string;
      };
      if (!res.ok || !data.places) {
        throw new Error(data.error || 'Text extraction failed.');
      }
      mergeExtractedPlaces(data.places);
    } catch (err) {
      setExtractError(
        err instanceof Error ? err.message : 'Text extraction failed.'
      );
    } finally {
      setIsExtracting(false);
    }
  };

  const handleExtractUrl = async (url: string) => {
    setIsExtracting(true);
    setExtractError(null);
    setDedupeNotice(null);
    try {
      const res = await fetch('/api/extract-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, destination, baseHotel }),
      });
      const data = (await res.json()) as {
        places?: SavedPlace[];
        error?: string;
      };
      if (!res.ok || !data.places) {
        throw new Error(data.error || 'URL extraction failed.');
      }
      mergeExtractedPlaces(data.places);
    } catch (err) {
      setExtractError(
        err instanceof Error ? err.message : 'URL extraction failed.'
      );
    } finally {
      setIsExtracting(false);
    }
  };

  const handleConfirmCandidate = (placeId: string, candidateIndex: number) => {
    setDedupeNotice(null);
    setSavedPlaces((prev) => {
      const target = prev.find((p) => p.id === placeId);
      if (!target) return prev;

      const cand = target.candidates?.[candidateIndex];
      const nextResolvedId = cand?.placeId ?? target.resolvedPlaceId;

      const alreadyExists = prev.some(
        (p) =>
          p.id !== placeId &&
          p.status === 'confirmed' &&
          p.resolvedPlaceId === nextResolvedId
      );

      if (alreadyExists) {
        setDedupeNotice(
          `Merged duplicate "${cand?.name ?? target.resolvedName}" into your existing confirmed save.`
        );
        return prev.filter((p) => p.id !== placeId);
      }

      return prev.map((p) => {
        if (p.id !== placeId) return p;
        return {
          ...p,
          status: 'confirmed',
          confidence: 100,
          resolvedPlaceId: nextResolvedId,
          resolvedName: cand?.name ?? p.resolvedName,
          neighborhood: cand?.neighborhood ?? p.neighborhood,
          address: cand?.address ?? p.address,
          lat: cand?.lat ?? p.lat,
          lng: cand?.lng ?? p.lng,
          hoursSummary: cand?.hoursSummary ?? p.hoursSummary,
          openingHours: cand?.openingHours ?? p.openingHours,
          placePhotoUrl: cand?.placePhotoUrl ?? p.placePhotoUrl,
          photoAttribution: cand?.photoAttribution ?? p.photoAttribution,
          originalMediaUrl:
            p.originalMediaUrl || cand?.placePhotoUrl || p.placePhotoUrl,
          googleMapsUri: cand?.googleMapsUri ?? p.googleMapsUri,
        };
      });
    });
  };

  const handleDismissPlace = (placeId: string) => {
    setSavedPlaces((prev) => prev.filter((p) => p.id !== placeId));
  };

  const handleUpdateDuration = (placeId: string, deltaMins: number) => {
    setSavedPlaces((prev) =>
      prev.map((p) =>
        p.id === placeId
          ? {
              ...p,
              typicalDurationMins: Math.max(
                20,
                Math.min(180, p.typicalDurationMins + deltaMins)
              ),
            }
          : p
      )
    );
  };

  const handleRemoveStopToLeftovers = async (
    dayIndex: number,
    stopId: string
  ) => {
    const targetDay = days.find((d) => d.dayIndex === dayIndex);
    const targetStop = targetDay?.stops.find((s) => s.id === stopId);
    if (!targetDay || !targetStop) return;

    const updatedDay: DayItinerary = {
      ...targetDay,
      stops: targetDay.stops.filter((s) => s.id !== stopId),
    };

    try {
      const res = await fetch('/api/audit-day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day: updatedDay, pace }),
      });
      const data = (await res.json()) as { audit?: DayItinerary['audit'] };
      if (data.audit) updatedDay.audit = data.audit;
    } catch {
      // Keep local update
    }

    setDays((prev) =>
      prev.map((d) => (d.dayIndex === dayIndex ? updatedDay : d))
    );

    const originalPlace = savedPlaces.find(
      (p) => p.id === targetStop.savedPlaceId
    );
    if (originalPlace) {
      setLeftovers((prev) => [
        {
          place: originalPlace,
          reason: 'Moved manually from schedule.',
        },
        ...prev,
      ]);
    }
  };

  const handleSuggestSlot = async (placeId: string) => {
    const item = leftovers.find((l) => l.place.id === placeId);
    if (!item) return;

    const res = await fetch('/api/suggest-slot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        place: item.place,
        days,
        baseHotel,
        pace,
      }),
    });
    const data = (await res.json()) as {
      slot: LeftoverItem['suggestedSlot'] | null;
    };

    setLeftovers((prev) =>
      prev.map((l) =>
        l.place.id === placeId
          ? {
              ...l,
              suggestedSlot: data.slot ?? undefined,
              reason: data.slot
                ? l.reason
                : 'No open window available across current trip days.',
            }
          : l
      )
    );
  };

  const handleInsertLeftover = async (placeId: string) => {
    const item = leftovers.find((l) => l.place.id === placeId);
    if (!item || !item.suggestedSlot) return;

    const slot = item.suggestedSlot;
    const targetDay = days.find((d) => d.dayIndex === slot.dayIndex);
    if (!targetDay) return;

    const newStop = {
      id: `stop-${slot.dayIndex}-${targetDay.stops.length + 1}-${item.place.id}`,
      savedPlaceId: item.place.id,
      placeName: item.place.resolvedName,
      category: item.place.category,
      neighborhood: item.place.neighborhood,
      address: item.place.address,
      lat: item.place.lat,
      lng: item.place.lng,
      arrivalTime: slot.arrivalTime,
      departureTime: slot.departureTime,
      durationMins: item.place.typicalDurationMins,
      travelFromPrevMins: slot.travelFromPrevMins,
      travelFromPrevMeters: slot.travelFromPrevMeters,
      travelMode: slot.travelMode,
      bufferBeforeMins: 15,
      openWindowLabel: `Open ${item.place.hoursSummary}`,
      isVerifiedOpen: true,
      rationale: `Added from Leftovers into open slot (${slot.note}).`,
      whySavedMediaUrl: item.place.originalMediaUrl,
      placePhotoUrl: item.place.placePhotoUrl,
      photoAttribution: item.place.photoAttribution,
      googleMapsUri: item.place.googleMapsUri,
      vibeContext: item.place.vibeContext,
    };

    const updatedDay: DayItinerary = {
      ...targetDay,
      stops: [...targetDay.stops, newStop],
    };

    try {
      const res = await fetch('/api/audit-day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day: updatedDay, pace }),
      });
      const data = (await res.json()) as { audit?: DayItinerary['audit'] };
      if (data.audit) updatedDay.audit = data.audit;
    } catch {
      // Keep local update
    }

    setDays((prev) =>
      prev.map((d) => (d.dayIndex === slot.dayIndex ? updatedDay : d))
    );
    setLeftovers((prev) => prev.filter((l) => l.place.id !== placeId));
  };

  const confirmedCount = savedPlaces.filter(
    (p) => p.status === 'confirmed'
  ).length;
  const needsReviewCount = savedPlaces.filter(
    (p) => p.status === 'needs_confirmation'
  ).length;

  return (
    <div className="min-h-screen bg-[#F6F1E7] text-[#111827]">
      <TopBar
        activeScreen={activeScreen}
        onNavigate={setActiveScreen}
        confirmedCount={confirmedCount}
        needsReviewCount={needsReviewCount}
        hasItinerary={days.length > 0}
        isPlanning={isPlanning}
        onBuildItinerary={() =>
          void runPlanner(
            savedPlaces,
            baseHotel,
            numDays,
            pace,
            startDateISO,
            destination,
            true
          )
        }
        onOpenExport={() => setExportOpen(true)}
      />

      <TripContextBar
        destination={destination}
        baseHotel={baseHotel}
        numDays={numDays}
        pace={pace}
        startDateISO={startDateISO}
        onChangeDestination={(nextDest, nextHotel) => {
          setDestination(nextDest);
          if (nextHotel) setBaseHotel(nextHotel);
          if (nextDest !== 'Tokyo, Japan') {
            setSavedPlaces([]);
            setDays([]);
            setLeftovers([]);
            setActiveScreen('scrapbook');
          }
        }}
        onChangeHotel={(nextHotel) => {
          setBaseHotel(nextHotel);
          if (activeScreen === 'itinerary') {
            void runPlanner(
              savedPlaces,
              nextHotel,
              numDays,
              pace,
              startDateISO,
              destination,
              false
            );
          }
        }}
        onChangeNumDays={(d) => {
          setNumDays(d);
          if (activeScreen === 'itinerary') {
            void runPlanner(
              savedPlaces,
              baseHotel,
              d,
              pace,
              startDateISO,
              destination,
              false
            );
          }
        }}
        onChangePace={(p) => {
          setPace(p);
          if (activeScreen === 'itinerary') {
            void runPlanner(
              savedPlaces,
              baseHotel,
              numDays,
              p,
              startDateISO,
              destination,
              false
            );
          }
        }}
        onChangeStartDate={(dt) => {
          setStartDateISO(dt);
          if (activeScreen === 'itinerary') {
            void runPlanner(
              savedPlaces,
              baseHotel,
              numDays,
              pace,
              dt,
              destination,
              false
            );
          }
        }}
        onRestoreSample={() => {
          setDestination('Tokyo, Japan');
          setBaseHotel(TOKYO_DEFAULT_HOTEL);
          setNumDays(3);
          setPace('Balanced');
          setSavedPlaces(INITIAL_TOKYO_SAVES);
          setExtractError(null);
          setDedupeNotice(null);
          void runPlanner(
            INITIAL_TOKYO_SAVES,
            TOKYO_DEFAULT_HOTEL,
            3,
            'Balanced',
            startDateISO,
            'Tokyo, Japan',
            false
          );
        }}
      />

      {activeScreen === 'scrapbook' ? (
        <ScrapbookScreen
          destination={destination}
          baseHotel={baseHotel}
          savedPlaces={savedPlaces}
          isExtracting={isExtracting}
          extractError={extractError}
          dedupeNotice={dedupeNotice}
          isPlanning={isPlanning}
          onExtractImages={handleExtractImages}
          onExtractText={handleExtractText}
          onExtractUrl={handleExtractUrl}
          onConfirmCandidate={handleConfirmCandidate}
          onDismissPlace={handleDismissPlace}
          onUpdateDuration={handleUpdateDuration}
          onBuildItinerary={() =>
            void runPlanner(
              savedPlaces,
              baseHotel,
              numDays,
              pace,
              startDateISO,
              destination,
              true
            )
          }
        />
      ) : (
        <ItineraryScreen
          destination={destination}
          baseHotel={baseHotel}
          pace={pace}
          days={days}
          leftovers={leftovers}
          onBackToScrapbook={() => setActiveScreen('scrapbook')}
          onRemoveStopToLeftovers={(dIdx, stopId) =>
            void handleRemoveStopToLeftovers(dIdx, stopId)
          }
          onSuggestSlot={handleSuggestSlot}
          onInsertLeftover={(placeId) => void handleInsertLeftover(placeId)}
        />
      )}

      <ExportModal
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        destination={destination}
        baseHotel={baseHotel}
        days={days}
      />
    </div>
  );
}
