import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const manifestPath = path.join(root, "datasniper/manifest.xml");

function pngSize(file) {
  const bytes = readFileSync(file);
  assert.equal(bytes.toString("ascii", 1, 4), "PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

test("manifest points at the hosted DataSniper pages and icons", () => {
  const xml = readFileSync(manifestPath, "utf8");
  for (const needle of [
    "https://sheetspeed.agi-jarvis.com/datasniper/taskpane.html",
    "https://sheetspeed.agi-jarvis.com/datasniper/commands.html",
    "https://sheetspeed.agi-jarvis.com/datasniper/",
    "https://sheetspeed.agi-jarvis.com/datasniper/assets/icon-16.png",
    "https://sheetspeed.agi-jarvis.com/datasniper/assets/icon-32.png",
    "https://sheetspeed.agi-jarvis.com/datasniper/assets/icon-64.png",
    "https://sheetspeed.agi-jarvis.com/datasniper/assets/icon-80.png",
    "<Host Name=\"Workbook\"/>",
    "<Permissions>ReadWriteDocument</Permissions>",
    "6f2c1b8a-4e57-4d3a-9b16-8c0e5a7d2f41",
  ]) {
    assert.ok(xml.includes(needle), needle);
  }
  assert.equal(pngSize(path.join(root, "datasniper/assets/icon-16.png")).width, 16);
  assert.equal(pngSize(path.join(root, "datasniper/assets/icon-32.png")).width, 32);
  assert.equal(pngSize(path.join(root, "datasniper/assets/icon-64.png")).width, 64);
  assert.equal(pngSize(path.join(root, "datasniper/assets/icon-80.png")).width, 80);
  for (const size of [16, 32, 64, 80]) {
    const image = pngSize(path.join(root, `datasniper/assets/icon-${size}.png`));
    assert.equal(image.height, size);
  }
});

test("office-addin-manifest accepts the manifest", async () => {
  const { validateManifest } = await import("office-addin-manifest");
  const result = await validateManifest(manifestPath);
  assert.equal(result.isValid, true, JSON.stringify(result.report || result, null, 2));
});
