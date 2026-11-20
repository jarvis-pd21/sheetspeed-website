# Security overview (no SOC 2)

**One page for a security reviewer.** SheetSpeed is a Chrome extension operated by Philip Dressler, doing business as Dressler Labs. Contact: jarvis@agi-jarvis.com. This page covers version 0.4.6 r65, the live Chrome Web Store version published 2026-11-19.

## What we do not have

We do **not** have a SOC 2 report. We also do not have ISO 27001, a third-party penetration-test report, a named DPO, cyber-insurance claims in this pack, SSO, or SCIM. We do not attach another vendor’s audit as if it were ours, and we do not have a certification timeline to publish.

## Compensating controls we actually have

- **Spreadsheet, Doc and Slide content never reaches a SheetSpeed server.** Dressler Labs does not receive the user’s Google access token. That is the main control.
- **Core needs no Google API access.** Shortcuts and key tips run on the open Google page in the browser.
- **Pro, after user consent, calls Google APIs from the browser only** (`sheets.googleapis.com`; Refresh from Sheets also uses Slides and Drive v3). Chrome holds the OAuth token.
- **No `<all_urls>`.** Content scripts are limited to Google Sheets, Docs and Slides document and create URLs. The Store package does not include remote code and does not include page-content analytics.
- **Manifest V3** with `script-src 'self'` in the extension CSP.
- **Required permissions** are `storage`, `activeTab`, and `identity` only. There is no `host_permissions` list and no local-companion permission. The four Google API hosts are optional and are not granted until a tool needs them. The 0.4.6 Store package does not include ExtensionPay.
- **Public documents:** Privacy, Terms, a DPA and a subprocessor list, with a 72-hour notice target for a personal-data breach of data Dressler Labs actually holds.
- **Admin rollback:** allow, block, or force-install on a small OU first (Store ID `ljlmgielacploapelnjhodicgbjipcaa`). Uninstall deletes extension storage on that Chrome profile. There is no vendor copy of workbooks to delete.
- **Operator access:** a sole proprietor; no employees with access to customer spreadsheet content, because that content is not hosted here.

## Known caveats to disclose

- Refresh from Sheets is off by default. If a user opts in, it briefly anyone-with-link shares a temporary Drive PNG and then tries to delete it; cleanup can fail. An administrator can force it off with the `slidesLinkShare` policy.
- `chrome.storage.sync` for settings is off by default. If the user turns it on, it lives in the user’s Chrome profile, not in a Dressler Labs system. An administrator can force it off with the `settingsSync` policy.
- Version 0.4.6 does not include a local companion app, and Settings does not mention a local model. Treat Store capability as **no AI**.
- There is no published change-of-control clause and no source-code escrow.
- Website visits hit Cloudflare (including a Web Analytics beacon), GitHub Pages, and Google Fonts. Support mail is Google Workspace.

## How to review

Start at the trust hub, then the IT FAQ, permission inventory, data map, Workspace admin guide, and the legal pages. Questionnaires are answered on request from the same facts. Do not treat this overview as a certification.

Last updated 19 November 2026.
