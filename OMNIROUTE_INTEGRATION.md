# OmniRoute Integration - Complete Implementation Guide

## Overview

This document describes the complete integration of OmniRoute as the unified AI gateway for the DigitallyDefined OS. All AI requests now flow through OmniRoute's single endpoint, replacing direct calls to multiple LLM providers (Groq, OpenRouter, ZAI, Nous, Gemini, Claude, GPT, etc.).

## What Was Changed

### 1. Backend OmniRoute Client (`lib/omniroute.js`)

**Created:** New unified AI gateway client for Node.js/JavaScript

**Features:**
- Single endpoint for all AI requests
- Auto-fallback to alternative models
- Streaming support (optional)
- JSON mode for structured responses
- Configurable timeout and retry logic
- Environment-based configuration

**Key Functions:**
- `omniRoute(prompt, options)` - Main function for AI calls
- `omniRouteStream(prompt, options, onChunk)` - Streaming variant

**Environment Variables:**
- `OMNIROUTE_API_KEY` (required)
- `OMNIROUTE_BASE_URL` (optional, default: https://omniroute.ai)
- `OMNIROUTE_MODEL` (optional, default: openai/gpt-4o-mini)
- `OMNIROUTE_FALLBACK_MODEL_1` (optional)
- `OMNIROUTE_FALLBACK_MODEL_2` (optional)

### 2. Backend API Endpoints Updated

#### `api/hermes.js`
**Before:** Direct calls to OpenRouter and Groq with provider-specific error handling
**After:** Single call to OmniRoute with fallback support

**Changes:**
- Removed OpenRouter API integration
- Removed Groq API integration
- Added OmniRoute client import
- Simplified error handling
- Maintained markdown stripping for responses

#### `api/index.js`
**Before:** Direct Groq API call in `fetchAIBrief()` function
**After:** OmniRoute call with JSON mode

**Changes:**
- Replaced Groq API call with OmniRoute
- Updated error messages to reference OmniRoute
- Updated `buildEnvStatus()` to show OmniRoute config
- Updated `buildAlerts()` to check for OmniRoute API key

#### `lib/sync-aggregator.js`
**Before:** Direct Groq API call in `buildAIBrief()` function
**After:** OmniRoute call with JSON mode

**Changes:**
- Replaced Groq API call with OmniRoute
- Updated error messages to reference OmniRoute
- Maintained same JSON parsing logic

### 3. Hermes MCP (Python) Integration

**Created:** `hermes/modules/omniroute.py`

**Features:**
- Python client for OmniRoute API
- Singleton pattern for efficient reuse
- Both prompt-based and messages-based interfaces
- Auto-fallback support
- Comprehensive error handling

**Key Classes/Functions:**
- `OmniRouteClient` - Main client class
- `call_ai()` - Convenience function for simple calls
- `call_ai_with_messages()` - For complex multi-turn conversations
- `get_client()` - Singleton accessor

**Updated:** `hermes/mcp_server.py`
- Added OmniRoute tools to MCP tools dictionary
- Available tools: `call_ai`, `call_ai_with_messages`, `get_omniroute_client`

### 4. Frontend Integration

**Status:** No changes required

**Reason:** The frontend already routes all AI requests through the backend:
- `api/hermes.js` (frontend) → `api/hermes.js` (backend) → OmniRoute
- All Hermes chat requests flow through the backend proxy
- No direct LLM API calls from frontend

**Environment Variables (Frontend):**
- `VITE_DASHBOARD_API_KEY` - Backend authentication
- `VITE_HERMES_GATEWAY_URL` - Backend Hermes endpoint
- No AI provider keys needed in frontend

### 5. Cron Jobs

**Status:** No changes required

**Reason:** Cron jobs (`api/cron/sellable.js`) are dry-run only and don't make AI calls directly. They orchestrate other endpoints that now use OmniRoute.

### 6. Antigravity Automation

**Status:** No direct AI calls to replace

**Reason:** Antigravity (`api/index.js` → `processAntigravityTrigger()`) handles Notion webhooks and triggers. It doesn't make AI calls directly - it logs and orchestrates. Any AI content generation would happen through the standard endpoints that now use OmniRoute.

## Environment Variables

### Required for OmniRoute

```bash
# Backend (.env or Vercel environment variables)
OMNIROUTE_API_KEY=sk-or-1-your-api-key-here
OMNIROUTE_BASE_URL=https://omniroute.ai  # Optional
OMNIROUTE_MODEL=openai/gpt-4o-mini  # Optional
OMNIROUTE_FALLBACK_MODEL_1=anthropic/claude-3-haiku  # Optional
OMNIROUTE_FALLBACK_MODEL_2=google/gemini-pro  # Optional
```

### No Longer Required

The following environment variables can be removed once OmniRoute is confirmed working:
- `GROQ_API_KEY`
- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GOOGLE_API_KEY`
- `ZAI_API_KEY`
- `NOUS_API_KEY`

### Still Required (Non-AI Features)

These are still needed for non-AI functionality:
- `DASHBOARD_API_KEY` - Frontend authentication
- `NOTION_API_KEY` - Notion integration
- `FACEBOOK_GROUP_ID`, `FACEBOOK_ACCESS_TOKEN` - Social media
- `SENDPULSE_API_ID`, `SENDPULSE_API_SECRET` - Email marketing
- `BREVO_API_KEY` - Email marketing
- `SHEETS_WEBHOOK_URL` - Google Sheets
- `ANTIGRAVITY_API_KEY` - Antigravity (optional)

## Testing

### Test Scripts Created

1. **`test-omniroute.js`** (Node.js)
   - Tests configuration
   - Tests basic calls
   - Tests JSON mode
   - Tests fallback models
   - Tests error handling
   - Tests streaming

### Running Tests

```bash
# From backend directory
cd digitallydefined-os-backend

# Set environment variables
export OMNIROUTE_API_KEY=your-api-key-here

# Run tests
node test-omniroute.js
```

### Manual Testing

```bash
# Test OmniRoute directly
curl -X POST https://omniroute.ai/v1/chat/completions \
  -H "Authorization: Bearer $OMNIROUTE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-4o-mini",
    "messages": [{"role": "user", "content": "Hello"}]
  }'

# Test backend Hermes endpoint
curl -X POST https://digitallydefined-os-backend.vercel.app/api?action=hermes \
  -H "Content-Type: application/json" \
  -H "x-api-key: $DASHBOARD_API_KEY" \
  -d '{"message": "Hello, Hermes!"}'

# Test brain.brief endpoint
curl -X GET https://digitallydefined-os-backend.vercel.app/api?action=brain.brief \
  -H "x-api-key: $DASHBOARD_API_KEY"
```

## Migration Steps

### Step 1: Configure OmniRoute

1. Get your OmniRoute API key from https://omniroute.ai
2. Add `OMNIROUTE_API_KEY` to your backend environment variables
3. (Optional) Configure `OMNIROUTE_MODEL` and fallback models

### Step 2: Deploy Backend

1. Deploy the updated backend code to Vercel
2. Ensure all new files are included:
   - `lib/omniroute.js`
   - `hermes/modules/omniroute.py`
   - `test-omniroute.js`
3. Set environment variables in Vercel dashboard

### Step 3: Test

1. Run the test script: `node test-omniroute.js`
2. Test the Hermes endpoint manually
3. Test the brain.brief endpoint
4. Check Vercel logs for any errors

### Step 4: Monitor

1. Monitor logs for 24-48 hours
2. Check for any fallback model usage
3. Verify all AI endpoints are working
4. Check error rates

### Step 5: Cleanup (Optional)

Once confirmed working:
1. Remove old API keys from environment variables
2. Remove old API keys from `.env` files
3. Update documentation

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (React/Vite)                 │
│                                                              │
│  ┌──────────────┐      ┌──────────────┐                    │
│  │   Dashboard   │      │  Landing Page│                    │
│  └──────┬───────┘      └──────┬───────┘                    │
│         │                     │                              │
│         └──────────┬──────────┘                              │
│                    │                                         │
│            api/hermes.js (proxy)                             │
│                    │                                         │
└────────────────────┼─────────────────────────────────────────┘
                     │
                     │ HTTP
                     │
┌────────────────────┼─────────────────────────────────────────┐
│                    │                                         │
│            Backend (Node.js/Vercel)                          │
│                    │                                         │
│  ┌─────────────────▼──────────────────┐                     │
│  │  api/index.js (main router)        │                     │
│  │  - /api?action=hermes              │                     │
│  │  - /api?action=brain.brief         │                     │
│  │  - /api?action=automation.sync     │                     │
│  └─────────────────┬──────────────────┘                     │
│                    │                                         │
│  ┌─────────────────▼──────────────────┐                     │
│  │  lib/omniroute.js                  │                     │
│  │  - Unified AI gateway client       │                     │
│  │  - Auto-fallback support           │                     │
│  │  - Error handling                  │                     │
│  └─────────────────┬──────────────────┘                     │
│                    │                                         │
└────────────────────┼─────────────────────────────────────────┘
                     │
                     │ HTTPS
                     │
┌────────────────────┼─────────────────────────────────────────┐
│                    │                                         │
│              OmniRoute Gateway                                │
│              (https://omniroute.ai)                           │
│                    │                                         │
│  ┌─────────────────▼──────────────────┐                     │
│  │  Model Router                      │                     │
│  │  - Load balancing                   │                     │
│  │  - Fallback logic                   │                     │
│  │  - Rate limiting                    │                     │
│  └─────────────────┬──────────────────┘                     │
│                    │                                         │
│  ┌─────────────────▼──────────────────┐                     │
│  │  LLM Providers                      │                     │
│  │  - OpenAI (GPT-4, etc.)            │                     │
│  │  - Anthropic (Claude)               │                     │
│  │  - Google (Gemini)                  │                     │
│  │  - Groq                             │                     │
│  │  - OpenRouter                       │                     │
│  │  - ZAI                              │                     │
│  │  - Nous                             │                     │
│  └────────────────────────────────────┘                     │
│                                                              │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                    Hermes MCP (Python)                        │
│                                                               │
│  ┌──────────────────────────────────────┐                    │
│  │  hermes/modules/omniroute.py         │                    │
│  │  - Python OmniRoute client           │                    │
│  │  - Same features as JS client        │                    │
│  └──────────────────────────────────────┘                    │
│                                                               │
│  Used by:                                                    │
│  - agents/product_generator_agent.py                         │
│  - agents/authority_blueprint_agent.py                       │
│  - Any future agents that need AI capabilities               │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

## Benefits

1. **Unified API Key Management**
   - Single API key for all AI requests
   - No need to manage multiple provider keys
   - Easier rotation and security

2. **Auto-Fallback**
   - Automatic failover to alternative models
   - Improved reliability
   - Better uptime

3. **Cost Optimization**
   - OmniRoute can route to most cost-effective model
   - Free models available via OpenRouter
   - No vendor lock-in

4. **Simplified Codebase**
   - Single client implementation
   - Consistent error handling
   - Easier to maintain

5. **Better Monitoring**
   - Single point for logging
   - Easier to track usage
   - Centralized metrics

## Troubleshooting

### Issue: "OMNIROUTE_API_KEY not configured"

**Solution:**
1. Verify the environment variable is set in Vercel
2. Check that it's spelled correctly (case-sensitive)
3. Ensure it's available in the backend deployment

### Issue: "All OmniRoute models failed"

**Solution:**
1. Check `OMNIROUTE_BASE_URL` is correct
2. Verify API key is valid (test with curl)
3. Check network connectivity from Vercel to OmniRoute
4. Review OmniRoute status page

### Issue: Rate limiting

**Solution:**
1. Add fallback models: `OMNIROUTE_FALLBACK_MODEL_1`, `OMNIROUTE_FALLBACK_MODEL_2`
2. Use free models via OpenRouter (e.g., `openai/gpt-4o-mini`)
3. Implement request caching if appropriate

### Issue: Timeout errors

**Solution:**
1. Increase timeout in client (default: 60s)
2. Check OmniRoute service status
3. Consider using faster models for time-sensitive requests

### Issue: Hermes MCP not using OmniRoute

**Solution:**
1. Verify `hermes/modules/omniroute.py` exists
2. Check `OMNIROUTE_API_KEY` is set in Python environment
3. Verify `mcp_server.py` imports OmniRoute tools
4. Check Python logs for import errors

## Files Modified/Created

### Created
- `lib/omniroute.js` - Node.js OmniRoute client
- `hermes/modules/omniroute.py` - Python OmniRoute client
- `test-omniroute.js` - Test script for Node.js client
- `.env.omniroute.example` - Environment variable documentation
- `OMNIROUTE_INTEGRATION.md` - This file

### Modified
- `api/hermes.js` - Replaced OpenRouter/Groq with OmniRoute
- `api/index.js` - Replaced Groq with OmniRoute in fetchAIBrief
- `lib/sync-aggregator.js` - Replaced Groq with OmniRoute in buildAIBrief
- `hermes/mcp_server.py` - Added OmniRoute tools to MCP

### No Changes Needed
- Frontend `api/hermes.js` - Already routes through backend
- `api/cron/sellable.js` - Dry-run only, no AI calls
- Antigravity modules - No direct AI calls
- All other API endpoints - Don't use AI directly

## Next Steps

1. **Deploy to Production**
   - Deploy backend with new code
   - Set environment variables
   - Monitor logs

2. **Test Thoroughly**
   - Run test script
   - Test all AI endpoints
   - Verify fallback behavior

3. **Monitor**
   - Watch for errors in Vercel logs
   - Monitor OmniRoute usage
   - Check response times

4. **Optimize**
   - Adjust fallback models based on performance
   - Tune timeouts if needed
   - Consider caching for repeated requests

5. **Cleanup**
   - Remove old API keys once confirmed working
   - Update documentation
   - Train team on new architecture

## Support

For issues with:
- **OmniRoute**: Contact OmniRoute support or check https://omniroute.ai/docs
- **Integration**: Review this document and test scripts
- **Backend**: Check Vercel logs and this documentation

## Version

- **Implementation Date**: 2026-07-18
- **OmniRoute Client Version**: 1.0.0
- **Status**: Production Ready