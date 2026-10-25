/**
 * Clip PDF text items to a page-relative rectangle.
 *
 * Coordinates:
 * - Snip rects are top-left origin, normalized to the page (0–1).
 * - Text items are PDF user space: origin bottom-left, y up.
 * A character is kept when its horizontal center lies inside the snip and
 * the glyph box overlaps the snip vertically. That is what makes a narrow
 * investor snip truncate a longer name on the same template.
 */

export function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

export function clampRect(rect) {
  const x = clamp01(rect.x);
  const y = clamp01(rect.y);
  const w = Math.min(Math.max(0, rect.w), 1 - x);
  const h = Math.min(Math.max(0, rect.h), 1 - y);
  const next = { x, y, w, h };
  if (rect.page != null) next.page = rect.page;
  return next;
}

export function normalizeDrag(start, end) {
  return clampRect({
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    w: Math.abs(end.x - start.x),
    h: Math.abs(end.y - start.y),
    page: start.page,
  });
}

export function pageHasTextLayer(items) {
  return items.some((item) => item.str && item.str.trim().length > 0);
}

function glyphBox(item) {
  const fontSize = item.fontSize || 1;
  return {
    top: item.baseline + fontSize * 0.92,
    bottom: item.baseline - fontSize * 0.28,
  };
}

function overlaps(a0, a1, b0, b1) {
  return Math.min(a1, b1) > Math.max(a0, b0);
}

/**
 * @param {Array<{str:string,x:number,baseline:number,fontSize:number,width:number}>} items
 * @param {number} pageWidth
 * @param {number} pageHeight
 * @param {{x:number,y:number,w:number,h:number}} rect normalized, top-left origin
 */
export function extractTextFromItems(items, pageWidth, pageHeight, rect) {
  if (!items || !items.length || !pageWidth || !pageHeight || !rect || rect.w <= 0 || rect.h <= 0) {
    return "";
  }
  const snipLeft = rect.x * pageWidth;
  const snipRight = (rect.x + rect.w) * pageWidth;
  const snipTop = pageHeight - rect.y * pageHeight;
  const snipBottom = snipTop - rect.h * pageHeight;
  const lines = [];

  for (const item of items) {
    if (!item.str || !item.width) continue;
    const count = item.str.length;
    if (!count) continue;
    const charWidth = item.width / count;
    // pdf.js turns large positioning gaps into a single space with a huge advance.
    // Those are not visible glyphs. Real word spaces stay near the font's width.
    if (!item.str.trim() && charWidth > (item.fontSize || 10) * 0.85) continue;
    const box = glyphBox(item);
    if (!overlaps(box.bottom, box.top, snipBottom, snipTop)) continue;

    let line = lines.find((entry) => Math.abs(entry.baseline - item.baseline) <= (item.fontSize || 10) * 0.45);
    if (!line) {
      line = { baseline: item.baseline, chars: [] };
      lines.push(line);
    }

    for (let index = 0; index < count; index += 1) {
      const center = item.x + (index + 0.5) * charWidth;
      if (center >= snipLeft && center < snipRight) {
        line.chars.push({
          x: item.x + index * charWidth,
          end: item.x + (index + 1) * charWidth,
          ch: item.str[index],
          charWidth,
        });
      }
    }
  }

  lines.sort((a, b) => b.baseline - a.baseline);
  const text = lines
    .map((line) => {
      const chars = line.chars.sort((a, b) => a.x - b.x);
      let built = "";
      let previous = null;
      for (const glyph of chars) {
        if (previous && glyph.x - previous.end > previous.charWidth * 0.35) built += " ";
        built += glyph.ch;
        previous = glyph;
      }
      return built.trim();
    })
    .filter(Boolean)
    .join("\n")
    .trim();
  return text;
}

export function itemsFromTextContent(textContent, viewport) {
  const items = [];
  for (const item of textContent.items || []) {
    if (!item.str) continue;
    const transform = item.transform || [1, 0, 0, 1, 0, 0];
    items.push({
      str: item.str,
      x: transform[4],
      baseline: transform[5],
      fontSize: Math.hypot(transform[2], transform[3]) || item.height || 0,
      width: item.width || 0,
    });
  }
  return {
    items,
    pageWidth: viewport.width,
    pageHeight: viewport.height,
  };
}
