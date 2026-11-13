export type PlaceCategory =
  | 'Cafe'
  | 'Restaurant'
  | 'Museum'
  | 'Viewpoint'
  | 'Market'
  | 'Shop'
  | 'Park';

export type TimeOfDayHint =
  | 'morning'
  | 'midday'
  | 'afternoon'
  | 'sunset'
  | 'evening'
  | 'any';

export type PacePreference = 'Relaxed' | 'Balanced' | 'Packed';

export type InputSourceType =
  | 'screenshot'
  | 'text'
  | 'youtube'
  | 'takeout'
  | 'google_maps';

export interface DayHours {
  open: string; // HH:mm 24h
  close: string; // HH:mm 24h
  closed?: boolean;
}

export interface PhotoAttribution {
  displayName: string;
  uri?: string;
}

export interface DisambiguationCandidate {
  placeId: string;
  name: string;
  neighborhood: string;
  address: string;
  lat: number;
  lng: number;
  confidence: number; // 0-100
  rating?: number;
  priceLevel?: number; // 1-4
  hoursSummary: string;
  openingHours: Record<number, DayHours>;
  placePhotoUrl?: string;
  photoAttribution?: PhotoAttribution;
  googleMapsUri?: string;
}

export interface SavedPlace {
  id: string;
  rawInputType: InputSourceType;
  rawSourceLabel: string;
  originalMediaUrl?: string;
  placePhotoUrl?: string;
  photoAttribution?: PhotoAttribution;
  googleMapsUri?: string;
  extractedName: string;
  locationHint: string;
  category: PlaceCategory;
  vibeContext: string;
  timeOfDayHint: TimeOfDayHint;
  typicalDurationMins: number;
  confidence: number; // 0-100
  status: 'needs_confirmation' | 'confirmed' | 'duplicate_merged';
  resolvedPlaceId: string;
  resolvedName: string;
  address: string;
  neighborhood: string;
  lat: number;
  lng: number;
  hoursSummary: string;
  openingHours: Record<number, DayHours>;
  priceLevel: number;
  permanentlyClosed: boolean;
  candidates?: DisambiguationCandidate[];
}

export interface Stop {
  id: string;
  savedPlaceId: string;
  placeName: string;
  category: PlaceCategory;
  neighborhood: string;
  address: string;
  lat: number;
  lng: number;
  arrivalTime: string; // HH:mm
  departureTime: string; // HH:mm
  durationMins: number;
  travelFromPrevMins: number;
  travelFromPrevMeters: number;
  travelMode: 'walk' | 'transit';
  bufferBeforeMins: number;
  openWindowLabel: string;
  isVerifiedOpen: boolean;
  rationale: string;
  whySavedMediaUrl?: string;
  placePhotoUrl?: string;
  photoAttribution?: PhotoAttribution;
  googleMapsUri?: string;
  vibeContext?: string;
}

export interface DayAudit {
  totalWalkingMins: number;
  totalWalkingMeters: number;
  totalTransitMins: number;
  breathingRoomMins: number;
  zeroClosedStopsVerified: boolean;
  stopCount: number;
}

export type DayColorToken = 'terracotta' | 'sage' | 'sky' | 'sun';

export interface DayItinerary {
  dayIndex: number;
  dateISO: string;
  dayOfWeek: number; // 0-6
  weekdayLabel: string;
  title: string;
  colorToken: DayColorToken;
  stops: Stop[];
  audit: DayAudit;
}

export interface SuggestedSlot {
  dayIndex: number;
  arrivalTime: string;
  departureTime: string;
  travelFromPrevMins: number;
  travelFromPrevMeters: number;
  travelMode: 'walk' | 'transit';
  insertAfterStopId?: string;
  note: string;
}

export interface LeftoverItem {
  place: SavedPlace;
  reason: string;
  suggestedSlot?: SuggestedSlot;
}

export interface BaseHotel {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export interface Trip {
  id: string;
  destination: string;
  startDateISO: string;
  numDays: number;
  pace: PacePreference;
  baseHotel: BaseHotel;
  savedPlaces: SavedPlace[];
  days: DayItinerary[];
  leftovers: LeftoverItem[];
}
