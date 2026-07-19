import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const KEY = 'site_content';
const DEFAULTS = {
  hero_eyebrow: 'The road to December 13',
  hero_distance: '13.1',
  hero_line_one: 'No shortcuts.',
  hero_line_two: 'Just miles.',
  race_name: 'Dallas Half Marathon',
  race_goal: 'Sub-2:15',
  race_date: '2026-12-13T07:00:00-06:00',
  bib_number: '1301',
  story_eyebrow: 'Why I Run',
  story_title: 'The finish line is only part of it.',
  story_body: 'This is the record of every early alarm, hard mile, setback, breakthrough, and ordinary run that turns a first half marathon from an idea into something real.',
  quote: 'The race is one morning. The transformation happens in all the mornings before it.',
  quote_author: 'Jonathan West',
  gear_intro: 'The products I actually train with, what works for me, and what I am still testing. Favorites are separated from gear I simply want to try.',
  wishlist_title: 'My Running Wishlist',
  wishlist_description: 'Gear I am saving for or interested in testing on the road to 13.1.',
  wishlist_url: '',
  strava_url: 'https://strava.com/athletes/jaycee501',
  tiktok_url: 'https://www.tiktok.com/@runningwithjayc',
  footer_text: '29:05 5K → 13.1 miles · Dallas, TX · Dec 13, 2026'
};

function isAdmin(req) {
  return req.headers.authorization === `Bearer ${process.env.ADMIN_PASSWORD}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('settings').select('value').eq('key', KEY).maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ...DEFAULTS, ...(data?.value || {}) });
  }

  if (req.method === 'PUT') {
    if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
    const incoming = req.body && typeof req.body === 'object' ? req.body : {};
    const clean = {};
    for (const key of Object.keys(DEFAULTS)) {
      if (Object.prototype.hasOwnProperty.call(incoming, key)) clean[key] = String(incoming[key] ?? '').trim();
    }
    const value = { ...DEFAULTS, ...clean };
    const { error } = await supabase.from('settings').upsert({ key: KEY, value });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(value);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
