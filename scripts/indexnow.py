#!/usr/bin/env python3
"""Submit changed SheetSpeed URLs to IndexNow.

Transport errors exit 0 so a Pages deploy is not blocked. Pass --dry-run to
print the payload without contacting the API.
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request

HOST = "sheetspeed.agi-jarvis.com"
KEY = "311595d5572bb4813d5ad8ef0678e0b2"
ENDPOINT = "https://api.indexnow.org/indexnow"
DEFAULT_URLS = [
    f"https://{HOST}/",
    f"https://{HOST}/datasniper/",
    f"https://{HOST}/sitemap.xml",
    f"https://{HOST}/sitemap.html",
    f"https://{HOST}/llms.txt",
    f"https://{HOST}/changelog.html",
]


def payload(urls):
    return {
        "host": HOST,
        "key": KEY,
        "keyLocation": f"https://{HOST}/{KEY}.txt",
        "urlList": urls,
    }


def main(argv):
    args = list(argv)
    dry_run = "--dry-run" in args
    urls = [arg for arg in args if arg.startswith("http")]
    body = payload(urls or DEFAULT_URLS)
    encoded = json.dumps(body).encode()
    if dry_run:
        sys.stdout.write(encoded.decode() + "\n")
        return 0
    request = urllib.request.Request(
        ENDPOINT,
        data=encoded,
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            print(f"IndexNow {response.status} for {len(body['urlList'])} URL(s).")
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace")[:500]
        print(f"IndexNow HTTP {error.code}: {detail}")
    except Exception as error:  # noqa: BLE001 — a ping must not fail the deploy
        print(f"IndexNow skipped: {error}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
