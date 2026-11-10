# SheetSpeed workspace deployment guide

**Forward this as-is to the Workspace or Chrome admin.** Step-by-step rollout. Store ID: `ljlmgielacploapelnjhodicgbjipcaa`.

**Recommended path.** Pilot one organizational unit with **Allow install** or **Force install**. Verify shortcuts, consent denial, and (if you will permit it) Refresh from Sheets. Then widen the OU. Keep a documented rollback (set **Block**, or remove Force install).

## Before you start

- You need a Google Admin console administrator account.
- For Chrome on Windows, Mac or Linux, turn on Chrome browser management for the OU. See [Set Chrome policies for users or browsers](https://support.google.com/chrome/a/answer/2657289).
- Confirm whether your domain allowlists the Chrome Web Store or blocks everything by default. See [Allow or block apps and extensions](https://support.google.com/chrome/a/answer/6177431).
- Decide now whether **Refresh from Sheets** is in scope. It briefly link-shares a temporary Drive PNG. If your sharing policy forbids that, tell testers not to use it and do not need the Slides / `drive.file` OAuth scopes.

## 1. Pilot OU first

1. Create or pick a small **child organizational unit** (or a group of user accounts) for the pilot.
2. Sign in to the Admin console.
3. Go to **Menu > Devices > Chrome > Apps & extensions > Users & browsers** (Chrome Enterprise Core / Browser Cloud Management: **Menu > Chrome browser > Apps & extensions > Users & browsers**). Official steps: [Allow or block](https://support.google.com/chrome/a/answer/6177431), [Force install](https://support.google.com/chrome/a/answer/6306504).
4. Select the **pilot OU** (or group).
5. Add the extension from the Chrome Web Store or by ID `ljlmgielacploapelnjhodicgbjipcaa`.
6. Set **Installation policy**:
   - **Allow install** if you want volunteers to opt in. Best for a first pilot.
   - **Force install** if you want it present for every account in the OU, silently, and not removable by the user. Force-install grants the extension’s Chrome permissions.
7. Click **Save**.

## 2. Force install vs allow

| Policy | What happens | When to use it |
| --- | --- | --- |
| Allow install | Users can install from the Store; they can remove it. | Pilot, or teams that should opt in. |
| Force install | Installed automatically; users cannot remove it. | After a successful pilot, if IT wants a standard image. |
| Block | Cannot install; existing copies are removed. | Rollback, or orgs that decline the product. |
| Force install + pin to ChromeOS taskbar | Force-install, pinned on **ChromeOS** only. | ChromeOS fleets that want the icon visible. |

## 3. Pinning

**Yes, Google supports pinning, with a platform split.**

- In the Admin console installation policy, **Force install + pin to ChromeOS taskbar** pins on **ChromeOS**. Source: [Automatically install apps and extensions](https://support.google.com/chrome/a/answer/6306504).
- To pin the icon to the **Chrome toolbar** on managed Windows, Mac or Linux browsers, set `toolbar_pin` to `force_pinned` in the `ExtensionSettings` policy for this extension ID. Source: [Configure ExtensionSettings policy](https://support.google.com/chrome/a/answer/9867568). If you do not set it, the default is unpinned (the user can pin it).
- After pinning, verify on a test device: open `chrome://policy`, reload policies, and confirm the `ExtensionSettings` (Google’s page also says `ExtensionSetting`) value is valid JSON. Google recommends testing on a small OU first because an invalid JSON string can prevent pinning.

## 4. Trust the OAuth app (Pro tools only)

Core shortcuts do **not** need this. Do it if the pilot will use Pro tools (trace dependents, goal seek, what-if, freeze, auto-color, format cycles, Paste Exact, image export, or Refresh from Sheets).

**Client ID:** `289674995985-nel531mer5peurv6dt7e156tl79pj25p.apps.googleusercontent.com`

**Scopes to allow, and no others:**

- `https://www.googleapis.com/auth/spreadsheets`
- `https://www.googleapis.com/auth/presentations` (Refresh from Sheets)
- `https://www.googleapis.com/auth/drive.file` (Refresh from Sheets; not full Drive)

Google currently classifies `spreadsheets` and `presentations` among high-risk Drive & Docs scopes in [API controls](https://support.google.com/a/answer/7281227). The app may appear **unverified** until Google’s verification finishes. Users can be blocked from unverified apps unless an admin configures access. See [Authorize unverified third-party apps](https://knowledge.workspace.google.com/admin/apps/authorize-unverified-third-party-apps) and [Control which apps access Google Workspace data](https://support.google.com/a/answer/7281227).

**Recommended setting: Specific Google data**, limited to the three scopes above — not **Trusted** (Trusted would allow all Google Workspace scopes).

Steps (from Google’s API controls article, last checked 10 November 2026):

1. Admin console: **Menu > Security > Access and data control > API controls**.
2. Click **Manage App Access**.
3. Click **Configure new app**, search by the client ID above, and select the app. If it is not searchable yet, a user in the pilot OU must attempt Connect Google once; accessed apps can take 24–48 hours to appear.
4. Scope the change to the **pilot OU** first.
5. Choose **Specific Google data** and allow only the scopes listed above. If Connect Google also requires Sign-in scopes, include only those Google says are required for sign-in. SheetSpeed itself requests the three scopes above, not a Google Sign-in profile scope.
6. Save. Confirm a pilot user can complete the consent screen, and that a user **outside** the OU is unchanged.

Do **not** disable organization sharing policies to make Refresh from Sheets work.

## 5. Verification checklist (pilot OU)

On a **non-confidential** test spreadsheet, in a managed Chrome profile:

- [ ] Extension ID in `chrome://extensions` is `ljlmgielacploapelnjhodicgbjipcaa`.
- [ ] A Core shortcut works without connecting Google (for example an Alt sequence or command search).
- [ ] Denying the Google consent screen leaves Core working and Pro tools blocked.
- [ ] After consent, one Pro tool works on the test sheet, then Disconnect and revoke at [myaccount.google.com/permissions](https://myaccount.google.com/permissions).
- [ ] If Refresh from Sheets is in scope, test it once and confirm the temporary Drive file is deleted. If it is out of scope, confirm testers know not to use it.
- [ ] Clear local undo history in Settings, then uninstall or Block on a test account and confirm the extension is gone.

## 6. Broader rollout

After the pilot check-in, apply the same installation policy to parent or sibling OUs. Re-check `chrome://policy` on one machine in each new OU. A Store extension can update itself; an approved install is not a permanent version freeze — review Chrome update controls if you need to stage versions.

## 7. Rollback

1. In **Users & browsers**, select the OU, set SheetSpeed to **Block**, or remove **Force install**, and Save. Google states that dropping force-install removes the item from the user’s machine.
2. Ask users who connected Google to revoke SheetSpeed at [myaccount.google.com/permissions](https://myaccount.google.com/permissions).
3. If you configured API controls, set the OAuth app to **Blocked** for that OU, or unconfigure it, so Pro tokens cannot be reused.
4. Optional: testers inspect Drive for leftover temporary PNGs.

**Support:** jarvis@agi-jarvis.com
