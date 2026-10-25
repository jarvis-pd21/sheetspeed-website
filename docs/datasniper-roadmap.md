# DataSniper roadmap

Phil asked what to copy from Muse’s clean-room DataSnipper work, including a 94-feature catalog in `muse-main-chat-ax.txt` and `NOTES.md`. Those files are not in this workspace, the git history, or the stores available while this note was written. This page does not invent that numbered catalog. It ranks the areas Phil named, and it records the ideas already copied into the browser add-in. Nothing else from the catalog is built here.

Muse’s engine was Python behind a local HTTP bridge, and it was not run in real Excel. DataSniper stays a browser add-in. The bridge and the server are not part of this product.

Public DataSnipper pages, read on 2026-10-25 for the copy benchmark, describe collect, verify, and in-Excel agents. DataSnipper’s own Excel Online note names Text, Validation, Exception, Sum, and Table snips. That is public product surface. It is separate from the unseen 94-item list.

## Already in the add-in

These are the Muse ideas this change adopted. Each one has a test.

- Label fallback. When a notice inserts a line, DataSniper finds the field from the label beside the first document’s snip, such as Investor or Amount called, and marks the row low confidence. `capital-call-07.pdf` is the extra-line sample.
- Apply this box to all documents, after a live preview edit. The rectangle becomes the template, per-document overrides for that snip are cleared, and every loaded row is read again.
- Unambiguous amounts become Excel numbers. Covered shapes: `$1,250,000.00`, `1,250,000.00`, `(1,250.50)`, `USD 1,250,000.00`, and `$1.25M`. Percents, bare years, and names stay text. The page text stays on the source link.
- The workbook stores the template and each value’s document, page, and region in Office document settings (`datasniper.v1`). File bytes stay in IndexedDB. A missing file is requested again by filename.
- A later export replaces that record. A smaller or larger grid does not keep source links for rows or columns that are gone.
- Long-name sample `capital-call-06.pdf`: Alexandra Catherine Pemberton Worthington III. The narrow investor box truncates to “Alexandra Catherine Pemberton Worthing”.

Text-layer snips, the OCR fallback, preview editing, and the large viewer were already shipped.

## Ranked next, for finance users

Build none of these yet. The order is the value of the review trail on a capital-call or audit workpaper, ahead of search and comparison tools that do not change the signed-off cell.

1. **Review queue and tickmarks.** A reviewer needs a list of low-confidence and unresolved rows, and a mark on the page that a person accepted the value. The label fallback already flags a shift. A queue would make that flag the work, instead of a color on one preview table.
2. **Exception and Validation snips.** Exception snips mark a value that fails a check. Validation snips mark one that passes. Finance users sign off on those two outcomes more often than they search a pile of PDFs.
3. **Sum snips.** A box around a column of amounts that lands as a total, still tied to the pages that made it. Capital calls, invoices, and tie-outs are mostly this.
4. **Document Matching.** Pair a workbook row with the notice that supports it when the file was not uploaded in template order. Useful once the batch is no longer “one snip, same place on every page.”
5. **Version Compare.** Show what changed between two copies of the same notice. It matters after a revised call, and it matters less than matching and tickmarks on the first pass.
6. **Smart Search.** Find a phrase across the uploaded documents and drop a snip on a hit. Powerful, and easy to trust too early. It sits last until the review queue can show where a hit came from.

Table snips, in the sense of a whole grid lifted off a page, would sit with Sum snips when that work starts. They are not started here.
