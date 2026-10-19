import importlib.util
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('check_seo', Path(__file__).resolve().parents[1] / 'scripts/check_seo.py')
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)
BASE = checker.BASE

class CheckerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.html = f'<html><head><title>Example</title><meta name="description" content="An example."><link rel="canonical" href="{BASE}"></head><body><h1>Example</h1><p id="details">Details</p><a href="#details">Details</a></body></html>'
        (self.root / 'index.html').write_text(self.html)
        (self.root / 'sitemap.xml').write_text(f'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>{BASE}</loc><lastmod>2026-10-19</lastmod></url></urlset>')
        (self.root / 'robots.txt').write_text(f'User-agent: *\nAllow: /\nSitemap: {BASE}sitemap.xml\n')

    def errors(self):
        return checker.audit(self.root)[0]['errors']

    def test_valid_canonical_and_fragment(self):
        self.assertEqual(self.errors(), [])

    def test_broken_link_is_reported(self):
        (self.root / 'index.html').write_text(self.html.replace('#details', '/missing.html'))
        self.assertTrue(any('missing local URL /missing.html' in error for error in self.errors()))

    def test_broken_fragment_is_reported(self):
        (self.root / 'index.html').write_text(self.html.replace('href="#details"', 'href="#absent"'))
        self.assertTrue(any('missing fragment' in error for error in self.errors()))

    def test_invalid_jsonld_is_reported(self):
        (self.root / 'index.html').write_text(self.html.replace('</head>', '<script type="application/ld+json">{oops}</script></head>'))
        self.assertTrue(any('invalid JSON-LD' in error for error in self.errors()))

    def test_nonindexable_sitemap_entry_is_reported(self):
        (self.root / 'index.html').write_text(self.html.replace('</head>', '<meta name="robots" content="noindex,follow"></head>'))
        self.assertTrue(any('nonindexable' in error for error in self.errors()))

    def test_indexable_page_missing_from_sitemap_is_reported(self):
        (self.root / 'other.html').write_text(self.html.replace(f'href="{BASE}"', f'href="{BASE}other.html"'))
        self.assertTrue(any('other.html: indexable canonical omitted' in error for error in self.errors()))

if __name__ == '__main__':
    unittest.main()
