// /api/subscribe
// POST: saves email subscriber to Supabase

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required.' });
  }

  const { error } = await supabase
    .from('subscribers')
    .upsert({ email, subscribed_at: new Date().toISOString() });

  if (error) {
    // Unique constraint = already subscribed, that's fine
    if (error.code === '23505') {
      return res.status(200).json({ message: 'Already subscribed!' });
    }
    return res.status(500).json({ error: error.message });
  }

  return res.status(201).json({ message: 'Subscribed successfully!' });
}
