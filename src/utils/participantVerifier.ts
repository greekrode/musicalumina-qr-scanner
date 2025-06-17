export interface DatabaseParticipant {
  id: string;
  event_id: string;
  participant_name: string;
  song_title: string;
  category_id: string;
  category_name: string;
  subcategory_id: string;
  subcategory_name: string;
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
}

export interface VerificationResult {
  isVerified: boolean;
  error?: string;
  status?: 'pending' | 'verified' | 'expired' | 'already_verified';
  matchedFields?: {
    id: boolean;
    name: boolean;
    eventId: boolean;
    songTitle: boolean;
    categoryId: boolean;
    categoryName: boolean;
    subCategoryId: boolean;
    subCategoryName: boolean;
  };
}

interface CachedParticipant {
  id: string;
  eventId: string;
  verificationResult: VerificationResult;
  timestamp: number;
  participantData: ParticipantData;
}

// Cache management utilities
const CACHE_KEY = 'musicaLumina_verifiedParticipants';
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes in milliseconds
let lastScanTime = 0;
const MIN_SCAN_DELAY = 150; // 150ms delay between scans to prevent spam

function getCachedVerification(participantId: string, eventId: string): VerificationResult | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;

    const cachedData: CachedParticipant[] = JSON.parse(cached);
    const now = Date.now();

    // Find matching participant
    const match = cachedData.find(
      item => item.id === participantId && 
              item.eventId === eventId && 
              (now - item.timestamp) < CACHE_DURATION
    );

    if (match) {
      return match.verificationResult;
    }

    return null;
  } catch (error) {
    console.warn('Error reading participant cache:', error);
    return null;
  }
}

function setCachedVerification(participantData: ParticipantData, result: VerificationResult): void {
  try {
    if (!participantData.id || !participantData.eventId) return;

    const cached = localStorage.getItem(CACHE_KEY);
    let cachedData: CachedParticipant[] = [];

    if (cached) {
      cachedData = JSON.parse(cached);
    }

    // Remove expired entries and existing entry for this participant
    const now = Date.now();
    cachedData = cachedData.filter(
      item => (now - item.timestamp) < CACHE_DURATION && 
              !(item.id === String(participantData.id) && item.eventId === String(participantData.eventId))
    );

    // Add new entry if verification was successful
    if (result.isVerified) {
      cachedData.push({
        id: String(participantData.id),
        eventId: String(participantData.eventId),
        verificationResult: result,
        timestamp: now,
        participantData: participantData
      });
    }

    // Keep only last 100 entries to prevent localStorage bloat
    if (cachedData.length > 100) {
      cachedData = cachedData.slice(-100);
    }

    localStorage.setItem(CACHE_KEY, JSON.stringify(cachedData));
  } catch (error) {
    console.warn('Error saving participant cache:', error);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function verifyParticipantData(participantData: ParticipantData): Promise<VerificationResult> {
  try {
    if (!participantData.id || !participantData.eventId) {
      return {
        isVerified: false,
        error: 'Missing required fields: id or eventId'
      };
    }

    // Check cache first
    const cachedResult = getCachedVerification(String(participantData.id), String(participantData.eventId));
    if (cachedResult) {
      console.log('Participant verification loaded from cache');
      return cachedResult;
    }

    // Only add delay for new API calls (not cached results) to prevent scan spam
    if (!cachedResult) {
      const now = Date.now();
      const timeSinceLastScan = now - lastScanTime;
      if (timeSinceLastScan < MIN_SCAN_DELAY) {
        await delay(MIN_SCAN_DELAY - timeSinceLastScan);
      }
      lastScanTime = Date.now();
    }

    const { supabase } = await import('../lib/supabase');

    // Query the registrations table with joins to get category and subcategory names
    const { data: dbRecord, error } = await supabase
      .from('registrations')
      .select(`
        id,
        event_id,
        participant_name,
        song_title,
        category_id,
        subcategory_id,
        status,
        event_categories!inner(name),
        event_subcategories!inner(name)
      `)
      .eq('id', participantData.id)
      .eq('event_id', participantData.eventId)
      .single();

    if (error) {
      return {
        isVerified: false,
        error: `Database query failed: ${error.message}`
      };
    }

    if (!dbRecord) {
      return {
        isVerified: false,
        error: 'Participant not found'
      };
    }

    // Extract category and subcategory names from the joined data
    const categoryName = (dbRecord.event_categories as any)?.name || '';
    const subcategoryName = (dbRecord.event_subcategories as any)?.name || '';

    // Compare all fields
    const matchedFields = {
      id: String(dbRecord.id) === String(participantData.id),
      name: dbRecord.participant_name === participantData.name,
      eventId: String(dbRecord.event_id) === String(participantData.eventId),
      songTitle: dbRecord.song_title === participantData.songTitle,
      categoryId: String(dbRecord.category_id) === String(participantData.categoryId),
      categoryName: categoryName === participantData.categoryName,
      subCategoryId: String(dbRecord.subcategory_id) === String(participantData.subCategoryId),
      subCategoryName: subcategoryName === participantData.subCategoryName
    };

    const isVerified = Object.values(matchedFields).every(match => match);

    // Handle status logic based on current status
    let result: VerificationResult;
    
    if (!isVerified) {
      // Data doesn't match - return unverified
      result = {
        isVerified: false,
        status: dbRecord.status as any,
        matchedFields
      };
    } else if (dbRecord.status === 'verified') {
      // Already verified - mark as expired to prevent double scanning
      await supabase
        .from('registrations')
        .update({ status: 'expired' })
        .eq('id', participantData.id)
        .eq('event_id', participantData.eventId);

      result = {
        isVerified: false,
        status: 'already_verified',
        error: 'QR code already used - participant was previously verified',
        matchedFields
      };
    } else if (dbRecord.status === 'pending') {
      // First time verification - update to verified
      const { error: updateError } = await supabase
        .from('registrations')
        .update({ status: 'verified' })
        .eq('id', participantData.id)
        .eq('event_id', participantData.eventId);

      if (updateError) {
        result = {
          isVerified: false,
          status: 'pending',
          error: `Failed to update status: ${updateError.message}`,
          matchedFields
        };
      } else {
        result = {
          isVerified: true,
          status: 'verified',
          matchedFields
        };
      }
    } else {
      // Status is expired or other - don't allow verification
      result = {
        isVerified: false,
        status: dbRecord.status as any,
        error: `Participant status is ${dbRecord.status} - verification not allowed`,
        matchedFields
      };
    }

    // Cache successful verifications (only if truly verified, not already_verified)
    if (result.isVerified && result.status === 'verified') {
      setCachedVerification(participantData, result);
    }

    return result;

  } catch (error) {
    return {
      isVerified: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

// Clear verification cache (useful for logout or cache reset)
export function clearVerificationCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
    console.log('Participant verification cache cleared');
  } catch (error) {
    console.warn('Error clearing participant cache:', error);
  }
}

// Get cache statistics
export function getCacheStats(): { count: number; oldestEntry: number | null } {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return { count: 0, oldestEntry: null };

    const cachedData: CachedParticipant[] = JSON.parse(cached);
    const now = Date.now();
    
    // Filter out expired entries
    const validEntries = cachedData.filter(item => (now - item.timestamp) < CACHE_DURATION);
    
    return {
      count: validEntries.length,
      oldestEntry: validEntries.length > 0 ? Math.min(...validEntries.map(item => item.timestamp)) : null
    };
  } catch (error) {
    console.warn('Error reading cache stats:', error);
    return { count: 0, oldestEntry: null };
  }
}

// Alternative function that uses the same Supabase implementation
export async function verifyParticipantDataDirect(participantData: ParticipantData): Promise<VerificationResult> {
  // Use the same implementation as the main function
  return await verifyParticipantData(participantData);
} 