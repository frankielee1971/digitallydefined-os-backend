# Notion Architect Mode — Additional Migration Payloads

> **Mode:** Dry-run only. No HTTP requests sent.
> **Status:** Prepared for user review and approval.
> **Prerequisite:** Payloads A–D from the main architecture report must be reviewed first.

---

## Payload E: Create `Someday / Maybe` Database

**Parent:** `DigitallyDefined OS — Internal`
**Title:** `Someday / Maybe`

```json
{
  "parent": { "type": "page_id", "page_id": "[PARENT_PAGE_ID]" },
  "icon": { "type": "emoji", "emoji": "🌱" },
  "title": [{ "type": "text", "text": { "content": "Someday / Maybe" } }],
  "properties": {
    "Task": { "title": {} },
    "Context": { "select": { "options": [
      {"name": "Offers"}, {"name": "Content"}, {"name": "Community"},
      {"name": "Ops"}, {"name": "Money"}
    ]}},
    "Status": { "status": { "options": [
      {"name": "Someday / Maybe", "color": "yellow"},
      {"name": "Waiting-For", "color": "orange"},
      {"name": "Someday / Maybe (90 days)", "color": "pink"},
      {"name": "Maybe 6mo", "color": "blue"}
    ]}},
    "Energy": { "select": { "options": [
      {"name": "High"}, {"name": "Medium"}, {"name": "Low"}
    ]}},
    "Ease Score": { "number": { "format": "number" } },
    "Friction": { "select": { "options": [
      {"name": "None"}, {"name": "Light"}, {"name": "Medium"}, {"name": "Heavy"}
    ]}},
    "Linked Project": { "relation": { "database_id": "[PROJECTS_DB_ID]", "type": "page_id" } },
    "Linked Area": { "relation": { "database_id": "[AREAS_DB_ID]", "type": "page_id" } },
    "Linked Product": { "relation": { "database_id": "[PRODUCT_OS_DB_ID]", "type": "page_id" } },
    "Due Date": { "date": {} },
    "Due Time": { "date": {} },
    "CreatedByAutomation": { "checkbox": {} },
    "ActionedAt": { "date": {} },
    "Source Page": { "url": {} },
    "Next Step": { "rich_text": {} }
  }
}
```

**Note:** This database is a sibling of `GTD Inbox`. It shares the same schema but constrains `Status` to the Someday/Maybe option set.

---

## Payload F: Add `Next Action` Relation to `Automation Log DB`

**Target DB:** `Automations Log DB` (ID: `10c0d0cb...`)
**New property:** `Next Action`

```json
{
  "database_id": "10c0d0cb...",
  "properties": {
    "Next Action": {
      "relation": {
        "database_id": "[GTD_INBOX_DB_ID]",
        "type": "page_id"
      }
    }
  }
}
```

**Purpose:** Hermes Worker failure retry — when an automation fails, create a GTD task linked back to the log entry.

---

## Payload G: Add `Next Action` Relation to `Automation Events DB`

**Target DB:** `Automation Events` (ID: `18284a0e...`)
**New property:** `Next Action`

```json
{
  "database_id": "18284a0e...",
  "properties": {
    "Next Action": {
      "relation": {
        "database_id": "[GTD_INBOX_DB_ID]",
        "type": "page_id"
      }
    }
  }
}
```

**Purpose:** Dead-letter queue — when an automation event enters `Failed` status, Hermes auto-creates a GTD task.

---

## Payload H–M: Canonicalize Status Option Sets

These PATCH operations normalize existing status properties to the canonical option sets defined in §10.2 of the architecture plan.

**Important:** Notion API does not support bulk option replacement. Each database requires an individual `PATCH /databases/{id}` call with the full updated `status` property schema.

> **WARNING:** Overwriting existing options may affect views that depend on specific option names. Review view filters before running.

### Payload H: Product OS — Status
**Target DB:** `Product OS` (ID: `34cc7c53...`)

```json
{
  "database_id": "34cc7c53...",
  "properties": {
    "Status": {
      "status": {
        "options": [
          {"name": "Draft", "color": "gray"},
          {"name": "Build", "color": "yellow"},
          {"name": "Live", "color": "green"},
          {"name": "Archived", "color": "red"}
        ]
      }
    }
  }
}
```

### Payload I: Ideas & Intake DB — Status
**Target DB:** `Ideas & Intake DB` (ID: `f280d0cb...`)

```json
{
  "database_id": "f280d0cb...",
  "properties": {
    "Status": {
      "status": {
        "options": [
          {"name": "Intake", "color": "gray"},
          {"name": "Researching", "color": "blue"},
          {"name": "BuildQueue", "color": "yellow"},
          {"name": "Live", "color": "green"},
          {"name": "Stale", "color": "red"}
        ]
      }
    }
  }
}
```

### Payload J: Digital Assets DB — Status
**Target DB:** `Digital Assets DB` (ID: `9400d0cb...`)

```json
{
  "database_id": "9400d0cb...",
  "properties": {
    "Status": {
      "status": {
        "options": [
          {"name": "Draft", "color": "gray"},
          {"name": "Ready", "color": "blue"},
          {"name": "Live", "color": "green"},
          {"name": "Retired", "color": "red"}
        ]
      }
    }
  }
}
```

### Payload K: Content Blocks DB — Status
**Target DB:** `Content Blocks DB` (ID: `eb50d0cb...`)

```json
{
  "database_id": "eb50d0cb...",
  "properties": {
    "Status": {
      "status": {
        "options": [
          {"name": "Scratch", "color": "gray"},
          {"name": "Draft", "color": "blue"},
          {"name": "Approved", "color": "yellow"},
          {"name": "Published", "color": "green"}
        ]
      }
    }
  }
}
```

### Payload L: Automations Log DB — Status
**Target DB:** `Automations Log DB` (ID: `10c0d0cb...`)

```json
{
  "database_id": "10c0d0cb...",
  "properties": {
    "Status": {
      "status": {
        "options": [
          {"name": "Queued", "color": "gray"},
          {"name": "Running", "color": "blue"},
          {"name": "Succeeded", "color": "green"},
          {"name": "Failed", "color": "red"},
          {"name": "Dead Letter", "color": "orange"}
        ]
      }
    }
  }
}
```

### Payload M: Automation Events DB — Status
**Target DB:** `Automation Events` (ID: `18284a0e...`)

```json
{
  "database_id": "18284a0e...",
  "properties": {
    "Status": {
      "status": {
        "options": [
          {"name": "Pending", "color": "gray"},
          {"name": "Processing", "color": "blue"},
          {"name": "Done", "color": "green"},
          {"name": "Failed", "color": "red"}
        ]
      }
    }
  }
}
```

---

## Payload N–Q: Rollup Properties

### Payload N: Product OS → `Product asset count`

```json
{
  "database_id": "[PRODUCT_OS_DB_ID]",
  "properties": {
    "Product asset count": {
      "rollup": {
        "relation_property_name": "Modules",
        "rollup_property_name": "count",
        "function": "count_all"
      }
    }
  }
}
```

### Payload O: Digital Assets DB → `Asset revenue attached`

```json
{
  "database_id": "[DIGITAL_ASSETS_DB_ID]",
  "properties": {
    "Asset revenue attached": {
      "rollup": {
        "relation_property_name": "Money Snapshot",
        "rollup_property_name": "Revenue",
        "function": "sum"
      }
    }
  }
}
```

### Payload P: Monthly Review DB → `Monthly review automation count`

```json
{
  "database_id": "[MONTHLY_REVIEW_DB_ID]",
  "properties": {
    "Monthly review automation count": {
      "rollup": {
        "relation_property_name": "Automations Log",
        "rollup_property_name": "Run ID",
        "function": "count_unique"
      }
    }
  }
}
```

### Payload Q: Digital Assets DB → `Reputation linked count`

```json
{
  "database_id": "[DIGITAL_ASSETS_DB_ID]",
  "properties": {
    "Reputation linked count": {
      "rollup": {
        "relation_property_name": "TM",
        "rollup_property_name": "Signal Name",
        "function": "count_all"
      }
    }
  }
}
```

### Payload R: Automation Events DB → `Automation failure count`

```json
{
  "database_id": "[AUTOMATION_EVENTS_DB_ID]",
  "properties": {
    "Automation failure count": {
      "rollup": {
        "relation_property_name": "Automation Log",
        "rollup_property_name": "Error Message",
        "function": "count_not_empty"
      }
    }
  }
}
```

### Payload S: Projects → `GTD next action queue length`

```json
{
  "database_id": "[PROJECTS_DB_ID]",
  "properties": {
    "GTD next action queue length": {
      "rollup": {
        "relation_property_name": "GTD Next Action",
        "rollup_property_name": "Task",
        "function": "count_where",
        "filter": {"property": "Status", "status": {"equals": "Next"}}
      }
    }
  }
}
```

**Note:** Notion rollups do not support `count_where` with arbitrary status filters via API in all cases. If the API rejects `count_where`, fallback to `count_all` and filter in the frontend view.

---

## Payload T: Backend Schema Alignment — `lib/notion-schema.js`

The backend schema probe must recognize the new GTD databases and their property names. This is a code change, not an API payload.

**Required updates:**

1. Add GTD database IDs to the `KNOWN_DATABASES` map once created.
2. Add GTD property names to the `REQUIRED_PROPERTIES` schema contract.
3. Extend `validateDatabase()` to check for:
   - `GTD Inbox` and `Someday / Maybe` parentage under `DigitallyDefined OS — Internal`.
   - `CreatedByAutomation` checkbox on GTD databases.
   - `Next Action` relation on `Automation Log DB` and `Automation Events DB`.
4. Align event logging schema with §6.11 / §6.12 property names.

**Proposed code additions (dry-run pseudo-diff):**

```javascript
// Add to KNOWN_DATABASES after Projects/Areas are defined
GTD_INBOX: { expectedTitle: 'GTD Inbox', expectedParent: 'DIGITALLY_DEFINED_OS_INTERNAL' },
SOMEDAY_MAYBE: { expectedTitle: 'Someday / Maybe', expectedParent: 'DIGITALLY_DEFINED_OS_INTERNAL' },

// Add to REQUIRED_PROPERTIES
GTD_INBOX: ['Task', 'Context', 'Status', 'Energy', 'Ease Score', 'Friction', 'Linked Project', 'Linked Area', 'Linked Product', 'Due Date', 'Due Time', 'CreatedByAutomation', 'ActionedAt', 'Source Page', 'Next Step'],

// Extend validateDatabase() call sites
validateGtdDatabase(db) {
  return this.validateDatabase(db, this.REQUIRED_PROPERTIES.GTD_INBOX);
},

// Update event schema mapping
EVENT_LOG_SCHEMA: {
  databaseId: process.env.NOTION_AUTOMATIONS_DB_ID,
  requiredProperties: ['Event ID', 'EventType', 'Status', 'TriggeredBy', 'TargetDatabase', 'Payload', 'Run ID', 'Error Message', 'CreatedTime'],
}
```

---

## Payload U: View Configuration Recommendations

Notion views are not writable via the API. These are manual UI configuration steps to be applied after the schema migrations are complete.

### GTD Inbox Views
| View Name | Filter | Grouping | Sort |
|-----------|--------|----------|------|
| Next Actions | `Status` = `Next` | `Context` | `Energy` desc |
| Waiting For | `Status` = `Waiting` | `Linked Project` | `Due Date` asc |
| Scheduled | `Status` = `Scheduled` | `Due Date` | `Due Date` asc |
| Someday / Maybe | `Status` = `Someday / Maybe` | `Context` | `Ease Score` desc |
| Automatically Generated | `CreatedByAutomation` = `true` | `Linked Project` | `CreatedTime` desc |

### Product / Asset Views
| View Name | Filter | Sort |
|-----------|--------|------|
| Revenue pipeline | `Money Snapshot` not empty | `Month` desc |
| Build queue | `Status` = `BuildQueue` | `Build Now` desc, `Build Effort` asc |
| Launch soon | `Launch Date` within 14 days | `Launch Date` asc |
| Live | `Status` = `Live` | `Publish Date` desc |
| AI Ready | `Ready for AI` = `true` | `Strategic Fit Score` desc |
| Broken | `ErrorLog` not empty | `Last Edited Time` desc |

### Content Views
| View Name | Filter | Sort |
|-----------|--------|------|
| Approved queue | `Status` = `Approved`, `Publish Date` empty | `Publish Date` asc |
| Reusable | `Reusable` = `true` | `Platform` |
| Pillar queue | `Pillar` set, `Status` != `Published` | `Type`, `Platform` |

---

## Execution Order (Recommended)

1. **Payloads A + E** — Create `GTD Inbox` and `Someday / Maybe`
2. **Payloads F + G** — Add `Next Action` relations to Automation Log DB and Automation Events DB
3. **Payloads H–M** — Canonicalize status options (6 databases)
4. **Payload C** — Replace duplicate `DigitalAssets` rich-text columns with relations
5. **Payloads N–R** — Create rollup properties
6. **Payload T** — Update `lib/notion-schema.js` to recognize new schema
7. **Payload U** — Manual view configuration (UI only, not API)
8. **Validation gate** — Confirm all databases, relations, and rollups are functional before marking Notion Architect Mode complete.

---

## Coverage Matrix

| Architecture Plan Section | Payload(s) | Status |
|---------------------------|------------|--------|
| §3 GTD Databases | A, E, F, G | Prepared |
| §6.1 Digital Business OS | H (status canonicalization) | Prepared |
| §6.2 Ideas & Intake DB | I (status canonicalization), B (relation) | Prepared |
| §6.3 Product OS | H (status canonicalization), N (rollup) | Prepared |
| §6.4 Digital Assets DB | J (status canonicalization), O, Q (rollups) | Prepared |
| §6.5 Content Blocks DB | K (status canonicalization) | Prepared |
| §6.6 PDF Intake DB | — | Schema already adequate |
| §6.7 Templates Library DB | — | Schema already adequate |
| §6.8 Money Snapshot DB | — | Schema already adequate; O references it |
| §6.9 Monthly Review DB | P (rollup) | Prepared |
| §6.10 Reputation Signals DB | — | Schema already adequate |
| §6.11 Automations Log DB | L (status canonicalization), F (relation) | Prepared |
| §6.12 Automation Events DB | M (status canonicalization), G, R (relation + rollup) | Prepared |
| §6.13 Website Analytics DB | — | Schema already adequate |
| §7 Relations | B, F, G | Prepared |
| §8 Rollups | N, O, P, Q, R, S | Prepared |
| §9 Views | U | Documented for manual UI |
| §10 Naming/Contracts | H–M (status sets) | Prepared |
| §11 Automation Checklist | T (backend update) | Prepared |

---

**Ready for approval or adjustment.**
