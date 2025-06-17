import { Client } from 'pg';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { eventId, participantId, databaseUrl } = req.body;

  if (!eventId || !participantId || !databaseUrl) {
    return res.status(400).json({ 
      error: 'Missing required fields: eventId, participantId, or databaseUrl' 
    });
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();

    const query = `
      SELECT
          r.id,
          r.event_id,
          r.participant_name AS name,
          r.song_title AS songTitle,
          c.id    AS category_id,
          c.name  AS category_name,
          sc.id   AS subcategory_id,
          sc.name AS subcategory_name
      FROM public.registrations r
               JOIN public.event_categories c ON r.category_id = c.id
               JOIN public.event_subcategories sc ON r.subcategory_id = sc.id
      WHERE r.event_id = $1 AND r.id = $2
    `;

    const result = await client.query(query, [eventId, participantId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Participant not found in database' 
      });
    }

    const participant = result.rows[0];
    res.status(200).json(participant);

  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ 
      error: 'Database verification failed',
      details: error.message 
    });
  } finally {
    await client.end();
  }
} 