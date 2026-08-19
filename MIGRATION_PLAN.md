# DigitallyDefined Backend Migration Plan
# Vercel Serverless Functions → Supabase Edge Functions

## Overview
Migrate from 34 Vercel serverless functions to 1 Supabase Edge Function to avoid the 12-function limit.

---

## Backend Route Inventory

### Currently Deployed (Vercel)
```
api/
├── index.js              # Main router (50KB, 1339 lines)
├── hermes.js             # AI chat endpoint
├── sync.js               # Vault sync
├── sheets.js             # Google Sheets
├── brevo.js              # Email marketing
├── facebook.js           # Facebook integration
├── instagram.js          # Instagram integration
├── threads.js            # Threads integration
├── youtube.js            # YouTube integration
├── tiktok.js             # TikTok integration
├── linkedin.js           # LinkedIn integration
├── pinterest.js          # Pinterest integration
├── google-sheets.js      # Sheets API
├── gumroad.js            # Gumroad integration
├── followup.js           # Follow-up sequences
├── customer-operations.js # Customer ops
├── revenue-automation.js # Revenue tracking
├── seo-automation.js     # SEO workflows
├── sellable-products.js  # Product management
├── getPageFeed.js        # Facebook feed
├── ai/
│   ├── automation.js
│   ├── free.js
│   ├── paid.js
│   ├── seo.js
│   └── workflow.js
├── cron/
│   ├── post-community.js
│   ├── post-engagement-prompt.js
│   ├── post-facebook.js
│   ├── post-instagram.js
│   ├── post-publisher.js
│   ├── post-threads.js
│   ├── post-weekly-wins.js
│   └── sellable.js
└── roadmaps/
    └── store.js
```

**Total: 34 functions** (exceeds 12 function limit)

---

## Migration Strategy

### Phase 1: Create Unified Edge Function
**File:** `functions/hermes.ts`

 consolidates all critical routes into a single function:
- `/api/hermes` - Main endpoint (dashboard, automations, AI chat)
- `/api/sync` - Vault sync
- `/api/vault` - Google Sheets data
- `/api/automations` - Automation list
- `/api/models` - AI models
- `/health` - Health check

### Phase 2: Update Frontend
**File:** `src/pages/DashboardPage.jsx`

Change API_URL from:
```javascript
const API_URL = `${import.meta.env.VITE_DASHBOARD_API_URL}/hermes`;
// https://digitallydefined-os-backend.vercel.app/api/hermes
```

To:
```javascript
const API_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/hermes`;
// https://dijjlppdljpcgyoakdnq.supabase.co/functions/v1/hermes
```

### Phase 3: Deploy to Supabase
```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link to project
supabase link --project-ref dijjlppdljpcgyoakdnq

# Deploy function
supabase functions deploy hermes --env-file .env
```

### Phase 4: Set Environment Variables
```bash
supabase functions secrets set DASHBOARD_API_KEY=DigitallyDefined-OS-2026
supabase functions secrets set SHEETS_WEBHOOK_URL=https://...
supabase functions secrets set FACEBOOK_GROUP_ID=...
supabase functions secrets set FACEBOOK_ACCESS_TOKEN=...
supabase functions secrets set SENDPULSE_API_ID=...
supabase functions secrets set SENDPULSE_API_SECRET=...
supabase functions secrets set NOTION_API_KEY=...
supabase functions secrets set OPENROUTER_API_KEY=...
```

---

## New Frontend Code

### Updated DashboardPage.jsx
```javascript
// OLD
const API_URL = `${import.meta.env.VITE_DASHBOARD_API_URL || "https://digitallydefined-os-backend.vercel.app/api"}/hermes`;

// NEW
const API_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/hermes`;
```

### Updated .env
```bash
# OLD
VITE_DASHBOARD_API_URL=https://digitallydefined-os-backend.vercel.app/api

# NEW
VITE_SUPABASE_URL=https://dijjlppdljpcgyoakdnq.supabase.co
```

---

## Environment Variable Mapping

| Vercel Env Var | Supabase Edge Function Env Var | Purpose |
|----------------|-------------------------------|---------|
| DASHBOARD_API_KEY | DASHBOARD_API_KEY | API authentication |
| SHEETS_WEBHOOK_URL | SHEETS_WEBHOOK_URL | Google Sheets sync |
| FACEBOOK_GROUP_ID | FACEBOOK_GROUP_ID | Facebook integration |
| FACEBOOK_ACCESS_TOKEN | FACEBOOK_ACCESS_TOKEN | Facebook API |
| SENDPULSE_API_ID | SENDPULSE_API_ID | Email marketing |
| SENDPULSE_API_SECRET | SENDPULSE_API_SECRET | Email marketing |
| NOTION_API_KEY | NOTION_API_KEY | Notion integration |
| OPENROUTER_API_KEY | OPENROUTER_API_KEY | AI chat |

---

## Final Backend Structure

```
DigitallyDefined-Backend/
├── functions/
│   ├── hermes.ts          # Unified Edge Function (NEW)
│   └── .env.example       # Environment template
├── api/                   # Keep for reference (will be deprecated)
│   ├── hermes.js
│   ├── index.js
│   └── ... (33 other files)
├── agents/
│   ├── buzz-registry.js
│   └── ...
├── package.json
└── vercel.json            # Can be removed after migration
```

---

## Validation Checklist

- [ ] Supabase Edge Function deployed
- [ ] Environment variables set
- [ ] Dashboard API_URL updated
- [ ] Dashboard loads without errors
- [ ] /api/hermes returns dashboard data
- [ ] /api/sync works
- [ ] AI chat works (if OpenRouter key set)
- [ ] No 400 Bad Request errors
- [ ] No serverless function limit errors

---

## Rollback Plan

If issues occur:
1. Revert DashboardPage.jsx API_URL change
2. Redeploy to Vercel (if needed)
3. Keep Supabase function as backup

---

**Status:** Ready for deployment
**Estimated Time:** 15 minutes
**Risk Level:** Low (backward compatible)
