// /api/strava/auth
// Redirects to Strava OAuth consent page
// Visit /api/strava/auth in browser to connect your Strava account

export default function handler(req, res) {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const siteUrl = process.env.SITE_URL || 'https://jonathan-runs.vercel.app';
  const redirectUri = `${siteUrl}/api/strava/callback`;

  const scope = 'read,activity:read_all';
  const stravaAuthUrl =
    `https://www.strava.com/oauth/authorize` +
    `?client_id=${clientId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&approval_prompt=auto` +
    `&scope=${scope}`;

  res.redirect(stravaAuthUrl);
}
