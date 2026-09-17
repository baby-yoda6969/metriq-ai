# Demo sample label credits

Used by the idle screen's "Compliant sample" / "Non-compliant sample" /
"Blurry sample" buttons in `src/screens/ScanView.jsx`, so trying the scan
flow doesn't require a camera or a real label on hand — while still
sending the AI an actual photographed label instead of a synthetic
canvas mockup.

| Filename | Product | Notes |
|---|---|---|
| `parle-g-compliant.jpg` | Parle-G Gluco Biscuits | Photo of a physical pack's back panel; all 5 required declarations (manufacturer address, net quantity, MRP, mfg date, consumer care) are legible. Used as-is for the "clean" sample, and blurred at draw time for the "blurry" sample. |
| `kurkure-non-compliant.jpg` | Kurkure Masala Munch (PepsiCo) | Cropped from a real pre-print production proof of the pack's info panel. The MRP and manufacturing-date fields are printed blank in the source file (not edited by us), and this panel carries no consumer-care declaration — a genuine, unedited compliance gap rather than a simulated one. |

## License note

As with the real product photos already used for the 3D-scan feature (see
`public/models/CREDITS.md`), these are real photos of trademarked product
packaging, supplied for this project. Fine for a local/internal demo;
reconfirm rights before using this build anywhere more public.
