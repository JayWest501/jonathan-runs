// /api/progress
// GET: returns all 14 weeks with actual vs target mileage pulled from Strava
// POST: admin-only manual override for a week's completion status

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Training plan weeks — mirrors the 14-week plan, dates in UTC
const WEEKS = [
  { num: 1,  start: '2026-09-01', end: '2026-09-07', target: 18 },
  { num: 2,  start: '2026-09-08', end: '2026-09-14', target: 20 },
  { num: 3,  start: '2026-09-15', end: '2026-09-21', target: 22 },
  { num: 4,  start: '2026-09-22', end: '2026-09-28', target: 16 },
  { num: 5,  start: '2026-09-29', end: '2026-10-05', target: 23 },
  { num: 6,  start: '2026-10-06', end: '2026-10-12', target: 25 },
  { num: 7,  start: '2026-10-13', end: '2026-10-19', target: 27 },
  { num: 8,  start: '2026-10-20', end: '2026-10-26', target: 18 },
  { num: 9,  start: '2026-10-27', end: '2026-11-02', target: 28 },
  { num: 10, start: '2026-11-03', end: '2026-11-09', target: 30 },
  { num: 11, start: '2026-11-10', end: '2026-11-16', target: 26 },
  { num: 12, start: '2026-11-17', end: '2026-11-23', target: 20 },
  { num: 13, start: '2026-11-24', end: '2026-12-06', target: 14 },
  { num: 14, start: '2026-12-07', end: '2026-12-13', target: 10 },
];

const AUTO_COMPLETE_THRESHOLD = 90; // percent of target mileage to auto-mark a week complete

function isAdmin(req) {
  return req.headers.authorization === `Bearer ${process.env.ADMIN_PASSWORD}`;
}

async function getValidAccessToken() {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'strava_tokens')
    .single();

  if (error || !data) throw new Error('No Strava tokens found. Connect Strava in the admin dashboard.');

  const tokens = data.value;
  const now = Math.floor(Date.now() / 1000);

  if (tokens.expires_at > now + 60) return tokens.access_token;

  const refreshRes = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      refresh_token: tokens.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  const newTokens = await refreshRes.json();
  if (!newTokens.access_token) throw new Error('Failed to refresh Strava token.');

  await supabase.from('settings').upsert({
    key: 'strava_tokens',
    value: {
      access_token: newTokens.access_token,
      refresh_token: newTokens.refresh_token,
      expires_at: newTokens.expires_at,
      athlete_id: tokens.athlete_id,
    },
  });

  return newTokens.access_token;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // POST — set or clear a manual override for a specific week (admin only)
  if (req.method === 'POST') {
    if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });

    const { week, override } = req.body || {};
    if (!week) return res.status(400).json({ error: 'week is required' });

    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'week_overrides')
      .single();

    const overrides = (data && data.value) || {};

    if (override === null || override === undefined) {
      delete overrides[String(week)];
    } else {
      overrides[String(week)] = !!override;
    }

    const { error: upsertError } = await supabase
      .from('settings')
      .upsert({ key: 'week_overrides', value: overrides });

    if (upsertError) return res.status(500).json({ error: upsertError.message });

    // bust the progress cache so the change shows immediately
    await supabase.from('settings').delete().eq('key', 'progress_cache');

    return res.status(200).json({ success: true, overrides });
  }

  // GET — compute progress for all 14 weeks
  if (req.method === 'GET') {
    try {
      const bust = req.query.bust;

      if (!bust) {
        const { data: cached } = await supabase
          .from('settings')
          .select('value, updated_at')
          .eq('key', 'progress_cache')
          .single();

        const cacheAge = cached
          ? (Date.now() - new Date(cached.updated_at).getTime()) / 1000
          : Infinity;

        if (cached && cacheAge < 1800) {
          return res.status(200).json(cached.value);
        }
      }

      let runs = [];
      let stravaError = null;

      try {
        const accessToken = await getValidAccessToken();
        const planStart = new Date('2026-09-01T00:00:00Z');
        const afterEpoch = Math.floor(planStart.getTime() / 1000) - 86400;

        let allActivities = [];
        let page = 1;
        while (page <= 5) {
          const r = await fetch(
            `https://www.strava.com/api/v3/athlete/activities?after=${afterEpoch}&per_page=100&page=${page}`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          const batch = await r.json();
          if (!Array.isArray(batch) || batch.length === 0) break;
          allActivities = allActivities.concat(batch);
          if (batch.length < 100) break;
          page++;
        }

        runs = allActivities.filter(a => a.type === 'Run');
      } catch (e) {
        stravaError = e.message;
      }

      const { data: overrideRow } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'week_overrides')
        .single();
      const overrides = (overrideRow && overrideRow.value) || {};

      const today = new Date();

      const weeks = WEEKS.map(w => {
        const start = new Date(w.start + 'T00:00:00Z');
        const end = new Date(w.end + 'T23:59:59Z');

        const weekRuns = runs.filter(r => {
          const d = new Date(r.start_date);
          return d >= start && d <= end;
        });

        const actualMeters = weekRuns.reduce((s, r) => s + (r.distance || 0), 0);
        const actualMiles = Math.round((actualMeters / 1609.34) * 10) / 10;
        const pct = w.target > 0 ? Math.min(100, Math.round((actualMiles / w.target) * 100)) : 0;
        const autoComplete = pct >= AUTO_COMPLETE_THRESHOLD;

        const key = String(w.num);
        const hasOverride = Object.prototype.hasOwnProperty.call(overrides, key);
        const manualOverride = hasOverride ? !!overrides[key] : null;
        const complete = hasOverride ? manualOverride : autoComplete;

        const isCurrent = today >= start && today <= end;
        const isPast = today > end;
        const isFuture = today < start;

        return {
          week: w.num,
          start: w.start,
          end: w.end,
          target: w.target,
          actualMiles,
          pct,
          autoComplete,
          manualOverride,
          complete,
          isCurrent,
          isPast,
          isFuture,
          runsCount: weekRuns.length,
        };
      });

      const completedWeeks = weeks.filter(w => w.complete).length;
      const totalMilesLogged = Math.round(weeks.reduce((s, w) => s + w.actualMiles, 0) * 10) / 10;
      const totalRunsLogged = weeks.reduce((s, w) => s + w.runsCount, 0);

      const result = {
        weeks,
        completedWeeks,
        totalMilesLogged,
        totalRunsLogged,
        stravaConnected: !stravaError,
        stravaError,
        generatedAt: new Date().toISOString(),
      };

      // Only cache successful Strava pulls — don't cache error states
      if (!stravaError) {
        await supabase.from('settings').upsert({ key: 'progress_cache', value: result });
      }

      return res.status(200).json(result);
    } catch (err) {
      console.error('Progress API error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  res.status(405).json({ error: 'Method not allowed' });
}
