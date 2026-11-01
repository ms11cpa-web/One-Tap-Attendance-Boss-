# AGN CRM features matched to existing Boss sections (v7.1)

Requested official channels: https://www.avarianglobal.com · https://www.facebook.com/avarianglobal · WhatsApp +880 1408-425035 (`https://wa.me/8801408425035`) · avarianglobalnetwork@gmail.com.

| Recommended workflow | Boss location | Current status |
| --- | --- | --- |
| AGN official contact shortcuts | Office sidebar footer, Leads & Clients header, Commission-Based Team header | **Implemented in v7.1** |
| Manual one-click contact to a student | Lead Details > Open WhatsApp | **Implemented in v7.1**, no automatic send |
| Bulk historical Excel/CSV upload with headers | Leads & Clients > Import Excel/CSV | **Implemented in v7.1**, 6 fields, 2 MB/2,000 rows, server 50-row atomic batches |
| Duplicate review, no record overwrite | Import preview/API validation | **Implemented in v7.1**, phone clashes flagged; no household merging |
| Import audit and unknown contact consent | CRM import batches, per-record consent verification | **Implemented in v7.1** |
| Recurring 3-day contact | Lead Details > Log contact; Follow-up Queue > Upcoming | **Implemented in v7.1**, 1-day no-answer retry; no false contact timestamps |
| Automatically remove completed work from due queue | Due/Overdue computed from next action date | **Implemented in v7.1**; not hidden from main Lead/Client register |
| Scoped counsellor queue | Leads & Clients > Follow-up Queue | **Existing v7 access scoping + refined in v7.1** |
| Bulk owner assignment and balanced work distribution | Leads & Clients > planned batch action | **Not yet built**; individual owner assignment exists |
| Manager escalations and daily push reminders | Future notifications / management dashboard | **Not yet built**; current Cloudflare cron serves other workflows |
| Hot/warm/cold lead scoring | Lead Tracker > planned priority filter | **Not yet built** |
| WhatsApp/email message templates | Lead Details > future message actions | **Not yet built** (only manual links) |
| Lead source and referral ROI metrics | CRM > future analytics | **Partial**: source attribution and basic counters exist; no ROI report |
| Dormant lead reactivation | Closed/Lost or Follow-up Queue > future campaign | **Not yet built**; no unsolicited messages |
| Client conversion/application/visa tracking | Leads & Clients > Client List / Student Relationship | **Existing v7** |
| Excel reports for management | Leads & Clients > Download Complete Excel | **Existing v7** |
| Website/Facebook/Google Sheets sync | Future AGN digital integrations | **Not yet built**; requires provider connection/authorization |

Source alignment: current Boss v7, existing Cloudflare Worker/SQLite D1 schema, official WhatsApp click-to-chat format, and Cloudflare Workers cron scheduling docs. This is not confirmation that the live app has deployed v7.1 or that any student has opted into messaging.

## Why this sequence

Import and due/overdue queue are foundational; without a trustworthy import, contact history, consent and assignment, automated push/escalation could blast unverified students or create ghost follow-up tasks. The later features should be implemented after one anonymized copy of AGN's actual historical sheet has been mapped and an authorized manager confirms operational rules.
