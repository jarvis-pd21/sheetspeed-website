/**
 * Snip names sit outside the rectangle and off the page text.
 * Above the box when that band is free, otherwise in the side margin,
 * otherwise a numbered chip. The pane thumbnail asks for chips only.
 */

export function intersects(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function inside(rect, bounds) {
  return rect.left >= bounds.left - 1
    && rect.top >= bounds.top - 1
    && rect.right <= bounds.right + 1
    && rect.bottom <= bounds.bottom + 1;
}

export function chooseLabelPlace(box, label, overlay, obstacles) {
  const gap = 3;
  const width = Math.max(8, label.width || 0);
  const height = Math.max(12, label.height || 0);
  const above = {
    left: box.left,
    top: box.top - gap - height,
    right: box.left + width,
    bottom: box.top - gap,
  };
  const blocked = (rect) => obstacles.some((item) => intersects(rect, item));
  if (inside(above, overlay) && !blocked(above) && !intersects(above, box)) return "above";
  const side = {
    left: box.left - gap - width,
    top: box.top,
    right: box.left - gap,
    bottom: box.top + height,
  };
  if (inside(side, overlay) && !blocked(side) && !intersects(side, box)) return "side";
  const sideRight = {
    left: box.right + gap,
    top: box.top,
    right: box.right + gap + width,
    bottom: box.top + height,
  };
  if (inside(sideRight, overlay) && !blocked(sideRight) && !intersects(sideRight, box)) return "side-right";
  return "chip";
}

export function chooseChipCorner(box, overlay, obstacles) {
  const size = 14;
  const gap = 2;
  const spots = [
    { left: box.right + gap, top: box.top },
    { left: box.left - gap - size, top: box.top },
    { left: box.left, top: box.top - gap - size },
    { left: box.right - size, top: box.top - gap - size },
  ];
  const fits = (spot) => {
    const rect = { left: spot.left, top: spot.top, right: spot.left + size, bottom: spot.top + size };
    return inside(rect, overlay)
      && !intersects(rect, box)
      && !obstacles.some((item) => intersects(rect, item));
  };
  const spot = spots.find(fits) || spots[0];
  return { left: spot.left, top: spot.top, right: spot.left + size, bottom: spot.top + size };
}

function textObstacles(overlayRect, textRects) {
  return (textRects || []).map((rect) => ({
    left: overlayRect.left + rect.x * overlayRect.width,
    top: overlayRect.top + rect.y * overlayRect.height,
    right: overlayRect.left + (rect.x + rect.w) * overlayRect.width,
    bottom: overlayRect.top + (rect.y + rect.h) * overlayRect.height,
  }));
}

function placeChip(label, boxRect, corner, index, full) {
  label.classList.add("chip");
  label.textContent = String(index + 1);
  label.title = full;
  label.style.left = `${corner.left - boxRect.left}px`;
  label.style.top = `${corner.top - boxRect.top}px`;
  label.style.right = "auto";
  label.style.bottom = "auto";
}

export function finishLabels(overlay, options = {}) {
  if (!overlay) return;
  const boxes = [...overlay.querySelectorAll(".snip-box")];
  const overlayRect = overlay.getBoundingClientRect();
  if (!overlayRect.width || !overlayRect.height) return;
  const pageText = textObstacles(overlayRect, options.textRects);
  const occupied = [];
  boxes.forEach((box, index) => {
    const label = box.querySelector("span");
    if (!label) return;
    const full = label.dataset.fullName || label.textContent || "Snip";
    label.dataset.fullName = full;
    label.classList.remove("above", "side", "side-right", "chip", "below");
    label.style.left = "";
    label.style.top = "";
    label.style.right = "";
    label.style.bottom = "";
    const boxRect = box.getBoundingClientRect();
    const others = boxes.filter((other) => other !== box).map((other) => other.getBoundingClientRect());
    const obstacles = [...others, ...occupied, ...pageText];
    if (options.chipsOnly) {
      placeChip(label, boxRect, chooseChipCorner(boxRect, overlayRect, obstacles), index, full);
      occupied.push(label.getBoundingClientRect());
      return;
    }
    label.textContent = full;
    label.title = "";
    const measured = label.getBoundingClientRect();
    const place = chooseLabelPlace(
      boxRect,
      { width: Math.min(measured.width || 48, 180), height: Math.max(measured.height || 14, 14) },
      overlayRect,
      obstacles,
    );
    label.classList.add(place);
    if (place === "chip") {
      placeChip(label, boxRect, chooseChipCorner(boxRect, overlayRect, obstacles), index, full);
    }
    occupied.push(label.getBoundingClientRect());
  });
}
