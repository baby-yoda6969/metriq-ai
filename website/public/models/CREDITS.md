# 3D demo model credits

Feature 1 (PRD v2) looks up a scanned brand against 6 pre-loaded `.glb`
files in this folder — a fixed lookup, not a model generated from the
inspector's photos.

Unlike an earlier approach (generic Sketchfab downloads with no real label
content), these files are **real photogrammetry scans**, captured with
[KiriEngine](https://www.kiriengine.app/) of physical products bought and
photographed for this project. The label visible on each model is the real
captured photo texture — nothing is generated or overlaid on it.

| Filename | Product | Manufacturer |
|---|---|---|
| `red-joy-cheese-corn-chakra.glb` | Red Joy Cheese Corn Chakra | Reva Food Products, Mehsana, Gujarat |
| `britannia-50-50-potazos.glb` | Britannia 50-50 Potazos | Britannia Industries Limited, Kolkata |
| `open-secret-bhuja.glb` | Open Secret Un-Junked Bhuja | Regulus Agro Organic Pvt Ltd (mfg) / ImmaculateBites Pvt Ltd (mktd), Maharashtra |
| `maggi-double-masala.glb` | Maggi 2-Minute Noodles (Double Masala) | Nestlé India Limited, Moga, Punjab |
| `airpods-pro-2.glb` | Apple AirPods Pro (2nd Generation), model MQD83HN/A | Apple Inc. (mfg, Cupertino, USA) / Apple India Pvt Ltd (importer, Bangaluru) |
| `parle-g-250g.glb` | Parle-G Gluco Biscuits, 250g pack | Parle Biscuits Pvt. Ltd., Mumbai |

The AirPods Pro entry is the one non-food item in the set: its Legal
Metrology declarations were photographed straight off the importer's
compliance sticker on the retail box (front label with the manufacturer/
importer block, MRP, manufacture date, and consumer care; back label
confirming the model name, generation, and assembly country), not
transcribed from a food nutrition panel like the other four.

The Parle-G 250g entry is a different SKU from the "compliant sample" label
photo used elsewhere in the app (`public/samples/parle-g-compliant.jpg`,
a 130g pack) — its Net Quantity, MRP, and packing date were read directly
from this model's own embedded back-panel photograph (every `.glb` here
carries its original photogrammetry-capture photos inside the file itself,
front/back/edges, extractable from the file's `images` array) rather than
reused from the other pack size.

## Reference declared values

The exact 5 mandatory declarations for each product (as printed on the
physical pack) are hand-verified and hardcoded in `DEMO_3D_PRODUCTS` in
`src/data/demoProducts.js`, and shown as a "Reference declaration" panel
under the 3D viewer — so the numbers shown are always the real, verified
label content for that exact product, not a live scan's OCR read (which can
vary run to run). See that constant for the full field-by-field values and
sources.

## License note

These are original photos of physical products the team purchased, taken
specifically for this project (not third-party stock assets) — no external
attribution requirement, unlike the earlier Sketchfab-sourced placeholders
this replaced. As with any use of real trademarked product photography in a
demo, this is fine for a local/internal context; reconfirm before using this
build anywhere more public.
