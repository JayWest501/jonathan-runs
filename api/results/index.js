// /api/results
// GET: returns all race results
// POST: adds a new result (admin only)

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('results')
      .select('*')
      .order('race_date', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    if (req.headers.authorization !== `Bearer ${process.env.ADMIN_PASSWORD}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { race_name, race_date, location, distance, chip_time, gun_time, overall_place, overall_total, ag_place, ag_total, is_pr, notes } = req.body;

    if (!race_name || !race_date || !chip_time) {
      return res.status(400).json({ error: 'race_name, race_date, and chip_time are required.' });
    }

    const { data, error } = await supabase
      .from('results')
      .insert({
        race_name, race_date, location, distance,
        chip_time, gun_time,
        overall_place, overall_total,
        ag_place, ag_total,
        is_pr: is_pr || false,
        notes: notes || null,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  res.status(405).json({ error: 'Method not allowed' });
}
