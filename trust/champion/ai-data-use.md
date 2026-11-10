# AI and data-use statement

**Only what is true of the Chrome Web Store package today.**

SheetSpeed’s **Store-shipped product does not send your spreadsheet, Doc or Slide content to an AI model, and it does not include a working AI feature.** There is no claim that customer content is used to train a model, because that content is not sent to Dressler Labs or to an AI vendor.

The **source** tree has an optional `nativeMessaging` helper historically described as a local DeepSeek path. That permission is **stripped from the early-access Store package**, so Store users cannot turn it on. Leftover wording in Settings may still mention it; that wording is stale. Review the Store package, not the source-tree description, when you assess production risk.

**Core** shortcuts and key tips run locally in the browser and do not call a Google API.

**Pro** tools, after the user consents, call Google APIs from the browser. That is Google’s API, not an AI service.

**Website:** Cloudflare Web Analytics may collect ordinary site-visit metrics. It does not receive spreadsheet content.

If an AI feature ships later, this statement should be rewritten before that release, not afterwards.
