# Landing page photo credits

Chosen for Indian retail context. The law this app implements (the Legal
Metrology (Packaged Commodities) Rules, 2011) is an Indian statute.

| Filename | Used for | Source |
|---|---|---|
| `hero-bg.jpg` | Hero band background (dimmed under a navy gradient) | [Unsplash License](https://unsplash.com/license) (free for commercial use), photo `1739066598279-1297113f5c6a`: an Indian kirana (neighborhood grocery) storefront, Devanagari signage |
| `inspector-photo.jpg` | Hero's real-photo panel | Supplied directly by the project owner: an inspector checking packaged goods against a paper checklist |

# Logo

Supplied directly by the project owner as `logo.png` (the light-background lockup, chosen to match this app's light design system — see `src/index.css`'s `@theme` tokens). Two derived assets are checked in alongside it rather than regenerated at build time:

| Filename | Used for | Derivation |
|---|---|---|
| `logo.png` | Overwritten in place with a trimmed, transparent-background version of the original upload (icon mark + "metriq ai" wordmark) | Background thresholded to alpha, cropped to content bounds |
| `logo-mark.png` | Favicon (`public/favicon.png`) and any other light-background icon-only spot | Icon mark cropped out of `logo.png`, padded to a square, transparent background |
| `logo-mark-light.png` | The two dark navy-deep headers (Landing page topbar, in-app console header) — the original dark icon mark has poor contrast there | Same alpha mask as `logo-mark.png`, recolored to this app's `--color-paper` (#F1EEE4), the tone already used for text on those dark headers |
