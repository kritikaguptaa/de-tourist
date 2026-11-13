import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import {
  buildDeterministicItinerary,
  computeDayAudit,
  findOpenSlotForPlace,
  generateIcsContent,
} from './server/planner.ts';
import {
  loadStoredTrip,
  saveStoredTrip,
  type StoredTripState,
} from './server/storage.ts';
import type {
  BaseHotel,
  DayHours,
  DayItinerary,
  InputSourceType,
  PacePreference,
  PlaceCategory,
  SavedPlace,
  TimeOfDayHint,
} from './src/types/trip.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function buildStandardHours(
  open: string,
  close: string,
  closedDay?: number
): Record<number, DayHours> {
  const hours: Record<number, DayHours> = {};
  for (let d = 0; d <= 6; d++) {
    hours[d] = {
      open,
      close,
      closed: closedDay === d,
    };
  }
  return hours;
}

function normalizeCategory(raw?: string): PlaceCategory {
  const val = (raw || '').toLowerCase();
  if (val.includes('cafe') || val.includes('coffee') || val.includes('tea')) {
    return 'Cafe';
  }
  if (val.includes('museum') || val.includes('gallery') || val.includes('art')) {
    return 'Museum';
  }
  if (val.includes('view') || val.includes('tower') || val.includes('sunset')) {
    return 'Viewpoint';
  }
  if (val.includes('market') || val.includes('alley')) {
    return 'Market';
  }
  if (val.includes('park') || val.includes('garden') || val.includes('shrine')) {
    return 'Park';
  }
  if (val.includes('shop') || val.includes('book') || val.includes('vinyl')) {
    return 'Shop';
  }
  return 'Restaurant';
}

function normalizeTimeHint(raw?: string): TimeOfDayHint {
  const val = (raw || '').toLowerCase();
  if (val.includes('morn') || val.includes('brunch') || val.includes('breakfast')) {
    return 'morning';
  }
  if (val.includes('mid') || val.includes('lunch')) return 'midday';
  if (val.includes('after')) return 'afternoon';
  if (val.includes('sun') || val.includes('dusk')) return 'sunset';
  if (val.includes('even') || val.includes('night') || val.includes('dinner')) {
    return 'evening';
  }
  return 'any';
}

interface GeminiExtractedItem {
  extractedName: string;
  locationHint: string;
  category: string;
  vibeContext: string;
  timeOfDayHint: string;
  typicalDurationMins: number;
  confidence: number;
  resolvedName: string;
  neighborhood: string;
  address: string;
  lat: number;
  lng: number;
  openTime: string;
  closeTime: string;
  priceLevel: number;
  candidates?: Array<{
    name: string;
    neighborhood: string;
    address: string;
    lat: number;
    lng: number;
    confidence: number;
    openTime: string;
    closeTime: string;
  }>;
}

const EXTRACTION_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      extractedName: { type: Type.STRING },
      locationHint: { type: Type.STRING },
      category: {
        type: Type.STRING,
        description: 'One of Cafe, Restaurant, Museum, Viewpoint, Market, Shop, Park',
      },
      vibeContext: { type: Type.STRING },
      timeOfDayHint: {
        type: Type.STRING,
        description: 'One of morning, midday, afternoon, sunset, evening, any',
      },
      typicalDurationMins: { type: Type.INTEGER },
      confidence: {
        type: Type.INTEGER,
        description: '0 to 100 confidence that this resolves unambiguously in the destination city',
      },
      resolvedName: { type: Type.STRING },
      neighborhood: { type: Type.STRING },
      address: { type: Type.STRING },
      lat: { type: Type.NUMBER },
      lng: { type: Type.NUMBER },
      openTime: { type: Type.STRING, description: 'HH:mm 24-hour format' },
      closeTime: { type: Type.STRING, description: 'HH:mm 24-hour format' },
      priceLevel: { type: Type.INTEGER, description: '1 to 4' },
      candidates: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            neighborhood: { type: Type.STRING },
            address: { type: Type.STRING },
            lat: { type: Type.NUMBER },
            lng: { type: Type.NUMBER },
            confidence: { type: Type.INTEGER },
            openTime: { type: Type.STRING },
            closeTime: { type: Type.STRING },
          },
        },
      },
    },
    required: [
      'extractedName',
      'locationHint',
      'category',
      'vibeContext',
      'timeOfDayHint',
      'typicalDurationMins',
      'confidence',
      'resolvedName',
      'neighborhood',
      'address',
      'lat',
      'lng',
      'openTime',
      'closeTime',
    ],
  },
};

function mapExtractedToSavedPlace(
  item: GeminiExtractedItem,
  rawInputType: InputSourceType,
  rawSourceLabel: string,
  originalMediaUrl?: string
): SavedPlace {
  const confidence = Math.max(35, Math.min(99, Math.round(item.confidence || 80)));
  const open = /^\d{2}:\d{2}$/.test(item.openTime) ? item.openTime : '09:30';
  const close = /^\d{2}:\d{2}$/.test(item.closeTime) ? item.closeTime : '20:00';
  const slug = item.resolvedName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const resolvedPlaceId = `place-${slug}-${Math.round(item.lat * 1000)}`;

  const candidates =
    confidence < 85
      ? (item.candidates && item.candidates.length > 0
          ? item.candidates
          : [
              {
                name: item.resolvedName,
                neighborhood: item.neighborhood,
                address: item.address,
                lat: item.lat,
                lng: item.lng,
                confidence,
                openTime: open,
                closeTime: close,
              },
              {
                name: `${item.extractedName} (${item.locationHint || 'Central'} Branch)`,
                neighborhood: item.locationHint || 'Central',
                address: `${item.locationHint || 'Central'}, ${item.address}`,
                lat: item.lat + 0.012,
                lng: item.lng - 0.011,
                confidence: Math.max(30, confidence - 14),
                openTime: open,
                closeTime: close,
              },
            ]
        ).map((c, idx) => ({
          placeId: `${resolvedPlaceId}-cand-${idx}`,
          name: c.name,
          neighborhood: c.neighborhood,
          address: c.address,
          lat: c.lat,
          lng: c.lng,
          confidence: c.confidence,
          priceLevel: item.priceLevel || 2,
          hoursSummary: `${c.openTime || open}–${c.closeTime || close}`,
          openingHours: buildStandardHours(
            c.openTime || open,
            c.closeTime || close
          ),
        }))
      : undefined;

  return {
    id: `save-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    rawInputType,
    rawSourceLabel,
    originalMediaUrl,
    extractedName: item.extractedName,
    locationHint: item.locationHint || item.neighborhood,
    category: normalizeCategory(item.category),
    vibeContext: item.vibeContext || 'Saved from travel notes',
    timeOfDayHint: normalizeTimeHint(item.timeOfDayHint),
    typicalDurationMins: Math.max(
      25,
      Math.min(180, Number(item.typicalDurationMins) || 60)
    ),
    confidence,
    status: confidence >= 85 ? 'confirmed' : 'needs_confirmation',
    resolvedPlaceId,
    resolvedName: item.resolvedName,
    address: item.address,
    neighborhood: item.neighborhood,
    lat: item.lat,
    lng: item.lng,
    hoursSummary: `${open}–${close}`,
    openingHours: buildStandardHours(open, close),
    priceLevel: Math.max(1, Math.min(4, Number(item.priceLevel) || 2)),
    permanentlyClosed: false,
    candidates,
  };
}

function fallbackExtractText(
  text: string,
  destination: string,
  baseHotel: BaseHotel
): SavedPlace[] {
  const lines = text
    .split(/[\n,;]+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 2);

  return lines.slice(0, 6).map((line, i) => {
    const lower = line.toLowerCase();
    const isCoffee =
      lower.includes('coffee') || lower.includes('cafe') || lower.includes('kissa');
    const isRamen = lower.includes('ramen') || lower.includes('food');
    const isSunset = lower.includes('sunset') || lower.includes('view');
    const isAmbiguous = line.split(' ').length <= 2 || lower.includes('blue bottle');

    const latOffset = ((i % 3) - 1) * 0.011 + 0.004;
    const lngOffset = (Math.floor(i / 3) - 0.5) * 0.014;

    return mapExtractedToSavedPlace(
      {
        extractedName: line,
        locationHint: destination.split(',')[0],
        category: isCoffee
          ? 'Cafe'
          : isSunset
            ? 'Viewpoint'
            : isRamen
              ? 'Restaurant'
              : 'Shop',
        vibeContext: isSunset
          ? 'Best around golden hour'
          : isCoffee
            ? 'Quiet morning stop'
            : 'Local favorite from note',
        timeOfDayHint: isCoffee ? 'morning' : isSunset ? 'sunset' : 'midday',
        typicalDurationMins: isCoffee ? 45 : 65,
        confidence: isAmbiguous ? 72 : 90,
        resolvedName: line,
        neighborhood: destination.split(',')[0],
        address: `${destination}`,
        lat: Number((baseHotel.lat + latOffset).toFixed(5)),
        lng: Number((baseHotel.lng + lngOffset).toFixed(5)),
        openTime: isCoffee ? '08:30' : '11:00',
        closeTime: isSunset ? '19:30' : '21:00',
        priceLevel: 2,
      },
      'text',
      `Note: "${line.slice(0, 32)}"`
    );
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      aiConfigured: Boolean(getGeminiClient()),
    });
  });

  app.get('/api/trip', async (_req, res) => {
    const stored = await loadStoredTrip();
    res.json({ trip: stored });
  });

  app.put('/api/trip', async (req, res) => {
    try {
      const payload = req.body as StoredTripState;
      await saveStoredTrip(payload);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({
        error:
          error instanceof Error ? error.message : 'Failed to store trip.',
      });
    }
  });

  // Step 2 & 3: Vision + Text Extraction and Destination-Anchored Resolution
  app.post('/api/extract', async (req, res) => {
    try {
      const {
        images = [],
        text = '',
        destination = 'Tokyo, Japan',
        baseHotel = {
          name: 'Shibuya Granbell Hotel',
          address: '15-17 Sakuragaokacho, Shibuya',
          lat: 35.6562,
          lng: 139.6994,
        },
        inputType = 'text',
      } = req.body as {
        images?: Array<{ dataUrl: string; mimeType: string; fileName: string }>;
        text?: string;
        destination?: string;
        baseHotel?: BaseHotel;
        inputType?: InputSourceType;
      };

      const ai = getGeminiClient();
      const extractedPlaces: SavedPlace[] = [];

      if (ai) {
        // Process uploaded screenshots individually so each preserves its own originalMediaUrl
        for (const img of images) {
          const base64 = img.dataUrl.includes(',')
            ? img.dataUrl.split(',')[1]
            : img.dataUrl;

          const prompt = `Analyze this travel screenshot or photo. Extract the place(s) the traveler saved, anchored to the destination "${destination}" (near base coordinates ${baseHotel.lat}, ${baseHotel.lng}).
If the place name is ambiguous (e.g. a chain like Blue Bottle or generic label), set confidence below 85 and return 2-3 plausible candidates in "${destination}".
Return realistic coordinates near ${destination}, realistic opening/closing times (HH:mm), category, and vibe/context notes.`;

          const response = await ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType: img.mimeType || 'image/jpeg',
                    data: base64,
                  },
                },
                { text: prompt },
              ],
            },
            config: {
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              responseMimeType: 'application/json',
              responseSchema: EXTRACTION_SCHEMA,
            },
          });

          const parsed = JSON.parse(
            (response.text ?? '[]').trim()
          ) as GeminiExtractedItem[];

          for (const item of parsed) {
            extractedPlaces.push(
              mapExtractedToSavedPlace(
                item,
                'screenshot',
                img.fileName || 'Screenshot upload',
                img.dataUrl
              )
            );
          }
        }

        if (text.trim()) {
          const prompt = `Extract all travel places mentioned in this user note or export, anchored strictly to "${destination}" (center lat ${baseHotel.lat}, lng ${baseHotel.lng}).
Input:
"""
${text}
"""
For ambiguous names (e.g., chain coffee shops or vague descriptions like "ramen place near Shibuya"), set confidence < 85 and provide 2-3 real candidate locations in "${destination}". For specific named landmarks or unique shops, set confidence >= 88. Return realistic lat/lng, neighborhood, opening hours, and typical visit duration in minutes.`;

          const response = await ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: prompt,
            config: {
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              responseMimeType: 'application/json',
              responseSchema: EXTRACTION_SCHEMA,
            },
          });

          const parsed = JSON.parse(
            (response.text ?? '[]').trim()
          ) as GeminiExtractedItem[];

          for (const item of parsed) {
            extractedPlaces.push(
              mapExtractedToSavedPlace(
                item,
                inputType,
                inputType === 'takeout'
                  ? 'Maps Takeout / List Import'
                  : `Note: "${text.slice(0, 38).trim()}"`
              )
            );
          }
        }
      } else {
        if (text.trim()) {
          extractedPlaces.push(
            ...fallbackExtractText(text, destination, baseHotel)
          );
        }
        for (const img of images) {
          const cleanName = img.fileName
            .replace(/\.[^/.]+$/, '')
            .replace(/[_-]+/g, ' ');
          extractedPlaces.push(
            mapExtractedToSavedPlace(
              {
                extractedName: cleanName || 'Saved Screenshot Spot',
                locationHint: destination.split(',')[0],
                category: 'Cafe',
                vibeContext: 'Captured from screenshot upload',
                timeOfDayHint: 'afternoon',
                typicalDurationMins: 55,
                confidence: 76,
                resolvedName: cleanName || 'Saved Spot',
                neighborhood: destination.split(',')[0],
                address: destination,
                lat: Number((baseHotel.lat + 0.008).toFixed(5)),
                lng: Number((baseHotel.lng + 0.009).toFixed(5)),
                openTime: '10:00',
                closeTime: '20:00',
                priceLevel: 2,
              },
              'screenshot',
              img.fileName,
              img.dataUrl
            )
          );
        }
      }

      res.json({
        places: extractedPlaces,
        aiUsed: Boolean(ai),
      });
    } catch (error) {
      console.error('Extraction error:', error);
      const message =
        error instanceof Error ? error.message : 'Failed to extract places.';
      res.status(500).json({ error: message });
    }
  });

  // Secondary Input: YouTube / Web URL metadata + Gemini extraction
  app.post('/api/extract-url', async (req, res) => {
    try {
      const {
        url,
        destination = 'Tokyo, Japan',
        baseHotel = {
          name: 'Shibuya Granbell Hotel',
          address: '15-17 Sakuragaokacho, Shibuya',
          lat: 35.6562,
          lng: 139.6994,
        },
      } = req.body as {
        url: string;
        destination?: string;
        baseHotel?: BaseHotel;
      };

      if (!url || !url.trim()) {
        res.status(400).json({ error: 'Please provide a valid URL.' });
        return;
      }

      let fetchedTitle = '';
      let fetchedAuthor = '';
      let thumbnailUrl: string | undefined;

      if (url.includes('youtube.com') || url.includes('youtu.be')) {
        try {
          const oembedRes = await fetch(
            `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
          );
          if (oembedRes.ok) {
            const data = (await oembedRes.json()) as {
              title?: string;
              author_name?: string;
              thumbnail_url?: string;
            };
            fetchedTitle = data.title || '';
            fetchedAuthor = data.author_name || '';
            thumbnailUrl = data.thumbnail_url;
          }
        } catch {
          // Continue with URL slug fallback
        }
      }

      const ai = getGeminiClient();
      const contextSummary = fetchedTitle
        ? `YouTube Video Title: "${fetchedTitle}" by ${fetchedAuthor} (URL: ${url})`
        : `Travel Video/Article URL: ${url}`;

      let places: SavedPlace[] = [];
      if (ai) {
        const prompt = `A traveler saved this link for their trip to "${destination}" (center ${baseHotel.lat}, ${baseHotel.lng}):
${contextSummary}

Infer 2-3 specific, realistic places featured or likely referenced in this travel save within "${destination}". Include realistic coordinates, neighborhoods, opening hours, vibe/context, and confidence scores (use < 85 if the link title is broad and needs user confirmation).`;

        const response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: prompt,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: EXTRACTION_SCHEMA,
          },
        });

        const parsed = JSON.parse(
          (response.text ?? '[]').trim()
        ) as GeminiExtractedItem[];

        places = parsed.map((item) =>
          mapExtractedToSavedPlace(
            item,
            'youtube',
            fetchedTitle || url,
            thumbnailUrl
          )
        );
      } else {
        places = fallbackExtractText(
          fetchedTitle || url,
          destination,
          baseHotel
        ).map((p) => ({
          ...p,
          rawInputType: 'youtube',
          rawSourceLabel: fetchedTitle || url,
          originalMediaUrl: thumbnailUrl,
        }));
      }

      res.json({
        places,
        metadata: { title: fetchedTitle || url, author: fetchedAuthor, thumbnailUrl },
      });
    } catch (error) {
      console.error('URL extraction error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to parse URL.',
      });
    }
  });

  // Step 5 & 6: Hybrid Planning Engine (Deterministic Routing + Soft LLM Layer)
  app.post('/api/plan', async (req, res) => {
    try {
      const {
        places = [],
        baseHotel,
        numDays = 3,
        startDateISO = new Date().toISOString().slice(0, 10),
        pace = 'Balanced',
        destination = 'Tokyo, Japan',
      } = req.body as {
        places: SavedPlace[];
        baseHotel: BaseHotel;
        numDays: number;
        startDateISO: string;
        pace: PacePreference;
        destination: string;
      };

      const { days, leftovers } = buildDeterministicItinerary({
        places,
        baseHotel,
        numDays,
        startDateISO,
        pace,
      });

      // Soft LLM Layer: generate editorial day titles and natural explanations WITHOUT modifying any times/routes
      const ai = getGeminiClient();
      if (ai && days.some((d) => d.stops.length > 0)) {
        try {
          const summaryPayload = days.map((d) => ({
            dayIndex: d.dayIndex,
            weekday: d.weekdayLabel,
            stops: d.stops.map((s) => ({
              id: s.id,
              name: s.placeName,
              neighborhood: s.neighborhood,
              arrivalTime: s.arrivalTime,
              departureTime: s.departureTime,
              travelFromPrevMins: s.travelFromPrevMins,
              travelMode: s.travelMode,
              openWindowLabel: s.openWindowLabel,
              vibeContext: s.vibeContext,
            })),
          }));

          const response = await ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: `You are the editorial copywriter for De-tourist, a calm slow-travel itinerary planner for ${destination} (Pace: ${pace}, Hotel: ${baseHotel.name}).
Given this ALREADY-ROUTED deterministic schedule, write:
1. A warm, evocative 4-6 word day title for each day (no day number prefix).
2. A concise 1-sentence plain-language explanation for each stop explaining why its slot and sequence work well (referencing real arrival time, travel minutes, or vibe). Do NOT invent or change any times.

Schedule JSON:
${JSON.stringify(summaryPayload)}`,
            config: {
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    dayIndex: { type: Type.INTEGER },
                    title: { type: Type.STRING },
                    stopRationales: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          stopId: { type: Type.STRING },
                          rationale: { type: Type.STRING },
                        },
                        required: ['stopId', 'rationale'],
                      },
                    },
                  },
                  required: ['dayIndex', 'title', 'stopRationales'],
                },
              },
            },
          });

          const copyUpdates = JSON.parse(
            (response.text ?? '[]').trim()
          ) as Array<{
            dayIndex: number;
            title: string;
            stopRationales: Array<{ stopId: string; rationale: string }>;
          }>;

          for (const upd of copyUpdates) {
            const targetDay = days.find((d) => d.dayIndex === upd.dayIndex);
            if (!targetDay) continue;
            if (upd.title) targetDay.title = upd.title;
            for (const sr of upd.stopRationales || []) {
              const targetStop = targetDay.stops.find((s) => s.id === sr.stopId);
              if (targetStop && sr.rationale) {
                targetStop.rationale = sr.rationale;
              }
            }
          }
        } catch (llmErr) {
          // Soft LLM layer degrades cleanly to deterministic rationales
          console.warn('Soft LLM layer skipped:', llmErr);
        }
      }

      res.json({ days, leftovers });
    } catch (error) {
      console.error('Plan error:', error);
      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : 'Failed to generate itinerary.',
      });
    }
  });

  // Step 7: Suggest open slot for a Leftover item
  app.post('/api/suggest-slot', (req, res) => {
    const { place, days, baseHotel, pace } = req.body as {
      place: SavedPlace;
      days: DayItinerary[];
      baseHotel: BaseHotel;
      pace: PacePreference;
    };

    const slot = findOpenSlotForPlace(place, days, baseHotel, pace);
    res.json({ slot });
  });

  // Recalculate day audit when stops are modified manually
  app.post('/api/audit-day', (req, res) => {
    const { day, pace } = req.body as {
      day: DayItinerary;
      pace: PacePreference;
    };
    const audit = computeDayAudit(day.stops, pace);
    res.json({ audit });
  });

  // Step 7: Export RFC 5545 .ics calendar file
  app.post('/api/export/ics', (req, res) => {
    const { destination, days } = req.body as {
      destination: string;
      days: DayItinerary[];
    };
    const ics = generateIcsContent(destination || 'Trip', days || []);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="detourist-itinerary.ics"'
    );
    res.send(ics);
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`De-tourist server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
