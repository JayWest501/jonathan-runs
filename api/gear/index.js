import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function isAdmin(req) {
  return req.headers.authorization === `Bearer ${process.env.ADMIN_PASSWORD}`;
}

function getItemId(req) {
  return req.query?.id || req.body?.id || null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET, POST, PATCH, PUT, DELETE, OPTIONS'
  );
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('gear_items')
      .select('*')
      .eq('published', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json(data);
  }

  if (!isAdmin(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method === 'POST') {
    const {
      name,
      category,
      type,
      status,
      note,
      icon,
      product_url,
      image_url,
      sort_order,
      published
    } = req.body || {};

    if (!name || !category) {
      return res.status(400).json({
        error: 'Name and category are required.'
      });
    }

    const { data, error } = await supabase
      .from('gear_items')
      .insert({
        name: String(name).trim(),
        category: String(category).trim(),
        type: type || '',
        status: status || 'In use',
        note: note || '',
        icon: icon || '✦',
        product_url: product_url || null,
        image_url: image_url || null,
        sort_order: Number.isFinite(Number(sort_order))
          ? Number(sort_order)
          : 0,
        published: published !== false
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(201).json(data);
  }

  if (req.method === 'PATCH' || req.method === 'PUT') {
    const id = getItemId(req);

    if (!id) {
      return res.status(400).json({ error: 'Gear item id is required.' });
    }

    const allowed = [
      'name',
      'category',
      'type',
      'status',
      'note',
      'icon',
      'product_url',
      'image_url',
      'sort_order',
      'published'
    ];

    const updates = {};

    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) {
        updates[key] = req.body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields supplied to update.' });
    }

    const { data, error } = await supabase
      .from('gear_items')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json(data);
  }

  if (req.method === 'DELETE') {
    const id = getItemId(req);

    if (!id) {
      return res.status(400).json({ error: 'Gear item id is required.' });
    }

    const { error } = await supabase
      .from('gear_items')
      .delete()
      .eq('id', id);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
