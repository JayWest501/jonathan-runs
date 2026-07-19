import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function isAdmin(req) {
  return req.headers.authorization === `Bearer ${process.env.ADMIN_PASSWORD}`;
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

  // Public newsletter signup
  if (req.method === 'POST') {
    const email = String(req.body?.email || '').trim().toLowerCase();

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email required.' });
    }

    const { error } = await supabase
      .from('subscribers')
      .upsert(
        {
          email,
          subscribed_at: new Date().toISOString()
        },
        {
          onConflict: 'email'
        }
      );

    if (error) {
      if (error.code === '23505') {
        return res.status(200).json({ message: 'Already subscribed!' });
      }

      return res.status(500).json({ error: error.message });
    }

    return res.status(201).json({ message: 'Subscribed successfully!' });
  }

  // Everything below this point is admin-only
  if (!isAdmin(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Admin subscriber list
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('subscribers')
      .select('*')
      .order('subscribed_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json(data);
  }

  // Admin subscriber deletion
  if (req.method === 'DELETE') {
    const id = req.query?.id || req.body?.id;

    if (!id) {
      return res.status(400).json({ error: 'Subscriber id is required.' });
    }

    const { error } = await supabase
      .from('subscribers')
      .delete()
      .eq('id', id);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
