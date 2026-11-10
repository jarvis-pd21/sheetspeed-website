# Security overview (no SOC 2)

**One page for a security reviewer.** SheetSpeed is a Chrome extension operated by Philip Dressler, doing business as Dressler Labs. Contact: jarvis@agi-jarvis.com.

## What we do not have

We do **not** have a SOC 2 report. We also do not have ISO 27001, a third-party penetration-test report, a named DPO, cyber-insurance claims in this pack, SSO, or SCIM. We do not attach another vendor’s audit as if it were ours, and we do not have a certification timeline to publish.

## Compensating controls we actually have

- **Spreadsheet, Doc and Slide content never reaches a SheetSpeed server.** Dressler Labs does not receive the user’s Google access token. That is the main control.
- **Core needs no Google API access.** Shortcuts and key tips run on the open Google page in the browser.
- **Pro, after user consent, calls Google APIs from the browser only** (`sheets.googleapis.com`; Refresh from Sheets also uses Slides and Drive v3). Chrome holds the OAuth token.
- **No `<all_urls>`.** Content scripts are limited to Google Sheets, Docs and Slides document and create URLs. The Store package does not include remote code and does not include page-content analytics.
- **Manifest V3** with `script-src 'self'` in the extension CSP.
- **Host permissions** are the four Google API prefixes listed in the IT FAQ, plus `storage`, `activeTab`, and `identity`. During early access the Store package drops the ExtensionPay content script and `nativeMessaging`.
- **Public documents:** Privacy, Terms, and (once published) a DPA and subprocessor list, with a 72-hour notice target for a personal-data breach of data Dressler Labs actually holds.
- **Admin rollback:** allow, block, or force-install on a small OU first (Store ID `ljlmgielacploapelnjhodicgbjipcaa`). Uninstall deletes extension storage on that Chrome profile. There is no vendor copy of workbooks to delete.
- **Operator access:** a sole proprietor; no employees with access to customer spreadsheet content, because that content is not hosted here.

## Known caveats to disclose

- Refresh from Sheets briefly anyone-with-link shares a temporary Drive PNG and then tries to delete it; cleanup can fail. Leave this tool unused if that is unacceptable.
- `chrome.storage.sync` for settings, if the user turns it on, lives in the user’s Chrome profile, not in a Dressler Labs system.
- Settings copy in the Store-shipped options page may still mention a local DeepSeek helper; the Store package cannot enable `nativeMessaging`. Treat Store capability as **no AI**.
- There is no published change-of-control clause and no source-code escrow.
- Website visits hit Cloudflare (including a Web Analytics beacon), GitHub Pages, and Google Fonts. Support mail is Google Workspace.

## How to review

Start at the trust hub, then the IT FAQ, permission inventory, data map, Workspace admin guide, and the legal pages. Questionnaires are answered on request from the same facts. Do not treat this overview as a certification.
