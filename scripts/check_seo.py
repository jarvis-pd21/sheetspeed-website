#!/usr/bin/env python3
"""Check local SEO invariants; optional public HTTP checks never submit indexing requests."""
from argparse import ArgumentParser
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse, unquote
import datetime
import json
import re
import subprocess
import sys
import urllib.request
import xml.etree.ElementTree as ET

BASE = 'https://sheetspeed.agi-jarvis.com/'

class Page(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=True)
        self.titles, self.h1, self.canonicals, self.descriptions = [], [], [], []
        self.robots, self.urls, self.ids, self.schemas = [], [], set(), []
        self.active = None
        self.buffer = ''
        self.ld = False
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get('id'):
            self.ids.add(attrs['id'])
        if tag in ('title', 'h1'):
            self.active, self.buffer = tag, ''
        if tag == 'link' and attrs.get('rel') == 'canonical':
            self.canonicals.append(attrs.get('href', ''))
        if tag == 'meta':
            if attrs.get('name') == 'description':
                self.descriptions.append(attrs.get('content', ''))
            if attrs.get('name') == 'robots':
                self.robots.append(attrs.get('content', ''))
        if tag in ('a', 'img', 'script', 'source', 'video', 'link'):
            for key in ('href', 'src', 'poster'):
                if attrs.get(key):
                    self.urls.append(attrs[key])
        if tag == 'script' and attrs.get('type') == 'application/ld+json':
            self.ld = True
            self.schemas.append('')

    def handle_data(self, data):
        if self.active:
            self.buffer += data
        if self.ld:
            self.schemas[-1] += data

    def handle_endtag(self, tag):
        if tag == self.active:
            (self.titles if tag == 'title' else self.h1).append(self.buffer.strip())
            self.active = None
        if tag == 'script':
            self.ld = False

    @property
    def indexable(self):
        return not any('noindex' in value.lower() for value in self.robots)


def site_path(root, url):
    path = unquote(urlparse(url).path).lstrip('/')
    target = root / path
    if target.is_dir() or not path or path.endswith('/'):
        target = target / 'index.html'
    return target


def audit(root, preserve_ref=None):
    errors, warnings = [], []
    pages = {}
    for path in sorted(root.rglob('*.html')):
        if any(part in {'.git', '_site', 'node_modules'} for part in path.relative_to(root).parts):
            continue
        relative = path.relative_to(root).as_posix()
        page = Page(path.read_text())
        pages[relative] = page
        if len(page.canonicals) != 1:
            errors.append(f'{relative}: expected exactly one canonical URL')
        elif not page.canonicals[0].startswith(BASE):
            errors.append(f'{relative}: canonical URL is outside the official origin')
        elif page.indexable and site_path(root, page.canonicals[0]).resolve() != path.resolve():
            errors.append(f'{relative}: indexable page canonical does not identify this file')
        if page.indexable:
            for label, values in [('title', page.titles), ('description', page.descriptions), ('h1', page.h1)]:
                if len(values) != 1 or not values[0]:
                    errors.append(f'{relative}: expected one nonempty {label}')
            if page.descriptions and len(page.descriptions[0]) > 180:
                warnings.append(f'{relative}: description has {len(page.descriptions[0])} characters; inspect snippet clarity')
        for raw in page.schemas:
            try:
                schema = json.loads(raw)
                objects = schema if isinstance(schema, list) else [schema]
                if not objects or any(not isinstance(item, dict) or not item.get('@context') or not (item.get('@type') or item.get('@graph')) for item in objects):
                    errors.append(f'{relative}: JSON-LD lacks a context and entity type/graph')
            except ValueError as error:
                errors.append(f'{relative}: invalid JSON-LD: {error}')

    for relative, page in pages.items():
        source_url = urljoin(BASE, relative.replace('index.html', '') if relative.endswith('index.html') else relative)
        for link in page.urls:
            absolute = urljoin(source_url, link)
            parsed = urlparse(absolute)
            if parsed.netloc != urlparse(BASE).netloc or parsed.scheme not in ('http', 'https'):
                continue
            target = site_path(root, absolute)
            if not target.is_file():
                errors.append(f'{relative}: missing local URL {link}')
                continue
            target_page = pages.get(target.relative_to(root).as_posix())
            if parsed.fragment and target_page and unquote(parsed.fragment) not in target_page.ids:
                errors.append(f'{relative}: missing fragment {link}')

    sitemap = ET.parse(root / 'sitemap.xml').getroot()
    urls = []
    for node in sitemap:
        url = node.findtext('{*}loc')
        lastmod = node.findtext('{*}lastmod')
        if not url or not url.startswith(BASE):
            errors.append(f'sitemap.xml: invalid origin {url}')
            continue
        urls.append(url)
        target = site_path(root, url)
        page = pages.get(target.relative_to(root).as_posix())
        if not page or not page.indexable or page.canonicals != [url]:
            errors.append(f'sitemap.xml: URL is missing, nonindexable or noncanonical: {url}')
        if lastmod:
            try:
                value = datetime.date.fromisoformat(lastmod)
                if value > datetime.date.today():
                    errors.append(f'sitemap.xml: future lastmod {url}')
            except ValueError:
                errors.append(f'sitemap.xml: invalid lastmod {url}')
    if len(set(urls)) != len(urls):
        errors.append('sitemap.xml: duplicate URLs')
    for relative, page in pages.items():
        if page.indexable and page.canonicals and page.canonicals[0] not in urls:
            errors.append(f'{relative}: indexable canonical omitted from sitemap')
    if f'Sitemap: {BASE}sitemap.xml' not in (root / 'robots.txt').read_text():
        errors.append('robots.txt: official sitemap URL missing')
    if preserve_ref:
        old = subprocess.check_output(['git', 'show', f'{preserve_ref}:index.html'], cwd=root).decode()
        current = (root / 'index.html').read_text()
        def body(value):
            match = re.search(r'<body\b[^>]*>.*</body>', value, re.S | re.I)
            if not match:
                raise ValueError('Homepage has no complete body')
            return match.group()
        if body(old) != body(current):
            errors.append('Homepage body differs from the preserved baseline')
        changed = subprocess.check_output(['git', 'diff', '--name-only', preserve_ref, '--', 'css', 'js'], cwd=root).decode().strip()
        if changed:
            errors.append(f'Homepage CSS/JS files differ from preserved baseline: {changed}')
    return {'html_pages': len(pages), 'indexable_pages': sum(p.indexable for p in pages.values()), 'sitemap_urls': len(urls), 'errors': errors, 'warnings': warnings}, urls


def live_audit(urls):
    def fetch(url):
        try:
            request = urllib.request.Request(url, headers={'User-Agent': 'SheetSpeed-public-SEO-check/1.0'})
            with urllib.request.urlopen(request, timeout=20) as response:
                page = Page(response.read().decode('utf-8'))
                return {'url': url, 'status': response.status, 'final_url': response.url, 'canonical': page.canonicals, 'indexable': page.indexable}
        except Exception as error:
            return {'url': url, 'error': str(error)}
    with ThreadPoolExecutor(max_workers=5) as pool:
        return list(pool.map(fetch, urls))


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--preserve-homepage-ref', help='Git revision whose homepage body/CSS/JS must be unchanged')
    parser.add_argument('--live', action='store_true', help='Read each official public sitemap URL; does not submit to a search engine')
    args = parser.parse_args()
    result, urls = audit(args.root.resolve(), args.preserve_homepage_ref)
    if args.live:
        result['live'] = live_audit(urls)
        for item in result['live']:
            if item.get('status') != 200 or item.get('final_url') != item['url'] or item.get('canonical') != [item['url']] or not item.get('indexable'):
                result['errors'].append(f'Public URL check failed: {item["url"]}')
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return bool(result['errors'])

if __name__ == '__main__':
    sys.exit(main())
