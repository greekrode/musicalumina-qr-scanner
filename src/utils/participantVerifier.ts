export interface DatabaseParticipant {
  id: number;
  event_id: number;
  name: string;
  songTitle: string;
  category_id: number;
  category_name: string;
  subcategory_id: number;
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
    const DATABASE_URL = import.meta.env.VITE_DATABASE_URL;
    
    if (!DATABASE_URL) {
      return {
        isVerified: false,
        error: 'Database URL not configured'
      };
    }

    if (!participantData.id || !participantData.eventId) {
      return {
        isVerified: false,
        error: 'Missing required fields: id or eventId'
      };
    }

    // Make API call to our backend endpoint that will query the database
    const response = await fetch('/api/verify-participant', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        eventId: participantData.eventId,
        participantId: participantData.id,
        databaseUrl: DATABASE_URL
      })
    });

    if (!response.ok) {
      return {
        isVerified: false,
        error: `API request failed: ${response.status}`
      };
    }

    const dbRecord: DatabaseParticipant = await response.json();

    // Compare all fields
    const matchedFields = {
      id: String(dbRecord.id) === String(participantData.id),
      name: dbRecord.name === participantData.name,
      eventId: String(dbRecord.event_id) === String(participantData.eventId),
      songTitle: dbRecord.songTitle === participantData.songTitle,
      categoryId: String(dbRecord.category_id) === String(participantData.categoryId),
      categoryName: dbRecord.category_name === participantData.categoryName,
      subCategoryId: String(dbRecord.subcategory_id) === String(participantData.subCategoryId),
      subCategoryName: dbRecord.subcategory_name === participantData.subCategoryName
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

// Alternative direct database connection approach using a serverless function
export async function verifyParticipantDataDirect(participantData: ParticipantData): Promise<VerificationResult> {
  try {
    const DATABASE_URL = import.meta.env.VITE_DATABASE_URL;
    
    if (!DATABASE_URL) {
      return {
        isVerified: false,
        error: 'Database URL not configured in VITE_DATABASE_URL'
      };
    }

    if (!participantData.id || !participantData.eventId) {
      return {
        isVerified: false,
        error: 'Missing required fields: id or eventId'
      };
    }

    // This would require a backend API endpoint since browsers can't directly connect to PostgreSQL
    // For now, we'll use a mock verification or require backend setup
    console.warn('Direct database connection requires backend API. Using mock verification for now.');
    
    // Mock verification for development - replace with actual API call
    const mockVerified = Math.random() > 0.3; // 70% chance of being verified for testing
    
    return {
      isVerified: mockVerified,
      matchedFields: {
        id: mockVerified,
        name: mockVerified,
        eventId: mockVerified,
        songTitle: mockVerified,
        categoryId: mockVerified,
        categoryName: mockVerified,
        subCategoryId: mockVerified,
        subCategoryName: mockVerified
      }
    };

  } catch (error) {
    return {
      isVerified: false,
      error: error instanceof Error ? error.message : 'Verification failed'
    };
  }
} 