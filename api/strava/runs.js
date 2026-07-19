// /api/strava/runs
// Returns recent runs from Strava with heart rate zones and calories
// Caches results in Supabase for 30 minutes to avoid rate limits

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Refresh Strava access token using stored refresh token
async function getValidAccessToken() {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'strava_tokens')
    .single();

  if (error || !data) throw new Error('No Strava tokens found. Visit /api/strava/auth to connect.');

  const tokens = data.value;
  const now = Math.floor(Date.now() / 1000);

  // Token still valid
  if (tokens.expires_at > now + 60) {
    return tokens.access_token;
  }

  // Refresh the token
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

  // Save refreshed tokens
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

// Calculate HR zone distribution from Strava streams
function calcHRZones(heartrateStream, timeStream) {
  if (!heartrateStream || !timeStream) return null;

  // Standard 5-zone model based on max HR
  // Uses 191 bpm as Jonathan's observed max
  const maxHR = 191;
  const zones = [
    { name: 'Zone 1 · Recovery', min: 0, max: maxHR * 0.6, seconds: 0 },
    { name: 'Zone 2 · Fat Burn', min: maxHR * 0.6, max: maxHR * 0.7, seconds: 0 },
    { name: 'Zone 3 · Aerobic', min: maxHR * 0.7, max: maxHR * 0.8, seconds: 0 },
    { name: 'Zone 4 · Threshold', min: maxHR * 0.8, max: maxHR * 0.9, seconds: 0 },
    { name: 'Zone 5 · Max Effort', min: maxHR * 0.9, max: 999, seconds: 0 },
  ];

  heartrateStream.forEach((hr, i) => {
    const duration = i > 0 ? timeStream[i] - timeStream[i - 1] : 0;
    const zone = zones.find(z => hr >= z.min && hr < z.max);
    if (zone) zone.seconds += duration;
  });

  const total = zones.reduce((sum, z) => sum + z.seconds, 0);
  return zones.map(z => ({
    name: z.name,
    pct: total > 0 ? Math.round((z.seconds / total) * 100) : 0,
    seconds: z.seconds,
  }));
}

export default async function handler(req, res) {
  // CORS headers for frontend fetch
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=1800'); // 30 min cache

  try {
    // Check cache first
    const { data: cached } = await supabase
      .from('settings')
      .select('value, updated_at')
      .eq('key', 'runs_cache')
      .single();

    const cacheAge = cached
      ? (Date.now() - new Date(cached.updated_at).getTime()) / 1000
      : Infinity;

    if (cached && cacheAge < 1800) {
      return res.status(200).json(cached.value);
    }

    // Fetch fresh from Strava — over-fetch since we filter out private activities after
    const accessToken = await getValidAccessToken();
    const limit = parseInt(req.query.limit) || 10;
    const fetchCount = limit * 3; // buffer for private activities that get filtered out

    const activitiesRes = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?per_page=${fetchCount}&type=Run`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    let activities = await activitiesRes.json();

    if (!Array.isArray(activities)) {
      throw new Error('Unexpected Strava response: ' + JSON.stringify(activities));
    }

    // Exclude activities marked private on Strava — the API returns these
    // to the owner regardless of visibility, so we filter manually
    // Also exclude walks: anything slower than 15:00/mile pace isn't a run
    const MIN_PACE_SEC_PER_MILE = 15 * 60; // 15:00/mi — walking pace threshold

    activities = activities
      .filter(act => !act.private && act.visibility !== 'only_me')
      .filter(act => {
        if (!act.distance || act.distance <= 0) return false;
        const paceSecPerMile = act.moving_time / (act.distance / 1609.34);
        return paceSecPerMile <= MIN_PACE_SEC_PER_MILE;
      })
      .slice(0, limit);

    // Enrich each run with HR stream data
    const runs = await Promise.all(
      activities.map(async (act) => {
        let hrZones = null;
        let avgHR = act.average_heartrate || null;
        let maxHR = act.max_heartrate || null;

        // Fetch HR stream for zone calculation
        if (act.has_heartrate) {
          try {
            const streamRes = await fetch(
              `https://www.strava.com/api/v3/activities/${act.id}/streams?keys=heartrate,time&key_by_type=true`,
              { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            const streams = await streamRes.json();
            hrZones = calcHRZones(
              streams.heartrate?.data,
              streams.time?.data
            );
          } catch (e) {
            console.warn(`HR stream fetch failed for activity ${act.id}:`, e.message);
          }
        }

        // Format the date using the raw local clock time Strava reports —
        // start_date_local looks like an ISO string but isn't real UTC, so we
        // parse it as plain text instead of through Date() to avoid the browser
        // re-converting it to the viewer's timezone (which double-shifts it)
        const localStr = act.start_date_local || act.start_date; // e.g. "2026-07-04T07:30:00Z"
        const [datePart, timePart] = localStr.replace('Z', '').split('T');
        const [year, month, day] = datePart.split('-').map(Number);
        const [hour24, minute] = timePart.split(':').map(Number);
        const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
        const ampm = hour24 < 12 ? 'AM' : 'PM';
        const dateDisplay = `${monthNames[month-1]} ${day}, ${year} · ${hour12}:${String(minute).padStart(2,'0')} ${ampm}`;

        // Format pace as mm:ss/mi
        const paceSecPerMile = act.distance > 0
          ? (act.moving_time / (act.distance / 1609.34))
          : 0;
        const paceMin = Math.floor(paceSecPerMile / 60);
        const paceSec = Math.round(paceSecPerMile % 60);
        const paceStr = `${paceMin}:${String(paceSec).padStart(2, '0')}`;

        // Format time as h:mm:ss or mm:ss
        const h = Math.floor(act.moving_time / 3600);
        const m = Math.floor((act.moving_time % 3600) / 60);
        const s = act.moving_time % 60;
        const timeStr = h > 0
          ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
          : `${m}:${String(s).padStart(2,'0')}`;

        return {
          id: act.id,
          name: act.name,
          date: act.start_date_local,
          date_display: dateDisplay,
          distance_miles: Math.round((act.distance / 1609.34) * 100) / 100,
          moving_time: timeStr,
          pace: paceStr,
          elevation_ft: Math.round(act.total_elevation_gain * 3.281),
          calories: act.calories || null,
          avg_hr: avgHR ? Math.round(avgHR) : null,
          max_hr: maxHR ? Math.round(maxHR) : null,
          hr_zones: hrZones,
          workout_type: act.workout_type,
          start_latlng: act.start_latlng,
          map_polyline: act.map?.summary_polyline || null,
          strava_url: `https://www.strava.com/activities/${act.id}`,
        };
      })
    );

    // Cache results
    await supabase.from('settings').upsert({
      key: 'runs_cache',
      value: runs,
    });

    res.status(200).json(runs);
  } catch (err) {
    console.error('Runs API error:', err);
    res.status(500).json({ error: err.message });
  }
}
