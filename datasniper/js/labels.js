/**
 * Snip names sit outside the rectangle so they do not cover the text
 * inside it or the next line. Above the box when that band is free,
 * otherwise in the side margin, otherwise a numbered chip.
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

export function finishLabels(overlay) {
  if (!overlay) return;
  const boxes = [...overlay.querySelectorAll(".snip-box")];
  const overlayRect = overlay.getBoundingClientRect();
  if (!overlayRect.width || !overlayRect.height) return;
  const occupied = [];
  boxes.forEach((box, index) => {
    const label = box.querySelector("span");
    if (!label) return;
    const full = label.dataset.fullName || label.textContent || "Snip";
    label.dataset.fullName = full;
    label.textContent = full;
    label.classList.remove("above", "side", "side-right", "chip", "below");
    label.title = "";
    const boxRect = box.getBoundingClientRect();
    const measured = label.getBoundingClientRect();
    const place = chooseLabelPlace(
      boxRect,
      { width: Math.min(measured.width || 48, 180), height: Math.max(measured.height || 14, 14) },
      overlayRect,
      [...boxes.filter((other) => other !== box).map((other) => other.getBoundingClientRect()), ...occupied],
    );
    label.classList.add(place);
    if (place === "chip") {
      label.textContent = String(index + 1);
      label.title = full;
    }
    occupied.push(label.getBoundingClientRect());
  });
}
