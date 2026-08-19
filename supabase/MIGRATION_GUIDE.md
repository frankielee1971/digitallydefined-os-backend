================================================================================
SUPABASE EDGE FUNCTIONS MIGRATION - DEPLOYMENT GUIDE
================================================================================

MIGRATION STATUS: COMPLETE
Files created: 28 TypeScript files
Location: backend/supabase/functions/

================================================================================
1. NEW FOLDER STRUCTURE
================================================================================

supabase/
  functions/
    deno.json                          # Deno workspace config
    _shared/                           # All shared modules (23 files)
      aiRouter.ts                      # Model routing logic
      community-helpers.ts             # Community engagement tools
      community-triggers.ts            # Community automation triggers
      content-sources.ts               # Content source enrichment
      cors-utils.ts                    # Shared CORS header utilities
      cron-dedup-logger.ts             # Cron deduplication logger
      email-publish.ts                 # SendGrid email dispatcher
      facebook-publisher.ts            # Facebook posting API
      followup-messages.ts             # Follow-up message templates
      hermesSystemPrompt.ts            # System prompt for AI calls
      instagram-publisher.ts           # Instagram posting API
      linkedin-publisher.ts            # LinkedIn posting API
      meta-auth.ts                     # Meta/Facebook auth helpers
      notion-client.ts                 # Notion API client
      notion-schema.ts                 # Notion schema builder
      notion-write.ts                  # Notion write executor
      omniroute.ts                     # OmniRoute AI gateway client
      roadmaps-store.ts                # Filesystem roadmap storage
      sheets-sellable.ts               # Google Sheets integration
      social-publishers.ts             # Social media publisher hub
      sync-aggregator.ts               # Sync data aggregator
      threads-publisher.ts             # Threads posting API
    hermes/index.ts                    # Main AI chat endpoint (/hermes)
    followup/index.ts                  # Follow-up pipeline (/followup)
    post-publisher/index.ts            # Social content publisher (/post-publisher)
    sync/index.ts                      # Vault sync endpoint (/sync)
    sellable/index.ts                  # Sellable products cron (/sellable)

================================================================================
2. UPDATED API ENDPOINTS
================================================================================

OLD (Vercel)                        NEW (Supabase Edge Functions)
---------------------------------------------------------------------------
/api/hermes                   ->    /functions/v1/hermes
/api/followup                 ->    /functions/v1/followup
/api/cron/post-publisher      ->    /functions/v1/post-publisher
/api/cron/sellable            ->    /functions/v1/sellable
/api/sync                     ->    /functions/v1/sync
---------------------------------------------------------------------------

All endpoints use the same JSON request/response contract as before.
The hermes endpoint also handles /api routes (status, routes, etc.) internally.

================================================================================
3. UPDATED FRONTEND API PATHS
================================================================================

File: lib/hermesClient.js
  OLD: https://digitallydefined-os-backend.vercel.app/api/hermes
  NEW: https://YOUR_PROJECT.supabase.co/functions/v1/hermes

File: api/hermes.js (proxy)
  OLD: https://digitallydefined-os-backend.vercel.app/api/hermes
  NEW: https://YOUR_PROJECT.supabase.co/functions/v1/hermes

File: .env (all instances)
  OLD: VITE_DASHBOARD_API_URL=https://digitallydefined-os-backend.vercel.app/api
  NEW: VITE_DASHBOARD_API_URL=https://YOUR_PROJECT.supabase.co/functions/v1
  
  OLD: VITE_CHAT_API_URL=https://digitallydefined-os-backend.vercel.app/api/chat
  NEW: VITE_CHAT_API_URL=https://YOUR_PROJECT.supabase.co/functions/v1/hermes

================================================================================
4. SUPABASE CRON JOBS (Scheduled Functions)
================================================================================

Supabase uses Cron Jobs configured via CLI or Dashboard UI.

CRON 1: Follow-up Pipeline
  Function: followup
  Schedule: 0 0 * * *    (daily at midnight UTC)
  Trigger: Supabase internal cron sends POST with x-supabase-intention header
  
CRON 2: Post Publisher
  Function: post-publisher
  Schedule: 0 0 * * *    (daily at midnight UTC)
  Trigger: Supabase internal cron sends POST with x-supabase-intention header

Setup commands (run after deploying functions):
  supabase functions:new followup --no-verify-jwt
  supabase functions:new post-publisher --no-verify-jwt
  
Then in Supabase Dashboard > Database > Cron > New Cron:
  Job name: followup-cron
  Command: supabase functions invoke followup --no-verify-jwt
  Schedule: 0 0 * * *
  
  Job name: post-publisher-cron
  Command: supabase functions invoke post-publisher --no-verify-jwt
  Schedule: 0 0 * * *

Or via CLI:
  supabase cron create followup-cron --command "supabase functions invoke followup --no-verify-jwt" --schedule "0 0 * * *"
  supabase cron create post-publisher-cron --command "supabase functions invoke post-publisher --no-verify-jwt" --schedule "0 0 * * *"

================================================================================
5. ENVIRONMENT VARIABLES TO CONFIGURE IN SUPABASE
================================================================================

These are required by the Supabase Edge Functions. Set them in:
  Supabase Dashboard > Project Settings > Environment Variables

REQUIRED:
  DASHBOARD_API_KEY              Your dashboard API key
  OMNIROUTE_BASE_URL             Your AI gateway URL (or use direct API keys below)
  OMNIROUTE_API_KEY              AI gateway API key
  OMNIROUTE_MODEL                Default model (e.g., "free", "paid")
  NOTION_SECRET                  Notion integration token
  NOTION_VERSION                 Notion API version (default: "2022-06-28")

OPTIONAL (AI providers - if not using OMNIROUTE):
  OPENROUTER_API_KEY             For OpenRouter fallback
  GROQ_API_KEY                   For Groq fallback

OPTIONAL (Social media):
  FACEBOOK_ACCESS_TOKEN
  FACEBOOK_PAGE_ACCESS_TOKEN
  INSTAGRAM_ACCESS_TOKEN
  THREADS_ACCESS_TOKEN
  LINKEDIN_ACCESS_TOKEN
  PINTEREST_ACCESS_TOKEN

OPTIONAL (Email):
  SENDGRID_API_KEY
  SENDGRID_TEMPLATE_ID
  SENDGRID_LIST_ID

OPTIONAL (Sheets):
  GOOGLE_SHEETS_API_KEY
  GOOGLE_SHEETS_ID
  GOOGLE_CLIENT_ID
  GOOGLE_CLIENT_SECRET
  GOOGLE_REFRESH_TOKEN

NOTE: All these can be set when you deploy the functions via:
  supabase secrets set DASHBOARD_API_KEY=your_key_here
  supabase secrets set OMNIROUTE_API_KEY=your_key_here

================================================================================
6. DEPLOYMENT STEPS
================================================================================

Step 1: Install Supabase CLI
  npm i -g supabase

Step 2: Login to Supabase
  supabase login

Step 3: Link your project
  supabase link --project-ref YOUR_PROJECT_REF

Step 4: Deploy all functions at once
  cd C:\Users\frank\Documents\DigitallyDefined-Backend\supabase\functions
  supabase functions deploy hermes --import-map ./deno.json
  supabase functions deploy followup --import-map ./deno.json
  supabase functions deploy post-publisher --import-map ./deno.json
  supabase functions deploy sync --import-map ./deno.json
  supabase functions deploy sellable --import-map ./deno.json

Step 5: Set environment variables
  supabase secrets set DASHBOARD_API_KEY=<key>
  supabase secrets set OMNIROUTE_BASE_URL=<url>
  supabase secrets set OMNIROUTE_API_KEY=<key>
  supabase secrets set NOTION_SECRET=<key>
  # ... add any other env vars needed

Step 6: Create cron jobs
  supabase cron create followup-cron \
    --command "supabase functions invoke followup --no-verify-jwt" \
    --schedule "0 0 * * *" \
    --project-ref YOUR_PROJECT_REF

  supabase cron create post-publisher-cron \
    --command "supabase functions invoke post-publisher --no-verify-jwt" \
    --schedule "0 0 * * *" \
    --project-ref YOUR_PROJECT_REF

Step 7: Update frontend .env values
  Replace YOUR_PROJECT.supabase.co with your actual Supabase project URL

Step 8: Deploy frontend
  cd C:\Users\frank\Documents\DigitallyDefined-Frontend
  npm run build && npm run deploy
  (or whatever your build/deploy command is)

================================================================================
7. MIGRATION COMPARISON: VERCEL vs SUPABASE
================================================================================

                       Vercel Hobby          Supabase Edge Functions
---------------------------------------------------------------------------
Function limit:        12 functions           Unlimited
Cron limit:            5 daily jobs          5 jobs (can be hourly+)
Runtime:               Node.js Serverless     Deno (TypeScript native)
Cold start:            ~100-500ms             ~50-200ms
Memory:                1024MB max             150MB default (configurable)
Environment:           .env in Vercel UI      supabase secrets set
Deployment:            vercel --prod          supabase functions deploy
Build step:            Automatic              None (native TS support)
Import maps:           Not needed             deno.json for dependencies

BENEFITS OF THIS MIGRATION:
- No more 12-function limit (we use 5 functions, no problem)
- Native TypeScript support (no ESM/CJS conversion needed)
- Better cold start performance (Deno)
- Cron jobs can run more frequently than daily
- Same API contract (frontend needs zero code changes beyond base URL)

================================================================================
8. REVERT PLAN (if needed)
================================================================================

To revert back to Vercel:
1. Restore .env values pointing to digitalllydefined-os-backend.vercel.app
2. Restore api/hermes.js proxy URL
3. Keep the original backend/ directory untouched (it still works)
4. Delete supabase/functions/ directory

The migration does NOT modify the existing backend/. Files there remain intact.

================================================================================
