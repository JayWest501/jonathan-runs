// /api/strava/callback
// Strava redirects here after you authorize the app
// Exchanges the code for tokens and saves them to Supabase

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  const { code, error } = req.query;

  if (error) {
    return res.status(400).send(`Strava auth error: ${error}`);
  }

  if (!code) {
    return res.status(400).send('No authorization code received from Strava.');
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenRes.json();

    if (tokens.errors) {
      return res.status(400).send(`Token exchange failed: ${JSON.stringify(tokens.errors)}`);
    }

    // Save tokens to Supabase settings table
    const { error: dbError } = await supabase
      .from('settings')
      .upsert({
        key: 'strava_tokens',
        value: {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: tokens.expires_at,
          athlete_id: tokens.athlete?.id,
        },
      });

    if (dbError) {
      console.error('Supabase error:', dbError);
      return res.status(500).send(`Supabase error: ${JSON.stringify(dbError)}`);
    }

    // Success — redirect to admin
    res.redirect('/admin?strava=connected');
  } catch (err) {
    console.error('Callback error:', err);
    res.status(500).send('Internal server error during Strava auth.');
  }
}
