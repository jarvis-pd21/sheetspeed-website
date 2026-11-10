# Objection-handling card (in your voice)

**For you, before the meeting. Not a vendor script to read aloud.** Use the lines you actually believe. Every factual claim below is something the trust pack also states, so you are not inventing it.

---

**“We don’t have time for another tool.”**
This is a Chrome extension in the files we already use, not a new app or a new file type. The ask is a 30-day pilot for a small group, with written criteria and a go/no-go date — not an open-ended rollout. If it gets in the way, we uninstall.

**“They don’t have SOC 2.”**
That’s true, and we should say it plainly. They also do not have ISO 27001 or a penetration-test report. What they do have: spreadsheet content is not sent to a SheetSpeed server; Core shortcuts need no Google API; the extension is limited to Google document pages and listed Google APIs; no `<all_urls>`, no remote code, no page-content analytics; a public DPA, subprocessor list, and 72-hour breach notice for personal data they actually hold. We can still run IT review, start it in parallel with the pilot, and keep Refresh from Sheets unused if we want to avoid the temporary Drive image.

**“Google already has shortcuts / our people will not switch.”**
Google’s shortcuts are not the Excel Alt set our team already has in muscle memory. This is for people who still reach for those keys. The pilot is optional for the group; we measure whether they actually use it, instead of assuming they will.

**“It isn’t in the budget.”**
The pilot is $0, including during their early access. After billing opens, list price is $69/user/year. I will put our numbers in the one-page business case — hard savings first, if we would actually cancel something, and hours labelled as a soft estimate. I also need to know our software-request path for a purchase of this size; I am not assuming a dollar cutoff skips IT review.

**“The Google scopes are too broad / our data will leave the company.”**
Workbook content does not go to Dressler Labs. Core needs no Google connection. Pro, if someone uses it, talks to Google from the browser after consent. The scopes are Google Sheets, Google Slides, and Drive files the extension creates (`drive.file` is not full Drive). IT can leave Pro unused, or restrict OAuth with “Specific Google data” for those three scopes, and can revoke access at any time.

**“What if the vendor is sold, or shuts down?”**
It is a sole proprietorship. They have no published change-of-control clause and no escrow. If that happens, we uninstall and revoke Google access. They do not hold a copy of our spreadsheets, so there is no vendor database to migrate. That is a real residual risk, and it is written in the IT FAQ — I am not hiding it.

---

If someone asks for a document that is not on https://sheetspeed.agi-jarvis.com/trust/, send them the page first. Do not promise a SOC 2 date, a customer reference, a custom liability cap, or a team price unless the operator has written it.
