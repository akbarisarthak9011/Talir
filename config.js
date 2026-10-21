/* ============================================================
   Tailr site settings — the only file you need to edit.
   ============================================================ */
window.TAILR_CONFIG = {
  // Your Google AdSense publisher ID, e.g. "ca-pub-1234567890123456".
  // Leave empty until AdSense approves your site: no ads load while it is empty.
  adsenseClient: "",

  // Ad unit IDs from AdSense (Ads > By ad unit > Display ads), e.g. "1234567890".
  adSlots: {
    top: "",     // under the headline
    result: "",  // under the tool
    content: ""  // between the guide and the FAQ
  },

  // Free AI. On Cloudflare Pages, functions/api/ai.js uses your free Workers AI allowance (no key).
  // On hosts without functions (GitHub Pages, Netlify Drop) the site falls back to Chrome's
  // on-device AI or the standard engine automatically. Set cloudAI to false to switch it off.
  cloudAI: true,
  aiEndpoint: "api/ai",

  // Shown on the legal notice and privacy pages.
  ownerName: "[Your full name]",
  contactEmail: "[your.email@example.com]",
  siteUrl: "https://[your-site].netlify.app"
};
