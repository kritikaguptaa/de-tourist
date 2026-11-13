import fs from 'node:fs/promises';
import path from 'node:path';
import type { BaseHotel, PacePreference, SavedPlace } from '../src/types/trip.ts';

export interface StoredTripState {
  destination: string;
  baseHotel: BaseHotel;
  numDays: number;
  pace: PacePreference;
  startDateISO: string;
  savedPlaces: SavedPlace[];
  updatedAt: string;
}

const DATA_FILE = path.join(process.cwd(), '.detourist-trip.json');

export async function loadStoredTrip(): Promise<StoredTripState | null> {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(raw) as StoredTripState;
  } catch {
    return null;
  }
}

export async function saveStoredTrip(state: StoredTripState): Promise<void> {
  await fs.writeFile(
    DATA_FILE,
    JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2),
    'utf8'
  );
}
