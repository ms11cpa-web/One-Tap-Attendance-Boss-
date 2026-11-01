# Boss — Avarian Global Network, CRM v7 source review
Date: 1 November 2026. Basis: user's uploaded `One-Tap-Attendance-Boss--main (1).zip`. This is a repository-snapshot review, **not an authenticated production penetration test or live deployment verification**.

## Main source findings (before this patch)

1. The sole `crm` navigation screen mixed commission-agent administration with student leads. `src/components/crm/CrmWorkspace.tsx` used a shared tab strip for four workflows; role badges in `EmployeesView.tsx` had poor dark-theme contrast.
2. The CRM state endpoint returned at most 500 admin leads or 350 staff leads, and at most 700 history items. There was no CRM Excel export or complete server-side paging. An exported report must not silently use that partial preview.
3. The `crm_leads.stage` field mixed admissions and visa decisions. One student's second university application or new visa attempt could overwrite the first attempt. `client_status` had only `lead`, `client`, `archived`, so closure/loss reasons were not recorded.
4. Team Managers could view any unassigned pending referral; management permissions for commission agents were implicitly available to all Team Managers. Some referral progress visibility also exposed internal notes/history from another team's case.
5. `phone_normalized` is **unique** in the existing `0007` schema. This is useful for duplicate flags but also prevents separate students sharing a guardian's number. We left this constraint unchanged rather than risk rebuilding the legacy table; it needs a separate, reviewed identity/duplicate-merge project.
6. The existing frontend relies heavily on hard-coded colors and compact fields. No screenshot-based end-to-end audit on actual browsers was possible here.
7. The project `package.json` uses `xlsx ^0.18.5`, a version with published advisories, and has previously shown a Vite/esbuild clean-install peer-conflict. This update does not silently replace dependencies; validate upgrades separately.

## Implemented in v7 overlay

- **Two office navigation entries:** `Leads & Clients` and `Commission-Based Team`, with corresponding mobile menu item. Ambassador and external commission portals remain separate.
- **Preserving student identity:** additive `0008_crm_cases_workflow.sql` creates student relationship profiles, university/visa application attempts and immutable application-stage history. Existing CRM records are backfilled in place with the same IDs and referrers; no attendance or office schema altered.
- **Lifecycle:** Lead / Active client / On hold / Completed / Lost / Closed. Closure/loss requires a reason, and authorized managers can reopen the original student. Application rejection and visa refusal belong to individual attempts; they do not erase or automatically close the person.
- **Application records:** multiple destinations, universities, courses, intakes, university decisions and visa outcomes for one client. Authorized case managers control stage updates and the system records every revision.
- **Follow-up queue and full history:** paginated work queue and per-student paginated, role-scoped activity timeline.
- **Accurate lists and metrics:** pages of 50 with search, “Show All Records,” Closed/Lost view and complete server-side counts. Previously hidden closed records remain available.
- **Excel export:** server-side permission checks, audit entry, all authorized matching records up to an explicit resource limit, separate sheets for Leads, Clients, Closed/Lost, All Students, Applications and Follow-ups; text fields protected against formula prefixes. Exports over the safety threshold return an explicit error instead of an incomplete file.
- **Access isolation:** only explicitly delegated office managers can manage commission agents; Team Managers can see and approve unassigned pending office referrals only from their own team; referrers do not gain confidential counselling notes, application details or complete case-history exports by virtue of attribution.
- **Visual fixes:** active tabs and employee role badges receive stronger light/dark contrast, readable form styles and visible focus outlines.
- **Local Node D1** emulator applies migration 0008 automatically so testing matches production schema.

## Workflow recommendation informed by external sources

The British Council's education-agent good-practice guidance emphasizes accurate, student-centered advice and honest information, and discourages misleading statements. Official immigration sources show **different** requirements by destination. Canada's IRCC study-permit process discusses acceptance letters, attestation letters and biometrics; Australia uses a Confirmation of Enrolment and ImmiAccount. Therefore, never force every application through one universal “VFS submitted” status. We model university admission and visa milestones independently by attempt; AGN must tailor exact checklists and permissions by destination.

Sources:
- British Council Bangladesh, *Guide to good practice for education agents*: https://www.britishcouncil.org.bd/sites/default/files/guide-to-good-practice-for-education-agents.pdf
- IRCC study permits: https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit/apply.html
- Australian Home Affairs student subclass 500: https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500
- W3C WCAG 2.2 AA contrast and keyboard focus: https://www.w3.org/TR/wcag/
- OWASP spreadsheet formula injection: https://owasp.github.io/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/07-Injection/21-CSV_Injection
- UK ICO privacy-by-design guidance (design reference; AGN must obtain advice about its actual applicable laws): https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/guide-to-accountability-and-governance/data-protection-by-design-and-by-default
- GitLab advisory for current SheetJS npm package: https://advisories.gitlab.com/pkg/npm/xlsx/

## Still necessary before a “production ready” assessment

1. **Run Vite full build, lint and a clean-install dependency security review.** The supplied environment cannot install all project dependencies or run real browser tests, so production build success is NOT claimed.
2. **Test actual account permissions** with separate Super Admin, HR, Team Manager, ordinary Employee, Ambassador, and Commission Agent accounts. Test own/referrer access, team assignments, unauthorized export, and account deactivation.
3. **Review sensitive student data handling**: verified consent, preferred contact methods, retention and deletion requests, device security, encrypted backups, access/audit reports, and restrictions on downloading Excel files. Do not upload passports/financial evidence to D1 without a designed secure documents system.
4. **Shared phone / duplicates:** current unique phone index blocks siblings using the same family number. Design an identity-based merge and conflict-resolution workflow, not an automatic phone-based merge. No destructive schema change was made here.
5. **Add configurable per-destination document checklist** with verified official rules and review dates before relying on it for application decisions. Visa decisions are recorded by staff; this software does not decide visa eligibility.
6. **Case milestones** currently capture outcomes, but do not link to official government systems and do not send WhatsApp or emails automatically. Agents should not offer regulated immigration advice where licensing rules prohibit it.
7. **Performance and scalability:** test 5,000+ cases, expensive exports, remote phone PWA notifications, task due-date transitions and mobile form usability. The 50,000-row-per-sheet export ceiling returns an explicit error at scale; a queued export service would be better for much larger datasets.
8. **Security backlog:** historical GitHub `.wrangler` cache exposure and the SheetJS npm dependency's public security advisories need deliberate follow-up. Do not share private keys or exported student information publicly.

## Test evidence and limits

- 33 existing and enhanced CRM/security/theme/notification/attendance tests passed in this container (Node 22, global TypeScript fallback for tests).
- 11 ambassador performance calculation tests passed.
- All 55 TypeScript/TSX source files parsed; no missing relative imports detected.
- SQLite migrations `0001`–`0008` executed in order; synthetic pre-existing CRM referrer and lead were retained; applying `0008` twice did not create duplicates.
- CRM API simulation covered team authorization, separate university cases, visa refusals, closure/reopening, >50-row paging, unauthorized exports, report completeness and formula-safe spreadsheet fields. The XLSX export test used a mock workbook, not an actual Excel application.
- No production Vite build, real-browser contrast audit, live D1 migration or live role-based testing was performed here.
