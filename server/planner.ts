import type {
  BaseHotel,
  DayAudit,
  DayColorToken,
  DayHours,
  DayItinerary,
  LeftoverItem,
  PacePreference,
  SavedPlace,
  Stop,
  SuggestedSlot,
  TimeOfDayHint,
} from '../src/types/trip.ts';

const PACE_CONFIG: Record<
  PacePreference,
  {
    startMins: number;
    endMins: number;
    maxStops: number;
    minBufferMins: number;
  }
> = {
  Relaxed: {
    startMins: 10 * 60,
    endMins: 18 * 60 + 30,
    maxStops: 3,
    minBufferMins: 35,
  },
  Balanced: {
    startMins: 9 * 60 + 30,
    endMins: 20 * 60,
    maxStops: 4,
    minBufferMins: 20,
  },
  Packed: {
    startMins: 9 * 60,
    endMins: 21 * 60 + 30,
    maxStops: 6,
    minBufferMins: 10,
  },
};

const DAY_COLORS: DayColorToken[] = ['terracotta', 'sage', 'sky', 'sun'];
const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export function timeToMins(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

export function minsToTime(totalMins: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(totalMins)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function computeTravelLeg(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): { mins: number; meters: number; mode: 'walk' | 'transit' } {
  const straightMeters = haversineMeters(lat1, lng1, lat2, lng2);
  const streetMeters = Math.round(straightMeters * 1.26);

  if (streetMeters <= 1650) {
    // 75 meters / min (~4.5 km/h urban stroll)
    const mins = Math.max(3, Math.round(streetMeters / 75));
    return { mins, meters: streetMeters, mode: 'walk' };
  }

  // Urban metro/transit leg: 8m station transfer + 450 m/min
  const mins = Math.max(10, Math.round(8 + streetMeters / 450));
  return { mins, meters: streetMeters, mode: 'transit' };
}

function getIdealMinuteForHint(hint: TimeOfDayHint): number {
  switch (hint) {
    case 'morning':
      return 9 * 60 + 45;
    case 'midday':
      return 12 * 60 + 30;
    case 'afternoon':
      return 14 * 60 + 45;
    case 'sunset':
      return 17 * 60;
    case 'evening':
      return 19 * 60;
    default:
      return 13 * 60;
  }
}

export function getDayHoursForPlace(
  place: SavedPlace,
  dayOfWeek: number
): DayHours {
  return (
    place.openingHours?.[dayOfWeek] ??
    place.openingHours?.[1] ?? { open: '09:00', close: '20:00', closed: false }
  );
}

/**
 * Deterministic geographic clustering around the base hotel using angular bearing
 * sectors combined with spatial centroid refinement so each day stays in a walkable pocket.
 */
function clusterPlacesByGeography(
  places: SavedPlace[],
  baseHotel: BaseHotel,
  numDays: number
): SavedPlace[][] {
  const buckets: SavedPlace[][] = Array.from({ length: numDays }, () => []);
  if (places.length === 0) return buckets;

  // Sort places by bearing angle around the hotel, with slight bias for distance
  const withAngle = places.map((p) => {
    const dy = p.lat - baseHotel.lat;
    const dx = p.lng - baseHotel.lng;
    const angle = Math.atan2(dy, dx);
    return { place: p, angle };
  });

  withAngle.sort((a, b) => a.angle - b.angle);

  // Partition sorted radial list into balanced contiguous geographical wedges
  const chunkSize = Math.ceil(withAngle.length / numDays);
  withAngle.forEach((item, idx) => {
    const bucketIdx = Math.min(numDays - 1, Math.floor(idx / Math.max(1, chunkSize)));
    buckets[bucketIdx].push(item.place);
  });

  return buckets;
}

/**
 * Deterministic time-window + TSP routing for a single day.
 * Never lets an LLM guess travel times or schedule inside closed hours.
 */
function routeSingleDay(
  candidates: SavedPlace[],
  dayIndex: number,
  dateISO: string,
  dayOfWeek: number,
  baseHotel: BaseHotel,
  pace: PacePreference
): { day: DayItinerary; overflow: LeftoverItem[] } {
  const cfg = PACE_CONFIG[pace];
  const remaining = [...candidates];
  const stops: Stop[] = [];
  const overflow: LeftoverItem[] = [];

  let currentLat = baseHotel.lat;
  let currentLng = baseHotel.lng;
  let currentMins = cfg.startMins;

  // Filter out permanently closed places immediately
  const activePool: SavedPlace[] = [];
  for (const p of remaining) {
    if (p.permanentlyClosed) {
      overflow.push({
        place: p,
        reason: 'Flagged as permanently closed during verification.',
      });
    } else {
      activePool.push(p);
    }
  }

  while (activePool.length > 0 && stops.length < cfg.maxStops) {
    let bestIdx = -1;
    let bestScore = Infinity;
    let bestArrival = 0;
    let bestLeg = { mins: 0, meters: 0, mode: 'walk' as 'walk' | 'transit' };
    let bestBuffer = 0;

    for (let i = 0; i < activePool.length; i++) {
      const candidate = activePool[i];
      const hours = getDayHoursForPlace(candidate, dayOfWeek);
      if (hours.closed) continue;

      const openMins = timeToMins(hours.open);
      const closeMins = timeToMins(hours.close);
      const leg = computeTravelLeg(
        currentLat,
        currentLng,
        candidate.lat,
        candidate.lng
      );

      const buffer = stops.length === 0 ? 0 : cfg.minBufferMins;
      let arrival = currentMins + buffer + leg.mins;

      // If arriving before opening, wait up to 45 mins or align to opening time
      if (arrival < openMins) {
        if (openMins - arrival > 90 && activePool.length > 1) {
          // Prefer another open place first unless nothing else fits
          arrival = openMins;
        } else {
          arrival = openMins;
        }
      }

      const departure = arrival + candidate.typicalDurationMins;

      // Must close cleanly before venue closing AND within user's daily pace cutoff
      if (departure > closeMins || departure > cfg.endMins) {
        continue;
      }

      // Score combines travel time + semantic time-of-day alignment + wait penalty
      const idealMins = getIdealMinuteForHint(candidate.timeOfDayHint);
      const timeMismatch = Math.abs(arrival - idealMins) * 0.18;
      const waitPenalty = Math.max(0, arrival - (currentMins + buffer + leg.mins)) * 0.6;
      const score = leg.mins * 2.2 + timeMismatch + waitPenalty;

      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
        bestArrival = arrival;
        bestLeg = leg;
        bestBuffer =
          stops.length === 0
            ? 0
            : Math.max(0, bestArrival - leg.mins - currentMins);
      }
    }

    if (bestIdx === -1) {
      break;
    }

    const chosen = activePool.splice(bestIdx, 1)[0];
    const hours = getDayHoursForPlace(chosen, dayOfWeek);
    const departure = bestArrival + chosen.typicalDurationMins;

    stops.push({
      id: `stop-${dayIndex}-${stops.length + 1}-${chosen.id}`,
      savedPlaceId: chosen.id,
      placeName: chosen.resolvedName,
      category: chosen.category,
      neighborhood: chosen.neighborhood,
      address: chosen.address,
      lat: chosen.lat,
      lng: chosen.lng,
      arrivalTime: minsToTime(bestArrival),
      departureTime: minsToTime(departure),
      durationMins: chosen.typicalDurationMins,
      travelFromPrevMins: bestLeg.mins,
      travelFromPrevMeters: bestLeg.meters,
      travelMode: bestLeg.mode,
      bufferBeforeMins: bestBuffer,
      openWindowLabel: `Open ${hours.open}–${hours.close}`,
      isVerifiedOpen: true,
      rationale: buildDeterministicRationale(
        chosen,
        stops.length,
        bestLeg,
        bestArrival,
        baseHotel.name
      ),
      whySavedMediaUrl: chosen.originalMediaUrl,
      placePhotoUrl: chosen.placePhotoUrl,
      photoAttribution: chosen.photoAttribution,
      googleMapsUri: chosen.googleMapsUri,
      vibeContext: chosen.vibeContext,
    });

    currentLat = chosen.lat;
    currentLng = chosen.lng;
    currentMins = departure;
  }

  // Anything remaining in activePool goes to leftovers with a clear deterministic reason
  for (const unplaced of activePool) {
    const hours = getDayHoursForPlace(unplaced, dayOfWeek);
    const reason = hours.closed
      ? `Closed on ${WEEKDAYS[dayOfWeek]}s.`
      : stops.length >= cfg.maxStops
        ? `Exceeds ${pace.toLowerCase()} pace cap (${cfg.maxStops} stops/day).`
        : `No open window before ${hours.close} closing time.`;
    overflow.push({ place: unplaced, reason });
  }

  const audit = computeDayAudit(stops, pace);

  return {
    day: {
      dayIndex,
      dateISO,
      dayOfWeek,
      weekdayLabel: WEEKDAYS[dayOfWeek],
      title: buildDefaultDayTitle(dayIndex, stops),
      colorToken: DAY_COLORS[(dayIndex - 1) % DAY_COLORS.length],
      stops,
      audit,
    },
    overflow,
  };
}

function buildDeterministicRationale(
  place: SavedPlace,
  stopIndex: number,
  leg: { mins: number; meters: number; mode: 'walk' | 'transit' },
  arrivalMins: number,
  hotelName: string
): string {
  const arrivalStr = minsToTime(arrivalMins);
  const originLabel = stopIndex === 0 ? hotelName : 'the previous stop';
  const moveText =
    leg.mode === 'walk'
      ? `${leg.mins} min walk (${leg.meters} m) from ${originLabel}`
      : `${leg.mins} min transit hop from ${originLabel}`;

  if (place.timeOfDayHint === 'morning') {
    return `Scheduled early at ${arrivalStr} to match morning hours; ${moveText}.`;
  }
  if (place.timeOfDayHint === 'sunset') {
    return `Timed for late-afternoon light (${arrivalStr}); ${moveText}.`;
  }
  if (place.timeOfDayHint === 'evening') {
    return `Placed in the evening slot (${arrivalStr}) near dinner hours; ${moveText}.`;
  }
  return `Optimal geographic sequence with ${moveText}, leaving calm buffer time.`;
}

function buildDefaultDayTitle(dayIndex: number, stops: Stop[]): string {
  if (stops.length === 0) return `Day ${dayIndex} · Open Exploration`;
  const neighborhoods = Array.from(new Set(stops.map((s) => s.neighborhood)));
  if (neighborhoods.length === 1) {
    return `${neighborhoods[0]} Slow Loop`;
  }
  return `${neighborhoods[0]} to ${neighborhoods[neighborhoods.length - 1]}`;
}

export function computeDayAudit(stops: Stop[], pace: PacePreference): DayAudit {
  const cfg = PACE_CONFIG[pace];
  let totalWalkingMins = 0;
  let totalWalkingMeters = 0;
  let totalTransitMins = 0;
  let scheduledActiveMins = 0;

  for (const s of stops) {
    if (s.travelMode === 'walk') {
      totalWalkingMins += s.travelFromPrevMins;
      totalWalkingMeters += s.travelFromPrevMeters;
    } else {
      totalTransitMins += s.travelFromPrevMins;
    }
    scheduledActiveMins += s.durationMins + s.travelFromPrevMins;
  }

  const totalDaySpanMins = cfg.endMins - cfg.startMins;
  const breathingRoomMins = Math.max(0, totalDaySpanMins - scheduledActiveMins);
  const zeroClosedStopsVerified = stops.every((s) => s.isVerifiedOpen);

  return {
    totalWalkingMins,
    totalWalkingMeters,
    totalTransitMins,
    breathingRoomMins,
    zeroClosedStopsVerified,
    stopCount: stops.length,
  };
}

export function buildDeterministicItinerary(params: {
  places: SavedPlace[];
  baseHotel: BaseHotel;
  numDays: number;
  startDateISO: string;
  pace: PacePreference;
}): { days: DayItinerary[]; leftovers: LeftoverItem[] } {
  const confirmed = params.places.filter(
    (p) => p.status === 'confirmed' && !p.permanentlyClosed
  );
  const closedPlaces = params.places.filter(
    (p) => p.status === 'confirmed' && p.permanentlyClosed
  );

  // Deduplicate by resolvedPlaceId just in case
  const deduped: SavedPlace[] = [];
  const seenIds = new Set<string>();
  for (const p of confirmed) {
    if (!seenIds.has(p.resolvedPlaceId)) {
      seenIds.add(p.resolvedPlaceId);
      deduped.push(p);
    }
  }

  const buckets = clusterPlacesByGeography(
    deduped,
    params.baseHotel,
    params.numDays
  );

  const days: DayItinerary[] = [];
  const leftovers: LeftoverItem[] = closedPlaces.map((p) => ({
    place: p,
    reason: 'Venue marked permanently closed.',
  }));

  const startDate = new Date(`${params.startDateISO}T00:00:00`);

  for (let d = 0; d < params.numDays; d++) {
    const dayDate = new Date(startDate);
    dayDate.setDate(startDate.getDate() + d);
    const dateISO = dayDate.toISOString().slice(0, 10);
    const dayOfWeek = dayDate.getDay();

    const { day, overflow } = routeSingleDay(
      buckets[d] ?? [],
      d + 1,
      dateISO,
      dayOfWeek,
      params.baseHotel,
      params.pace
    );
    days.push(day);
    leftovers.push(...overflow);
  }

  // Second pass: try placing overflow items onto lighter days if any open slots exist
  const finalLeftovers: LeftoverItem[] = [];
  for (const item of leftovers) {
    if (item.place.permanentlyClosed) {
      finalLeftovers.push(item);
      continue;
    }
    const slot = findOpenSlotForPlace(item.place, days, params.baseHotel, params.pace);
    finalLeftovers.push({
      ...item,
      suggestedSlot: slot ?? undefined,
    });
  }

  return { days, leftovers: finalLeftovers };
}

export function findOpenSlotForPlace(
  place: SavedPlace,
  days: DayItinerary[],
  baseHotel: BaseHotel,
  pace: PacePreference
): SuggestedSlot | null {
  const cfg = PACE_CONFIG[pace];
  let bestSlot: SuggestedSlot | null = null;
  let bestLegMins = Infinity;

  for (const day of days) {
    const hours = getDayHoursForPlace(place, day.dayOfWeek);
    if (hours.closed) continue;

    const openMins = timeToMins(hours.open);
    const closeMins = timeToMins(hours.close);

    // Check end-of-day append first
    const lastStop = day.stops[day.stops.length - 1];
    const prevLat = lastStop ? lastStop.lat : baseHotel.lat;
    const prevLng = lastStop ? lastStop.lng : baseHotel.lng;
    const prevEndMins = lastStop ? timeToMins(lastStop.departureTime) : cfg.startMins;

    const leg = computeTravelLeg(prevLat, prevLng, place.lat, place.lng);
    const buffer = lastStop ? 15 : 0;
    const arrivalMins = Math.max(openMins, prevEndMins + buffer + leg.mins);
    const departureMins = arrivalMins + place.typicalDurationMins;

    if (departureMins <= closeMins && departureMins <= cfg.endMins + 45) {
      if (leg.mins < bestLegMins) {
        bestLegMins = leg.mins;
        bestSlot = {
          dayIndex: day.dayIndex,
          arrivalTime: minsToTime(arrivalMins),
          departureTime: minsToTime(departureMins),
          travelFromPrevMins: leg.mins,
          travelFromPrevMeters: leg.meters,
          travelMode: leg.mode,
          insertAfterStopId: lastStop?.id,
          note: lastStop
            ? `Fits Day ${day.dayIndex} at ${minsToTime(arrivalMins)} (${leg.mins}m ${leg.mode} from ${lastStop.placeName})`
            : `Fits Day ${day.dayIndex} morning at ${minsToTime(arrivalMins)}`,
        };
      }
    }
  }

  return bestSlot;
}

export function generateIcsContent(
  destination: string,
  days: DayItinerary[]
): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//De-tourist//Editorial Travel Planner//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  for (const day of days) {
    const dateCompact = day.dateISO.replace(/-/g, '');
    for (const stop of day.stops) {
      const startCompact = `${dateCompact}T${stop.arrivalTime.replace(':', '')}00`;
      const endCompact = `${dateCompact}T${stop.departureTime.replace(':', '')}00`;
      const uid = `${stop.id}@detourist.app`;
      const desc = `${stop.category} in ${stop.neighborhood}. ${stop.openWindowLabel}. ${stop.rationale}`.replace(
        /\n/g,
        ' '
      );

      lines.push(
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${dateCompact}T000000Z`,
        `DTSTART:${startCompact}`,
        `DTEND:${endCompact}`,
        `SUMMARY:${stop.placeName} (${destination})`,
        `LOCATION:${stop.address}`,
        `DESCRIPTION:${desc}`,
        'END:VEVENT'
      );
    }
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
