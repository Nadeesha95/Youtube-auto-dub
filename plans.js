/**
 * Plans and usage limits — shared by background.js, content.js and popup.js.
 *
 * Everything is free and unlimited today: translation and voice come from Google's free services,
 * called from each user's own browser, so users cost nothing to serve.
 *
 * To add a limit later, set e.g. `dailyDubMinutes: 30` on the free plan. The extension already
 * tracks usage, stops dubbing (subtitles keep working) when the limit is reached, and shows
 * usage against the limit in the popup.
 *
 * To add premium later: verify a license key on your own server, then store
 * { tier: 'premium' } under the 'ytdub_license' storage key. Note that anything enforced only in
 * the browser can be bypassed, so paid features that cost you money should run on your server.
 */
const YTDUB_PLANS = {
  free: {
    name: 'Free',
    dailyDubMinutes: null, // null = unlimited
    features: { dubbing: true, subtitles: true, simplify: true }
  },
  premium: {
    name: 'Premium',
    dailyDubMinutes: null,
    features: { dubbing: true, subtitles: true, simplify: true }
  }
};

function ytdubPlan(license) {
  const tier = license && license.tier;
  return YTDUB_PLANS[tier] || YTDUB_PLANS.free;
}

function ytdubToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Usage with day/month counters reset when the date has moved on.
function ytdubCurrentUsage(usage) {
  const today = ytdubToday();
  const month = today.slice(0, 7);
  const u = { day: today, month, dubSecondsToday: 0, linesToday: 0, dubSecondsMonth: 0, dubSecondsTotal: 0, ...(usage || {}) };
  if (u.day !== today) { u.day = today; u.dubSecondsToday = 0; u.linesToday = 0; }
  if (u.month !== month) { u.month = month; u.dubSecondsMonth = 0; }
  return u;
}

function ytdubLimitReached(usage, license) {
  const limit = ytdubPlan(license).dailyDubMinutes;
  return limit != null && ytdubCurrentUsage(usage).dubSecondsToday >= limit * 60;
}
