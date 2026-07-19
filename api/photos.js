// /api/photos
// GET: returns all photos from Supabase storage
// POST: uploads a photo (admin only, multipart form data)

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export const config = { api: { bodyParser: false } };

function isAdmin(req) {
  return req.headers.authorization === `Bearer ${process.env.ADMIN_PASSWORD}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET — list all photos, optionally filtered by race_id
  if (req.method === 'GET') {
    const { race_id } = req.query;
    const { data, error } = await supabase.storage
      .from('photos')
      .list('', { sortBy: { column: 'created_at', order: 'desc' } });

    if (error) return res.status(500).json({ error: error.message });

    let photos = data
      .filter(f => f.name !== '.emptyFolderPlaceholder')
      .map(f => {
        // filenames are formatted as: {raceId}__{timestamp}-{originalname}  OR  {timestamp}-{originalname} (no race)
        const parts = f.name.split('__');
        const hasRace = parts.length > 1;
        return {
          name: f.name,
          url: `${process.env.SUPABASE_URL}/storage/v1/object/public/photos/${f.name}`,
          created_at: f.created_at,
          caption: f.metadata?.caption || '',
          race_id: hasRace ? parts[0] : null,
        };
      });

    if (race_id) {
      photos = photos.filter(p => p.race_id === race_id);
    }

    return res.status(200).json(photos);
  }

  // POST — upload a photo
  if (req.method === 'POST') {
    if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });

    // Parse multipart manually using raw body
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);
    const contentType = req.headers['content-type'] || '';
    const boundary = contentType.split('boundary=')[1];

    if (!boundary) return res.status(400).json({ error: 'No boundary found in content-type' });

    // Parse multipart
    const parts = parseMultipart(buffer, boundary);
    const filePart = parts.find(p => p.filename);
    const captionPart = parts.find(p => p.name === 'caption');
    const raceIdPart = parts.find(p => p.name === 'race_id');

    if (!filePart) return res.status(400).json({ error: 'No file found in upload' });

    const ext = filePart.filename.split('.').pop().toLowerCase();
    const allowed = ['jpg','jpeg','png','gif','webp','heic'];
    if (!allowed.includes(ext)) return res.status(400).json({ error: 'File type not allowed' });

    const caption = captionPart ? captionPart.data.toString('utf8').trim() : '';
    const raceId = raceIdPart ? raceIdPart.data.toString('utf8').trim() : '';
    const safeName = filePart.filename.replace(/[^a-z0-9._-]/gi, '_');
    const fileName = raceId
      ? `${raceId}__${Date.now()}-${safeName}`
      : `${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from('photos')
      .upload(fileName, filePart.data, {
        contentType: filePart.contentType || 'image/jpeg',
        upsert: false,
        metadata: { caption },
      });

    if (uploadError) return res.status(500).json({ error: uploadError.message });

    const url = `${process.env.SUPABASE_URL}/storage/v1/object/public/photos/${fileName}`;
    return res.status(201).json({ url, name: fileName, caption, race_id: raceId || null });
  }

  // DELETE — remove a photo
  if (req.method === 'DELETE') {
    if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
    const { name } = req.query;
    if (!name) return res.status(400).json({ error: 'No file name provided' });

    const { error } = await supabase.storage.from('photos').remove([name]);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}

function parseMultipart(buffer, boundary) {
  const parts = [];
  const boundaryBuffer = Buffer.from('--' + boundary);
  let start = 0;

  while (start < buffer.length) {
    const boundaryIdx = buffer.indexOf(boundaryBuffer, start);
    if (boundaryIdx === -1) break;
    const headerStart = boundaryIdx + boundaryBuffer.length + 2;
    const headerEnd = buffer.indexOf(Buffer.from('\r\n\r\n'), headerStart);
    if (headerEnd === -1) break;

    const headers = buffer.slice(headerStart, headerEnd).toString('utf8');
    const dataStart = headerEnd + 4;
    const nextBoundary = buffer.indexOf(boundaryBuffer, dataStart);
    const dataEnd = nextBoundary === -1 ? buffer.length : nextBoundary - 2;
    const data = buffer.slice(dataStart, dataEnd);

    const nameMatch = headers.match(/name="([^"]+)"/);
    const filenameMatch = headers.match(/filename="([^"]+)"/);
    const contentTypeMatch = headers.match(/Content-Type:\s*([^\r\n]+)/i);

    parts.push({
      name: nameMatch ? nameMatch[1] : '',
      filename: filenameMatch ? filenameMatch[1] : null,
      contentType: contentTypeMatch ? contentTypeMatch[1].trim() : null,
      data,
    });

    start = nextBoundary === -1 ? buffer.length : nextBoundary;
  }

  return parts;
}
