import importlib.util
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def load_sync():
    path = ROOT / "scripts" / "sync_datasniper_mirror.py"
    spec = importlib.util.spec_from_file_location("sync_datasniper_mirror", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class DataSniperMirrorTests(unittest.TestCase):
    def test_sync_keeps_readme_and_alternate_manifest_host(self):
        module = load_sync()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            src = root / "src"
            dest = root / "dest"
            (src / "js").mkdir(parents=True)
            (src / "js" / "taskpane.js").write_text("var next = 2;\n", encoding="utf-8")
            (src / "manifest-alt.xml").write_text(
                "<IconUrl DefaultValue=\"https://jarvis-pd21.github.io/datasniper/assets/icon-32.png\"/>\n",
                encoding="utf-8",
            )
            (src / "gone.txt").write_text("nope\n", encoding="utf-8")
            dest.mkdir()
            (dest / "README.md").write_text("# DataSniper (alternate host)\n", encoding="utf-8")
            (dest / ".nojekyll").write_text("", encoding="utf-8")
            (dest / "js").mkdir()
            (dest / "js" / "taskpane.js").write_text("var old = 1;\n", encoding="utf-8")
            (dest / "stale.txt").write_text("remove\n", encoding="utf-8")

            changed = module.sync_tree(src, dest)
            self.assertIn("js/taskpane.js", changed)
            self.assertIn("manifest-alt.xml", changed)
            self.assertTrue(any(item.endswith("stale.txt") for item in changed))
            self.assertEqual((dest / "README.md").read_text(encoding="utf-8"), "# DataSniper (alternate host)\n")
            self.assertTrue((dest / ".nojekyll").is_file())
            self.assertFalse((dest / "stale.txt").exists())
            manifest = (dest / "manifest-alt.xml").read_text(encoding="utf-8")
            self.assertIn("https://jarvis-pd21.github.io/datasniper/", manifest)
            self.assertNotIn("sheetspeed.agi-jarvis.com", manifest)

            (src / "gone.txt").unlink()
            module.sync_tree(src, dest)
            self.assertFalse((dest / "gone.txt").exists())
            self.assertEqual((dest / "README.md").read_text(encoding="utf-8"), "# DataSniper (alternate host)\n")

    def test_missing_token_skips_without_failing(self):
        env = {key: value for key, value in __import__("os").environ.items() if key != "DATASNIPER_MIRROR_TOKEN"}
        result = subprocess.run(
            ["python3", "scripts/sync_datasniper_mirror.py"],
            cwd=ROOT,
            env=env,
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0)
        self.assertIn("Skipping the DataSniper mirror sync", result.stdout)

    def test_indexnow_dry_run_lists_datasniper(self):
        result = subprocess.run(
            ["python3", "scripts/indexnow.py", "--dry-run"],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0)
        self.assertIn("https://sheetspeed.agi-jarvis.com/datasniper/", result.stdout)
        self.assertIn("311595d5572bb4813d5ad8ef0678e0b2", result.stdout)


if __name__ == "__main__":
    unittest.main()
