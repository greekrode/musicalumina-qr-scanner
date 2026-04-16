export interface DatabaseParticipant {
  id: string;
  event_id: string;
  participant_name: string;
  song_title: string;
  subcategory_id: string;
  subcategory_name: string;
  category_name: string;
  status: string;
}

export interface ParticipantData {
  id?: string | number;
  name?: string;
  songTitle?: string;
  categoryId?: string | number;
  categoryName?: string;
  subCategoryId?: string | number;
  subCategoryName?: string;
  eventId?: string | number;
  role?: string;
}

export interface VerificationResult {
  isVerified: boolean;
  error?: string;
  status?: "pending" | "verified" | "already_verified";
  matchedFields?: {
    name: boolean;
    songTitle: boolean;
    categoryName: boolean;
    subCategoryName: boolean;
  };
}

interface CachedParticipant {
  /** Cache key: QR id + eventId (from JWT, not DB UUIDs) */
  id: string;
  eventId: string;
  verificationResult: VerificationResult;
  timestamp: number;
  participantData: ParticipantData;
}

// Cache management utilities
const CACHE_KEY = "musicaLumina_verifiedParticipants";
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes in milliseconds
let lastScanTime = 0;
const MIN_SCAN_DELAY = 150; // 150ms delay between scans to prevent spam

function getCachedVerification(
  participantId: string,
  eventId: string
): VerificationResult | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;

    const cachedData: CachedParticipant[] = JSON.parse(cached);
    const now = Date.now();

    const match = cachedData.find(
      (item) =>
        item.id === participantId &&
        item.eventId === eventId &&
        now - item.timestamp < CACHE_DURATION
    );

    return match?.verificationResult ?? null;
  } catch (error) {
    console.warn("Error reading participant cache:", error);
    return null;
  }
}

function setCachedVerification(
  participantData: ParticipantData,
  result: VerificationResult
): void {
  try {
    const cacheId = String(
      participantData.id ?? participantData.name ?? ""
    );
    const cacheEventId = String(participantData.eventId ?? "");
    if (!cacheId) return;

    const cached = localStorage.getItem(CACHE_KEY);
    let cachedData: CachedParticipant[] = cached ? JSON.parse(cached) : [];

    const now = Date.now();
    cachedData = cachedData.filter(
      (item) =>
        now - item.timestamp < CACHE_DURATION &&
        !(item.id === cacheId && item.eventId === cacheEventId)
    );

    cachedData.push({
      id: cacheId,
      eventId: cacheEventId,
      verificationResult: result,
      timestamp: now,
      participantData: participantData,
    });

    if (cachedData.length > 100) {
      cachedData = cachedData.slice(-100);
    }

    localStorage.setItem(CACHE_KEY, JSON.stringify(cachedData));
  } catch (error) {
    console.warn("Error saving participant cache:", error);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Normalize a string for case-insensitive, whitespace-tolerant comparison.
 */
function normalize(s: string | undefined | null): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Verify participant data against the database.
 * Matches by participant_name + category + subcategory.
 */
export async function verifyParticipantData(
  participantData: ParticipantData
): Promise<VerificationResult> {
  try {
    if (!participantData.name) {
      return {
        isVerified: false,
        error: "Missing required field: name",
      };
    }

    // Check cache first
    const cacheKey = String(participantData.id ?? participantData.name);
    const cacheEventKey = String(participantData.eventId ?? "");
    const cachedResult = getCachedVerification(cacheKey, cacheEventKey);
    if (cachedResult) {
      console.log("Verification loaded from cache");
      return cachedResult;
    }

    // Throttle API calls
    const now = Date.now();
    const timeSinceLastScan = now - lastScanTime;
    if (timeSinceLastScan < MIN_SCAN_DELAY) {
      await delay(MIN_SCAN_DELAY - timeSinceLastScan);
    }
    lastScanTime = Date.now();

    const participantResult = await tryVerifyAsParticipant(participantData);
    if (participantResult) {
      setCachedVerification(participantData, participantResult);
      return participantResult;
    }

    const result: VerificationResult = {
      isVerified: false,
      error: "Not found in database — name does not match any participant",
    };
    setCachedVerification(participantData, result);
    return result;
  } catch (error) {
    return {
      isVerified: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

// ---------------------------------------------------------------------------
// Participant verification
// ---------------------------------------------------------------------------

/**
 * Returns a VerificationResult if the name was found as a participant,
 * or `null` if no participant_name matched (so the caller can fall through).
 */
async function tryVerifyAsParticipant(
  participantData: ParticipantData
): Promise<VerificationResult | null> {
  const { supabase } = await import("../lib/supabase");

  const { data: dbRecords, error } = await supabase
    .from("registrations")
    .select(
      `
      id,
      event_id,
      participant_name,
      song_title,
      subcategory_id,
      status,
      event_subcategories!inner(
        name,
        event_categories!inner(name)
      )
    `
    )
    .ilike("participant_name", participantData.name!);

  if (error) {
    // DB error is not "not found" — surface it immediately
    return {
      isVerified: false,
      error: `Database query failed: ${error.message}`,
    };
  }

  if (!dbRecords || dbRecords.length === 0) {
    // No participant found — return null so caller can try teacher
    return null;
  }

  // Find the best matching record
  let bestMatch: {
    record: any;
    matchedFields: NonNullable<VerificationResult["matchedFields"]>;
    matchCount: number;
  } | null = null;

  for (const record of dbRecords) {
    const subcategoryData = record.event_subcategories as any;
    const dbSubCategoryName: string = subcategoryData?.name ?? "";
    const dbCategoryName: string =
      subcategoryData?.event_categories?.name ?? "";

    const matchedFields = {
      name:
        normalize(record.participant_name) ===
        normalize(participantData.name),
      songTitle:
        normalize(record.song_title) ===
        normalize(participantData.songTitle),
      categoryName:
        normalize(dbCategoryName) ===
        normalize(participantData.categoryName),
      subCategoryName:
        normalize(dbSubCategoryName) ===
        normalize(participantData.subCategoryName),
    };

    const matchCount = Object.values(matchedFields).filter(Boolean).length;

    if (!bestMatch || matchCount > bestMatch.matchCount) {
      bestMatch = { record, matchedFields, matchCount };
    }
  }

  if (!bestMatch) {
    return null;
  }

  const { matchedFields } = bestMatch;

  const isVerified =
    matchedFields.name &&
    matchedFields.categoryName &&
    matchedFields.subCategoryName;

  return {
    isVerified,
    status: isVerified ? "verified" : "pending",
    matchedFields,
    ...(isVerified
      ? {}
      : {
          error: `Participant found but fields mismatch: ${Object.entries(
            matchedFields
          )
            .filter(([, v]) => !v)
            .map(([k]) => k)
            .join(", ")}`,
        }),
  };
}

// ---------------------------------------------------------------------------
// Cache utilities
// ---------------------------------------------------------------------------

export function clearVerificationCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
    console.log("Participant verification cache cleared");
  } catch (error) {
    console.warn("Error clearing participant cache:", error);
  }
}

export function getCacheStats(): { count: number; oldestEntry: number | null } {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return { count: 0, oldestEntry: null };

    const cachedData: CachedParticipant[] = JSON.parse(cached);
    const now = Date.now();

    const validEntries = cachedData.filter(
      (item) => now - item.timestamp < CACHE_DURATION
    );

    return {
      count: validEntries.length,
      oldestEntry:
        validEntries.length > 0
          ? Math.min(...validEntries.map((item) => item.timestamp))
          : null,
    };
  } catch (error) {
    console.warn("Error reading cache stats:", error);
    return { count: 0, oldestEntry: null };
  }
}

export async function verifyParticipantDataDirect(
  participantData: ParticipantData
): Promise<VerificationResult> {
  return await verifyParticipantData(participantData);
}
