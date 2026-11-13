import {
  ArrowRight,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  FileJson,
  Link2,
  MapPin,
  Minus,
  Plus,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { useRef, useState } from 'react';
import type {
  BaseHotel,
  InputSourceType,
  PhotoAttribution,
  SavedPlace,
} from '../types/trip';

interface ScrapbookScreenProps {
  destination: string;
  baseHotel: BaseHotel;
  savedPlaces: SavedPlace[];
  isExtracting: boolean;
  extractError: string | null;
  dedupeNotice: string | null;
  isPlanning: boolean;
  onExtractImages: (
    files: Array<{ dataUrl: string; mimeType: string; fileName: string }>
  ) => Promise<void>;
  onExtractText: (text: string, mode: InputSourceType) => Promise<void>;
  onExtractUrl: (url: string) => Promise<void>;
  onConfirmCandidate: (placeId: string, candidateIndex: number) => void;
  onDismissPlace: (placeId: string) => void;
  onUpdateDuration: (placeId: string, deltaMins: number) => void;
  onBuildItinerary: () => void;
}

type CaptureTab = 'screenshots' | 'note' | 'url';

function PolaroidThumbnail({
  mediaUrl,
  placePhotoUrl,
  photoAttribution,
  alt,
  category,
  neighborhood,
  sourceType,
}: {
  mediaUrl?: string;
  placePhotoUrl?: string;
  photoAttribution?: PhotoAttribution;
  alt: string;
  category: string;
  neighborhood: string;
  sourceType: InputSourceType;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const [preferPlacePhoto, setPreferPlacePhoto] = useState(true);

  const hasBoth = Boolean(
    mediaUrl && placePhotoUrl && mediaUrl !== placePhotoUrl
  );
  const activeUrl =
    preferPlacePhoto && placePhotoUrl
      ? placePhotoUrl
      : mediaUrl || placePhotoUrl;

  if (activeUrl && !imgFailed) {
    return (
      <div className="space-y-1">
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-sm bg-[#FAF7F2] border border-[#E6DFD3]">
          <img
            src={activeUrl}
            alt={alt}
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover saturate-[0.94] contrast-[0.98]"
          />
          {hasBoth && (
            <button
              type="button"
              onClick={() => setPreferPlacePhoto((p) => !p)}
              className="absolute bottom-2 right-2 px-2 py-1 text-[10px] font-mono bg-[#111827]/80 text-white rounded hover:bg-[#111827] cursor-pointer"
            >
              {preferPlacePhoto ? 'Show Screenshot' : 'Show Maps Photo'}
            </button>
          )}
        </div>
        {(!hasBoth || preferPlacePhoto) && photoAttribution?.displayName && (
          <p className="font-mono text-[10px] text-[#8A726C] truncate">
            Photo:{' '}
            {photoAttribution.uri ? (
              <a
                href={photoAttribution.uri}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-[#111827]"
              >
                {photoAttribution.displayName}
              </a>
            ) : (
              photoAttribution.displayName
            )}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="aspect-[4/3] w-full rounded-sm bg-[#FAF7F2] border border-[#E6DFD3] p-4 flex flex-col justify-between">
      <div className="flex items-center justify-between font-mono text-[10px] tracking-wider uppercase text-[#57423D]">
        <span>{sourceType.replace('_', ' ')} save</span>
        <span>{neighborhood}</span>
      </div>
      <div className="my-auto text-center px-2">
        <MapPin
          className="w-5 h-5 text-[#E26D4F] mx-auto mb-1.5"
          aria-hidden="true"
        />
        <p className="font-serif text-base text-[#111827] leading-snug line-clamp-2">
          {alt}
        </p>
      </div>
      <div className="font-mono text-[10px] text-[#57423D] text-center border-t border-dashed border-[#E6DFD3] pt-2">
        {category}
      </div>
    </div>
  );
}

export function ScrapbookScreen({
  destination,
  baseHotel,
  savedPlaces,
  isExtracting,
  extractError,
  dedupeNotice,
  isPlanning,
  onExtractImages,
  onExtractText,
  onExtractUrl,
  onConfirmCandidate,
  onDismissPlace,
  onUpdateDuration,
  onBuildItinerary,
}: ScrapbookScreenProps) {
  const [captureTab, setCaptureTab] = useState<CaptureTab>('screenshots');
  const [noteInput, setNoteInput] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [takeoutMode, setTakeoutMode] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedCandidates, setSelectedCandidates] = useState<
    Record<string, number>
  >({});
  const [triageIndex, setTriageIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const needsReview = savedPlaces.filter(
    (p) => p.status === 'needs_confirmation'
  );
  const confirmed = savedPlaces.filter((p) => p.status === 'confirmed');

  const safeTriageIdx =
    needsReview.length > 0 ? triageIndex % needsReview.length : 0;
  const activeReviewItem = needsReview[safeTriageIdx];

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList).slice(0, 4);
    const encoded = await Promise.all(
      files.map(
        (file) =>
          new Promise<{ dataUrl: string; mimeType: string; fileName: string }>(
            (resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () =>
                resolve({
                  dataUrl: String(reader.result || ''),
                  mimeType: file.type || 'image/jpeg',
                  fileName: file.name,
                });
              reader.onerror = reject;
              reader.readAsDataURL(file);
            }
          )
      )
    );
    await onExtractImages(encoded);
  };

  const handleNoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteInput.trim() || isExtracting) return;
    await onExtractText(noteInput.trim(), takeoutMode ? 'takeout' : 'text');
    setNoteInput('');
  };

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim() || isExtracting) return;
    await onExtractUrl(urlInput.trim());
    setUrlInput('');
  };

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Editorial Section Lead */}
      <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#E6DFD3] pb-6">
        <div>
          <p className="font-mono text-xs tracking-wider uppercase text-[#57423D] mb-2">
            Step 01 — Capture &amp; Disambiguate · {destination}
          </p>
          <h1 className="font-serif text-3xl sm:text-4xl font-semibold text-[#111827] tracking-tight text-balance">
            From scattered saves to verified places.
          </h1>
        </div>
        <p className="text-sm text-[#57423D] max-w-md leading-relaxed">
          Drop travel screenshots, paste quick notes, or share a YouTube guide.
          Ambiguous spots surface here for single-click confirmation before any
          routing begins.
        </p>
      </div>

      {/* 12-Column Scrapbook & Disambiguation Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* LEFT 7 COLS: Ingestion Dock + Scattered Polaroid Grid */}
        <div className="lg:col-span-7 space-y-8">
          {/* Ingestion Dock */}
          <section
            aria-label="Add travel saves"
            className="paper-card rounded-lg p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div
                role="tablist"
                aria-label="Input method"
                className="inline-flex flex-wrap items-center gap-1 p-1 bg-[#FAF7F2] border border-[#E6DFD3] rounded-md"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={captureTab === 'screenshots'}
                  onClick={() => setCaptureTab('screenshots')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    captureTab === 'screenshots'
                      ? 'bg-white text-[#111827] shadow-xs'
                      : 'text-[#57423D] hover:text-[#111827]'
                  }`}
                >
                  <Camera className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Screenshots</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={captureTab === 'note'}
                  onClick={() => setCaptureTab('note')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    captureTab === 'note'
                      ? 'bg-white text-[#111827] shadow-xs'
                      : 'text-[#57423D] hover:text-[#111827]'
                  }`}
                >
                  <FileJson className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Notes / List</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={captureTab === 'url'}
                  onClick={() => setCaptureTab('url')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    captureTab === 'url'
                      ? 'bg-white text-[#111827] shadow-xs'
                      : 'text-[#57423D] hover:text-[#111827]'
                  }`}
                >
                  <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>YouTube URL</span>
                </button>
              </div>

              <span className="font-mono text-[11px] text-[#57423D] tabular-nums">
                ANCHORED TO {destination.toUpperCase()}
              </span>
            </div>

            {captureTab === 'screenshots' && (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  void handleFiles(e.dataTransfer.files);
                }}
                className={`border border-dashed rounded-lg p-6 text-center transition-colors ${
                  isDragging
                    ? 'border-[#E26D4F] bg-[#E26D4F]/5'
                    : 'border-[#E6DFD3] bg-[#FAF7F2]/60'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => void handleFiles(e.target.files)}
                  className="hidden"
                />
                <Upload
                  className="w-6 h-6 text-[#E26D4F] mx-auto mb-2"
                  aria-hidden="true"
                />
                <p className="text-sm font-medium text-[#111827]">
                  Drop Instagram, TikTok, or Google Maps screenshots here
                </p>
                <p className="text-xs text-[#57423D] mt-1 mb-4">
                  Vision extraction reads place names, neighborhoods, and
                  time-of-day hints while keeping your screenshot attached.
                </p>
                <button
                  type="button"
                  disabled={isExtracting}
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 text-xs font-medium text-[#111827] bg-white border border-[#E6DFD3] hover:border-[#E26D4F] rounded transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isExtracting
                    ? 'Extracting place details...'
                    : 'Choose Image Files'}
                </button>
              </div>
            )}

            {captureTab === 'note' && (
              <form onSubmit={handleNoteSubmit} className="space-y-3">
                <textarea
                  rows={3}
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  placeholder={`e.g. "Senso-ji Temple, Meiji Jingu, coffee near Shibuya"`}
                  className="w-full bg-white border border-[#E6DFD3] rounded px-3 py-2 text-sm text-[#111827] placeholder:text-[#8A726C] focus:outline-none focus:border-[#E26D4F] focus:ring-2 focus:ring-[#E26D4F]/20"
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="inline-flex items-center gap-2 text-xs text-[#57423D] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={takeoutMode}
                      onChange={(e) => setTakeoutMode(e.target.checked)}
                      className="accent-[#E26D4F] rounded"
                    />
                    <span>Parse as Google Maps Takeout / shared list export</span>
                  </label>
                  <button
                    type="submit"
                    disabled={isExtracting || !noteInput.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#E26D4F] hover:bg-[#CF5A3D] disabled:opacity-50 rounded transition-colors cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>
                      {isExtracting
                        ? 'Extracting & resolving...'
                        : 'Extract Places'}
                    </span>
                  </button>
                </div>
              </form>
            )}

            {captureTab === 'url' && (
              <form onSubmit={handleUrlSubmit} className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="flex-1 bg-white border border-[#E6DFD3] rounded px-3 py-2 text-sm text-[#111827] placeholder:text-[#8A726C] focus:outline-none focus:border-[#E26D4F] focus:ring-2 focus:ring-[#E26D4F]/20"
                  />
                  <button
                    type="submit"
                    disabled={isExtracting || !urlInput.trim()}
                    className="px-4 py-2 text-xs font-medium text-white bg-[#E26D4F] hover:bg-[#CF5A3D] disabled:opacity-50 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {isExtracting ? 'Fetching...' : 'Extract from URL'}
                  </button>
                </div>
                <p className="text-xs text-[#57423D]">
                  Fetches video metadata via YouTube oEmbed and extracts
                  candidate places anchored to {destination}.
                </p>
              </form>
            )}

            {extractError && (
              <div className="mt-3 p-3 bg-[#FFDAD6]/60 border border-[#BA1A1A]/30 rounded text-xs text-[#93000A]">
                {extractError}
              </div>
            )}
          </section>

          {/* Polaroid Scrapbook Grid */}
          <section aria-label="Captured travel saves">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-serif text-xl font-medium text-[#111827]">
                Scrapbook Desk
              </h2>
              <span className="font-mono text-xs text-[#57423D] tabular-nums">
                {savedPlaces.length} STORED ITEMS
              </span>
            </div>

            {isExtracting && (
              <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="paper-card rounded-lg p-3 pb-6 animate-pulse">
                  <div className="aspect-[4/3] bg-[#E9E2D6] rounded-sm mb-3" />
                  <div className="h-4 bg-[#E9E2D6] rounded w-2/3 mb-2" />
                  <div className="h-3 bg-[#FAF7F2] rounded w-1/2" />
                </div>
              </div>
            )}

            {savedPlaces.length === 0 ? (
              <div className="paper-card rounded-lg p-10 text-center">
                <p className="font-serif text-lg text-[#111827] mb-1">
                  Your scrapbook desk is clear
                </p>
                <p className="text-sm text-[#57423D]">
                  Drop a screenshot, paste a note, or restore the Tokyo sample
                  saves above.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {savedPlaces.map((place, index) => {
                  const needsMatch = place.status === 'needs_confirmation';
                  return (
                    <article
                      key={place.id}
                      className={`paper-card paper-card-interactive rounded-lg p-3 pb-5 flex flex-col justify-between transition-transform ${
                        index % 2 === 0
                          ? 'sm:-rotate-[0.5deg] hover:rotate-0'
                          : 'sm:rotate-[0.5deg] hover:rotate-0'
                      }`}
                    >
                      <div>
                        <PolaroidThumbnail
                          mediaUrl={place.originalMediaUrl}
                          placePhotoUrl={place.placePhotoUrl}
                          photoAttribution={place.photoAttribution}
                          alt={place.extractedName}
                          category={place.category}
                          neighborhood={place.locationHint}
                          sourceType={place.rawInputType}
                        />

                        {/* Clean unboxed metadata row */}
                        <div className="mt-3 flex items-center justify-between gap-2 text-xs text-[#57423D]">
                          <div className="flex items-center gap-1.5 min-w-0 truncate">
                            <span className="font-medium text-[#1F2A37]">
                              {place.category}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="truncate">
                              {place.neighborhood}
                            </span>
                          </div>
                          <span
                            className={`font-mono text-[11px] tabular-nums shrink-0 ${
                              needsMatch ? 'text-[#9F3B22]' : 'text-[#446650]'
                            }`}
                          >
                            {needsMatch
                              ? `${place.confidence}% MATCH`
                              : 'VERIFIED'}
                          </span>
                        </div>

                        <h3 className="font-serif text-lg font-medium text-[#111827] mt-1 leading-snug">
                          {place.resolvedName}
                        </h3>
                        <p className="text-xs text-[#57423D] mt-1 leading-relaxed">
                          “{place.vibeContext}”
                        </p>
                        <p className="font-mono text-[10px] text-[#8A726C] mt-1.5 tabular-nums truncate">
                          {place.lat.toFixed(4)}°, {place.lng.toFixed(4)}° ·{' '}
                          {place.address}
                        </p>
                      </div>

                      <div className="mt-4 pt-2.5 border-t border-dashed border-[#E6DFD3] flex items-center justify-between gap-2">
                        <span className="font-mono text-[10px] text-[#8A726C] truncate">
                          {place.rawSourceLabel}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          {place.googleMapsUri && (
                            <a
                              href={place.googleMapsUri}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`View ${place.resolvedName} on Google Maps`}
                              className="inline-flex items-center gap-1 font-mono text-[10px] text-[#E26D4F] hover:underline"
                            >
                              <span>Maps</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => onDismissPlace(place.id)}
                            aria-label={`Remove ${place.resolvedName}`}
                            className="p-1 text-[#8A726C] hover:text-[#BA1A1A] transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* RIGHT 5 COLS: Resolution & Disambiguation Dock */}
        <aside className="lg:col-span-5 space-y-6 lg:sticky lg:top-24">
          {dedupeNotice && (
            <div className="bg-[#C6ECD0]/50 border border-[#8FB39A] rounded-lg px-4 py-3 text-xs text-[#2D4E3A]">
              {dedupeNotice}
            </div>
          )}

          {/* Step 3: Low-Confidence (<85%) Swipe/Confirm Deck */}
          <section
            aria-label="Disambiguation queue"
            className="paper-card rounded-lg overflow-hidden"
          >
            <div className="px-5 py-4 bg-[#FAF7F2] border-b border-[#E6DFD3] flex items-center justify-between gap-2">
              <div>
                <h2 className="font-serif text-lg font-medium text-[#111827]">
                  Needs Confirmation
                </h2>
                <p className="text-xs text-[#57423D]">
                  Below 85% confidence · Anchored to {destination.split(',')[0]}
                </p>
              </div>
              <span className="font-mono text-xs text-[#9F3B22] tabular-nums">
                {needsReview.length} PENDING
              </span>
            </div>

            {needsReview.length === 0 ? (
              <div className="p-5 text-sm text-[#446650] bg-white flex items-center gap-2.5">
                <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>
                  All saved places are disambiguated and deduplicated.
                </span>
              </div>
            ) : (
              activeReviewItem && (
                <div className="p-5 space-y-4">
                  <div className="flex items-center justify-between text-xs text-[#57423D]">
                    <span className="font-mono tabular-nums">
                      ITEM {safeTriageIdx + 1} OF {needsReview.length}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label="Previous item"
                        onClick={() =>
                          setTriageIndex((prev) =>
                            prev === 0 ? needsReview.length - 1 : prev - 1
                          )
                        }
                        className="p-1 border border-[#E6DFD3] rounded hover:bg-[#FAF7F2] cursor-pointer"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Next item"
                        onClick={() => setTriageIndex((prev) => prev + 1)}
                        className="p-1 border border-[#E6DFD3] rounded hover:bg-[#FAF7F2] cursor-pointer"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="p-3 bg-[#FAF7F2] border border-[#E6DFD3] rounded">
                    <p className="font-mono text-[10px] uppercase text-[#57423D]">
                      Extracted Save · {activeReviewItem.rawSourceLabel}
                    </p>
                    <p className="font-serif text-lg font-medium text-[#111827] mt-0.5">
                      “{activeReviewItem.extractedName}”
                    </p>
                    <p className="text-xs text-[#57423D] mt-0.5">
                      Context: {activeReviewItem.vibeContext}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-medium text-[#1F2A37]">
                      Select exact branch in {destination.split(',')[0]}:
                    </p>
                    {(activeReviewItem.candidates ?? []).map((cand, idx) => {
                      const isSelected =
                        (selectedCandidates[activeReviewItem.id] ?? 0) === idx;
                      return (
                        <button
                          key={cand.placeId}
                          type="button"
                          onClick={() =>
                            setSelectedCandidates((prev) => ({
                              ...prev,
                              [activeReviewItem.id]: idx,
                            }))
                          }
                          className={`w-full text-left p-3 rounded border transition-colors cursor-pointer flex items-center gap-3 ${
                            isSelected
                              ? 'border-[#E26D4F] bg-[#E26D4F]/5'
                              : 'border-[#E6DFD3] bg-white hover:bg-[#FAF7F2]'
                          }`}
                        >
                          {cand.placePhotoUrl && (
                            <img
                              src={cand.placePhotoUrl}
                              alt={cand.name}
                              referrerPolicy="no-referrer"
                              className="w-12 h-12 object-cover rounded-sm border border-[#E6DFD3] shrink-0"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-[#111827] truncate">
                                  {cand.name}
                                </p>
                                <p className="text-xs text-[#57423D] mt-0.5 truncate">
                                  {cand.neighborhood} · {cand.address}
                                </p>
                              </div>
                              <span className="font-mono text-[11px] tabular-nums text-[#57423D] shrink-0">
                                {cand.confidence}%
                              </span>
                            </div>
                            <p className="font-mono text-[11px] text-[#57423D] mt-1 tabular-nums">
                              Hours {cand.hoursSummary}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => onDismissPlace(activeReviewItem.id)}
                      className="px-3 py-2 text-xs font-medium text-[#57423D] bg-white border border-[#E6DFD3] hover:text-[#BA1A1A] rounded transition-colors cursor-pointer"
                    >
                      Skip Save
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onConfirmCandidate(
                          activeReviewItem.id,
                          selectedCandidates[activeReviewItem.id] ?? 0
                        )
                      }
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#E26D4F] hover:bg-[#CF5A3D] rounded transition-colors cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Confirm Match</span>
                    </button>
                  </div>
                </div>
              )
            )}
          </section>

          {/* Verified Place Ledger */}
          <section
            aria-label="Verified place ledger"
            className="paper-card rounded-lg overflow-hidden"
          >
            <div className="px-5 py-4 bg-[#FAF7F2] border-b border-[#E6DFD3] flex items-center justify-between">
              <div>
                <h2 className="font-serif text-lg font-medium text-[#111827]">
                  Verified &amp; Stored Ledger
                </h2>
                <p className="text-xs text-[#57423D]">
                  Ready for clustering around {baseHotel.name}
                </p>
              </div>
              <span className="font-mono text-xs text-[#446650] tabular-nums">
                {confirmed.length} READY
              </span>
            </div>

            <div className="divide-y divide-[#E6DFD3] max-h-80 overflow-y-auto">
              {confirmed.map((place) => (
                <div
                  key={place.id}
                  className="px-5 py-3 flex items-center justify-between gap-3 bg-white hover:bg-[#FAF7F2]/60 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#111827] truncate">
                      {place.resolvedName}
                    </p>
                    <p className="font-mono text-[11px] text-[#57423D] tabular-nums truncate">
                      {place.neighborhood} · Open {place.hoursSummary}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <Clock
                      className="w-3 h-3 text-[#8A726C]"
                      aria-hidden="true"
                    />
                    <button
                      type="button"
                      aria-label={`Decrease duration for ${place.resolvedName}`}
                      onClick={() => onUpdateDuration(place.id, -15)}
                      className="p-1 text-[#57423D] hover:text-[#111827] border border-[#E6DFD3] rounded cursor-pointer"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="font-mono text-xs tabular-nums text-[#111827] w-9 text-center">
                      {place.typicalDurationMins}m
                    </span>
                    <button
                      type="button"
                      aria-label={`Increase duration for ${place.resolvedName}`}
                      onClick={() => onUpdateDuration(place.id, 15)}
                      className="p-1 text-[#57423D] hover:text-[#111827] border border-[#E6DFD3] rounded cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 bg-[#FAF7F2] border-t border-[#E6DFD3]">
              <button
                type="button"
                disabled={confirmed.length === 0 || isPlanning}
                onClick={onBuildItinerary}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#E26D4F] hover:bg-[#CF5A3D] disabled:opacity-50 rounded transition-colors cursor-pointer"
              >
                <span>
                  {isPlanning
                    ? 'Running Spatial & Time-Window Engine...'
                    : 'Generate Realistic Schedule'}
                </span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
