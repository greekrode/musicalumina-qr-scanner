export interface DatabaseParticipant {
  id: string;
  event_id: string;
  participant_name: string;
  song_title: string;
  category_id: string;
  category_name: string;
  subcategory_id: string;
  subcategory_name: string;
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

export async function verifyParticipantData(participantData: ParticipantData): Promise<VerificationResult> {
  try {
    const { supabase } = await import('../lib/supabase');

    if (!participantData.id || !participantData.eventId) {
      return {
        isVerified: false,
        error: 'Missing required fields: id or eventId'
      };
    }

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

    return {
      isVerified,
      matchedFields
    };

  } catch (error) {
    return {
      isVerified: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

// Alternative function that uses the same Supabase implementation
export async function verifyParticipantDataDirect(participantData: ParticipantData): Promise<VerificationResult> {
  // Use the same implementation as the main function
  return await verifyParticipantData(participantData);
} 