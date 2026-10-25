# DataSniper alternate host

Excel on some networks cannot load `https://sheetspeed.agi-jarvis.com/`. The same add-in is also published at `https://jarvis-pd21.github.io/datasniper/` from the `jarvis-pd21/datasniper` repository.

Sideload `manifest-alt.xml` for that copy. Its id is `3c9d7e21-5a4b-4f8e-8d2c-1b6a0e9f7a52`, and every page URL in that file stays on `https://jarvis-pd21.github.io/datasniper/`. The install page says: “Network blocks sheetspeed.agi-jarvis.com? Use this alternate manifest.”

`manifest.xml` in both places is the primary add-in and still points at `sheetspeed.agi-jarvis.com`.

## Keep the mirror in sync

`scripts/sync_datasniper_mirror.py` copies `datasniper/` to the root of `jarvis-pd21/datasniper`. It leaves the mirror’s `README.md` and `.nojekyll` in place, and it copies `manifest-alt.xml` unchanged.

`.github/workflows/sync-datasniper-mirror.yml` runs that script on pushes to `main` that touch `datasniper/`. The script exits 0 when `DATASNIPER_MIRROR_TOKEN` is unset, so a missing secret does not fail the workflow. The token needs contents write on `jarvis-pd21/datasniper`. Store it as the Actions secret `DATASNIPER_MIRROR_TOKEN`.

To sync from a checkout:

```sh
DATASNIPER_MIRROR_TOKEN=... python3 scripts/sync_datasniper_mirror.py
```

GitHub Pages on the mirror is a project site, so absolute `/datasniper/...` links resolve the same way they do on `sheetspeed.agi-jarvis.com`.
