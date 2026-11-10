# SheetSpeed IT FAQ

**Forward this as-is to IT or security.** About 3–4 minutes. Chrome Web Store ID: `ljlmgielacploapelnjhodicgbjipcaa`. Evidence is the Store package built from `jarvis-pd21/sheetspeed-extension` at commit `2e2b338` (version 0.4.5 r64), plus the public legal pages.

**Bottom line.** SheetSpeed is a Manifest V3 Chrome extension. It has no SheetSpeed-operated server for spreadsheet or document content. Pro tools talk to Google APIs from the user’s browser, only after the user consents.

## Permissions in the early-access Store package

The **source** manifest also declares an `extensionpay.com` content script and optional `nativeMessaging`. **`npm run package:pro` drops both** while early access is on (`EARLY_ACCESS=true` in `extension/lib/pro-config.js`; transform in `scripts/lib/store-manifest.mjs`). Review the Store zip, not only the source tree.

| Permission or host | Why it is there |
| --- | --- |
| `storage` | Shortcut settings, enabled state, and Pro undo/recovery records on the device. A license cache is added only once billing opens. |
| `activeTab` | Act on the Google document the user is using when they invoke SheetSpeed. |
| `identity` | Ask Chrome for a Google access token, after the user approves the consent screen, so Pro tools can call Google APIs. |
| `https://sheets.googleapis.com/*` | Pro tools read and write the spreadsheet the user is working in, through the Google Sheets API. |
| `https://slides.googleapis.com/*` | Refresh from Sheets only: read the current slide and replace SheetSpeed-linked images. |
| `https://www.googleapis.com/drive/v3/*` and `https://www.googleapis.com/upload/drive/v3/*` | Refresh from Sheets only: upload, share, unshare, find and delete a temporary PNG in the **user’s** Drive. |
| Content scripts on Google Sheets, Docs and Slides document and create URLs | Run shortcuts, key tips and the panel on those pages. Docs are local only: no Docs API, no document text sent. |

**Not in the Store package today:** `nativeMessaging` (local development AI helper) and the `extensionpay.com` content script (billing). They are added only if those features are later packaged.

## Data flow

1. **Core shortcuts:** keyboard → extension on the Google page → Google’s existing document controls. Nothing goes to a SheetSpeed server.
2. **Pro tools (after Connect Google):** browser → Google Sheets, Slides or Drive APIs → the user’s Google files. The token stays in Chrome. Dressler Labs does not receive the token or the file contents.
3. **Local records:** settings and, for Pro edits, undo/recovery snapshots → `chrome.storage.local` on the device. Optional settings sync uses the user’s Chrome profile, not a SheetSpeed account.
4. **Website and support:** visits to https://sheetspeed.agi-jarvis.com go through Cloudflare to GitHub Pages, and load Google Fonts; support email goes to jarvis@agi-jarvis.com on Google Workspace. Separate from workbook processing.

**Refresh from Sheets caveat.** Google Slides can only replace an image from a URL, so SheetSpeed briefly link-shares a temporary PNG (`anyone with the link`, discovery off) in the user’s Drive, then tries to unshare and delete it. Cleanup can fail if the browser closes mid-way. Skip this feature where link sharing is prohibited.

## OAuth (Pro only, consent-based)

- **Nothing connects** until the user approves Google’s consent screen.
- **Client ID:** `289674995985-nel531mer5peurv6dt7e156tl79pj25p.apps.googleusercontent.com`
- **Scopes, in two steps:**
  - On Connect for Pro tools: `https://www.googleapis.com/auth/spreadsheets`
  - Only the first time the user runs Refresh from Sheets: also `https://www.googleapis.com/auth/presentations` and `https://www.googleapis.com/auth/drive.file` (files the app created, not full Drive)
- Google’s Sheets and Slides grants can be **broader than the one open file**. SheetSpeed’s commands target the open file (or the source spreadsheet stamped on a refreshed image).
- The app may still show Google’s **unverified app** notice while Google verification is pending.
- Users can disconnect in SheetSpeed Settings and revoke access at [myaccount.google.com/permissions](https://myaccount.google.com/permissions).

## Subprocessors (what Dressler Labs actually uses)

Listed at https://sheetspeed.agi-jarvis.com/subprocessors/: Google (Chrome Web Store, Google APIs for Pro, Fonts, Workspace mail), GitHub Pages, Cloudflare (including Web Analytics on the website). **ExtensionPay and Stripe activate only when paid billing opens** and are not contacted during early access.

Spreadsheet content is not processed by Dressler Labs.

## Allow, force-install, or block (Google Admin)

Cite: [Allow or block apps and extensions](https://support.google.com/chrome/a/answer/6177431) and [Automatically install apps and extensions](https://support.google.com/chrome/a/answer/6306504).

1. Sign in to the Google Admin console as an administrator.
2. Go to **Menu > Devices > Chrome > Apps & extensions > Users & browsers** (or, with Chrome Browser Cloud Management / Chrome Enterprise Core, **Menu > Chrome browser > Apps & extensions > Users & browsers**).
3. Select the **organizational unit** (or group, for users) you want the policy to apply to. Start with a pilot OU.
4. Add SheetSpeed from the Chrome Web Store, or by ID: `ljlmgielacploapelnjhodicgbjipcaa`.
5. Under **Installation policy**, choose:
   - **Allow install** — users may install it themselves.
   - **Force install** — it installs automatically; users cannot remove it. Force-install also grants the extension’s Chrome permissions.
   - **Block** — users cannot install it; existing installs are removed.
   - **Force install + pin to ChromeOS taskbar** — force-install, and pin on **ChromeOS**. For pinning on the Chrome **browser toolbar** (Windows, Mac, Linux), use the `ExtensionSettings` policy field `toolbar_pin: force_pinned`. See [Configure ExtensionSettings policy](https://support.google.com/chrome/a/answer/9867568).
6. Click **Save**.

If your domain **blocks all Chrome Web Store items except an allowlist**, add this ID to the allowlist or the install will fail. The Chrome Web Store service should be on for user-initiated installs; force-installed extensions still install if the Store service is off ([Google’s note](https://support.google.com/chrome/a/answer/6177431)).

**Windows, Mac or Linux browsers** need Chrome browser management turned on for that OU ([Set Chrome policies](https://support.google.com/chrome/a/answer/2657289)).

## How to remove it

- **Not force-installed:** the user opens `chrome://extensions` and removes SheetSpeed. Uninstalling deletes local extension storage (settings and undo records). It cannot undo edits already written to the Google file.
- **Force-installed:** an admin changes the installation policy off of Force install, or sets **Block**. Google documents that removing an item from the force-install list removes it from the user’s machine ([force-install article](https://support.google.com/chrome/a/answer/6306504)).
- **Google account access:** Settings → Disconnect in the extension, and revoke SheetSpeed at [myaccount.google.com/permissions](https://myaccount.google.com/permissions).
- Inspect Drive for any leftover “SheetSpeed refresh (temporary).png” if Refresh from Sheets was used.


## What leaves the browser

**Spreadsheet, Doc and Slide content never goes to a SheetSpeed server.** Dressler Labs does not receive your Google access token.

| What | Does it leave the browser? | Where it goes |
| --- | --- | --- |
| Core shortcuts, key tips, Docs processing | No. They run on the open Google page. | Nowhere off the device, except the document already lives in Google. |
| Pro tool reads and writes, after consent | Yes, to **Google only**, from the browser. | `sheets.googleapis.com`, and for Refresh from Sheets also `slides.googleapis.com` and Drive v3. |
| Settings / undo records | Only if the user turns on Chrome settings sync. Undo stays local. | Chrome local storage; optional Chrome sync under the user’s profile. |
| Support email you choose to send | Yes, if you email support. | jarvis@agi-jarvis.com on Google Workspace. |
| Website visits | Yes, ordinary page requests. | Cloudflare, GitHub Pages, Google Fonts, Cloudflare Web Analytics. No spreadsheet content. |
| License or payment data | Not during early access. | ExtensionPay and Stripe, only after billing opens. |

The extension does **not** use `<all_urls>`, does not load remote code, and does not include page-content analytics.

## Uninstall and data deletion

**Confirming removal**

1. If the extension was **not** force-installed: open `chrome://extensions` and remove SheetSpeed. The extension ID `ljlmgielacploapelnjhodicgbjipcaa` should no longer appear.
2. If it **was** force-installed: an admin must set the installation policy to **Block**, or remove **Force install**, then confirm it is gone on a test machine. Users cannot remove a force-installed extension themselves.
3. Revoke Google access at [myaccount.google.com/permissions](https://myaccount.google.com/permissions), and use Disconnect in SheetSpeed Settings if the extension is still installed.
4. Uninstalling deletes Chrome extension storage on that profile (settings and undo/recovery records). It cannot undo edits already saved in the Google file, and it cannot erase a leftover Drive temporary PNG — check Drive for “SheetSpeed refresh (temporary).png” if Refresh from Sheets was used.
5. Dressler Labs holds no copy of your spreadsheets to delete. To delete support email you sent, email jarvis@agi-jarvis.com and ask.

## Change of control

SheetSpeed is operated by Philip Dressler, doing business as Dressler Labs, a sole proprietorship. **There is no published change-of-control clause in the current Terms**, and no source-code escrow.

If ownership changed, the product were shut down, or the Chrome Web Store listing were transferred or unpublished, the honest process today would be: notice on the website and, if still possible, in the extension; customers can uninstall and revoke Google access at any time. Because Dressler Labs does not host spreadsheet content, there is no vendor database of workbooks to migrate or hand over. Google files, Chrome local storage, and OAuth grants stay under the customer’s and user’s own accounts.

This is a real gap for some reviews. A contractual commitment would be a separate [DECISION] for the operator, not something this pack invents.

## What we do not claim

No SOC 2, ISO 27001, penetration-test report, formal bug bounty, SSO/SCIM, or data-residency commitment. A standard [DPA](https://sheetspeed.agi-jarvis.com/dpa/) is offered. Personal-data breaches for data Dressler Labs actually holds are notified within 72 hours. Audits are by written questionnaire.

**Support:** jarvis@agi-jarvis.com
