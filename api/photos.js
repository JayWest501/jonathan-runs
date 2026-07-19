import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export const config = {
  api: {
    bodyParser: false
  }
};

function isAdmin(req) {
  return (
    req.headers.authorization ===
    `Bearer ${process.env.ADMIN_PASSWORD}`
  );
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET, POST, DELETE, OPTIONS'
  );

  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    const { race_id, type } = req.query;

    const { data, error } = await supabase.storage
      .from('photos')
      .list('', {
        sortBy: {
          column: 'created_at',
          order: 'desc'
        }
      });

    if (error) {
      return res.status(500).json({
        error: error.message
      });
    }

    let photos = (data || [])
      .filter(
        file =>
          file.name !== '.emptyFolderPlaceholder'
      )
      .filter(file => {
        const isGearPhoto =
          file.name.startsWith('gear__');

        if (type === 'gear') {
          return isGearPhoto;
        }

        return !isGearPhoto;
      })
      .map(file => {
        const cleanName =
          file.name.startsWith('gear__')
            ? file.name.slice('gear__'.length)
            : file.name;

        const parts = cleanName.split('__');
        const hasRaceId = parts.length > 1;

        return {
          name: file.name,
          url:
            `${process.env.SUPABASE_URL}` +
            `/storage/v1/object/public/photos/${file.name}`,
          created_at: file.created_at,
          caption: file.metadata?.caption || '',
          race_id: hasRaceId ? parts[0] : null,
          type: file.name.startsWith('gear__')
            ? 'gear'
            : 'gallery'
        };
      });

    if (race_id) {
      photos = photos.filter(
        photo => photo.race_id === race_id
      );
    }

    return res.status(200).json(photos);
  }

  if (req.method === 'POST') {
    if (!isAdmin(req)) {
      return res.status(401).json({
        error: 'Unauthorized'
      });
    }

    const chunks = [];

    for await (const chunk of req) {
      chunks.push(chunk);
    }

    const buffer = Buffer.concat(chunks);

    const contentType =
      req.headers['content-type'] || '';

    const boundary =
      contentType.split('boundary=')[1];

    if (!boundary) {
      return res.status(400).json({
        error: 'No upload boundary found.'
      });
    }

    const parts = parseMultipart(
      buffer,
      boundary
    );

    const filePart = parts.find(
      part => part.filename
    );

    const captionPart = parts.find(
      part => part.name === 'caption'
    );

    const raceIdPart = parts.find(
      part => part.name === 'race_id'
    );

    const uploadTypePart = parts.find(
      part => part.name === 'upload_type'
    );

    if (!filePart) {
      return res.status(400).json({
        error: 'No file found in upload.'
      });
    }

    const extension =
      filePart.filename
        .split('.')
        .pop()
        .toLowerCase();

    const allowedExtensions = [
      'jpg',
      'jpeg',
      'png',
      'gif',
      'webp',
      'heic'
    ];

    if (
      !allowedExtensions.includes(extension)
    ) {
      return res.status(400).json({
        error: 'File type not allowed.'
      });
    }

    const caption = captionPart
      ? captionPart.data
          .toString('utf8')
          .trim()
      : '';

    const raceId = raceIdPart
      ? raceIdPart.data
          .toString('utf8')
          .trim()
      : '';

    const uploadType = uploadTypePart
      ? uploadTypePart.data
          .toString('utf8')
          .trim()
      : 'gallery';

    const safeFilename =
      filePart.filename.replace(
        /[^a-z0-9._-]/gi,
        '_'
      );

    const baseName = raceId
      ? `${raceId}__${Date.now()}-${safeFilename}`
      : `${Date.now()}-${safeFilename}`;

    const storageFilename =
      uploadType === 'gear'
        ? `gear__${baseName}`
        : baseName;

    const {
      error: uploadError
    } = await supabase.storage
      .from('photos')
      .upload(
        storageFilename,
        filePart.data,
        {
          contentType:
            filePart.contentType ||
            'image/jpeg',
          upsert: false,
          metadata: {
            caption,
            upload_type: uploadType
          }
        }
      );

    if (uploadError) {
      return res.status(500).json({
        error: uploadError.message
      });
    }

    const url =
      `${process.env.SUPABASE_URL}` +
      `/storage/v1/object/public/photos/${storageFilename}`;

    return res.status(201).json({
      url,
      name: storageFilename,
      caption,
      race_id: raceId || null,
      type: uploadType
    });
  }

  if (req.method === 'DELETE') {
    if (!isAdmin(req)) {
      return res.status(401).json({
        error: 'Unauthorized'
      });
    }

    const { name } = req.query;

    if (!name) {
      return res.status(400).json({
        error: 'No file name provided.'
      });
    }

    const { error } =
      await supabase.storage
        .from('photos')
        .remove([name]);

    if (error) {
      return res.status(500).json({
        error: error.message
      });
    }

    return res.status(200).json({
      success: true
    });
  }

  return res.status(405).json({
    error: 'Method not allowed'
  });
}

function parseMultipart(
  buffer,
  boundary
) {
  const parts = [];
  const boundaryBuffer =
    Buffer.from('--' + boundary);

  let start = 0;

  while (start < buffer.length) {
    const boundaryIndex =
      buffer.indexOf(
        boundaryBuffer,
        start
      );

    if (boundaryIndex === -1) {
      break;
    }

    const headerStart =
      boundaryIndex +
      boundaryBuffer.length +
      2;

    const headerEnd =
      buffer.indexOf(
        Buffer.from('\r\n\r\n'),
        headerStart
      );

    if (headerEnd === -1) {
      break;
    }

    const headers =
      buffer
        .slice(
          headerStart,
          headerEnd
        )
        .toString('utf8');

    const dataStart =
      headerEnd + 4;

    const nextBoundary =
      buffer.indexOf(
        boundaryBuffer,
        dataStart
      );

    const dataEnd =
      nextBoundary === -1
        ? buffer.length
        : nextBoundary - 2;

    const data =
      buffer.slice(
        dataStart,
        dataEnd
      );

    const nameMatch =
      headers.match(
        /name="([^"]+)"/
      );

    const filenameMatch =
      headers.match(
        /filename="([^"]+)"/
      );

    const contentTypeMatch =
      headers.match(
        /Content-Type:\s*([^\r\n]+)/i
      );

    parts.push({
      name: nameMatch
        ? nameMatch[1]
        : '',
      filename: filenameMatch
        ? filenameMatch[1]
        : null,
      contentType: contentTypeMatch
        ? contentTypeMatch[1].trim()
        : null,
      data
    });

    start =
      nextBoundary === -1
        ? buffer.length
        : nextBoundary;
  }

  return parts;
}
