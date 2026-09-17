// "3D model of the scanned product" is simulated as a lookup against a
// short list of pre-loaded products, not real photogrammetry/generation from
// the captured photos; the front/back/side capture step still happens in the
// UI, it just doesn't feed this. Match is by brand-name substring against
// the case's saved brand field; falls back to a generic note if the
// scanned brand isn't one of these.
//
// These .glb files are real photogrammetry scans (captured with
// KiriEngine) of physical products the team actually bought and
// photographed: the label text visible on the model IS the real label,
// not a generated texture. `declaredFields` below is that same real
// label's content, hand-transcribed from photos of each physical pack
// (see public/models/CREDITS.md), so the "extracted values" shown
// alongside the 3D view are always the verified real data for that exact
// product, never a live scan's possibly-noisy OCR read.
function declaredField(name, value) {
  return { name, value, status: "compliant", explanation: "As declared on the physical label (verified)." };
}

export const DEMO_3D_PRODUCTS = [
  {
    match: "red joy", name: "Red Joy Cheese Corn Chakra", glb: "/models/red-joy-cheese-corn-chakra.glb",
    declaredFields: [
      declaredField("Manufacturer / Packer / Importer Name & Address", "Mfg & Mktd by: Reva Food Products, Survey No-2721,2722, Dhara Industrial Estate, Godown No-1A & 1E, At Karannagar, Mehsana, Gujarat 382715"),
      declaredField("Net Quantity", "180 g"),
      declaredField("Maximum Retail Price (incl. of all taxes)", "Rs. 99 (incl. of all taxes)"),
      declaredField("Month & Year of Manufacture / Packing", "08/2026"),
      declaredField("Consumer Care Details", "+91-9099838877 (10am–6pm) · info@redjoy.in · www.redjoy.in"),
    ],
  },
  {
    match: "britannia", name: "Britannia 50-50 Potazos", glb: "/models/britannia-50-50-potazos.glb",
    declaredFields: [
      declaredField("Manufacturer / Packer / Importer Name & Address", "Britannia Industries Limited, 5/1A Hungerford Street, Kolkata - 700 017, West Bengal"),
      declaredField("Net Quantity", "71.5 g"),
      declaredField("Maximum Retail Price (incl. of all taxes)", "Rs. 30 (incl. of all taxes)"),
      declaredField("Month & Year of Manufacture / Packing", "08/2025"),
      declaredField("Consumer Care Details", "Toll-free 1800-425-4449 / 1800-3000-4530 · feedback@britindia.com · www.britannia.co.in"),
    ],
  },
  {
    match: "open secret", name: "Open Secret Un-Junked Bhuja", glb: "/models/open-secret-bhuja.glb",
    declaredFields: [
      declaredField("Manufacturer / Packer / Importer Name & Address", "Manufactured by: Regulus Agro Organic Private Limited, B2-A 002, Krishna Vandanas CHS, Gut no. 140, 141/0, 142/1, Behind Akansha Complex, Vichumbe, New Panvel, Panvel, Raigad, Maharashtra-410206. Marketed by: ImmaculateBites Private Limited, 108, Gala No. 1, 2 & 3, Fertiplant Engineering Co. Pvt. Ltd, 187-198, Lake Road, Bhandup West, Greater Mumbai Ward-S, Greater Mumbai, Maharashtra-400078"),
      declaredField("Net Quantity", "175.9 g"),
      declaredField("Maximum Retail Price (incl. of all taxes)", "Rs. 199 (incl. of all taxes)"),
      declaredField("Month & Year of Manufacture / Packing", "06/2025"),
      declaredField("Consumer Care Details", "+91 90152 27230 · sayhello@opensecret.in"),
    ],
  },
  {
    match: "maggi", name: "Maggi 2-Minute Noodles (Double Masala)", glb: "/models/maggi-double-masala.glb",
    declaredFields: [
      declaredField("Manufacturer / Packer / Importer Name & Address", "Mfg. by: Nestlé India Limited, Ludhiana-Ferozepur Road, Moga - 142 001, Punjab. Marketed by: Nestlé India Limited, 100/101, World Trade Centre, Barakhamba Lane, New Delhi - 110 001"),
      declaredField("Net Quantity", "70 g"),
      declaredField("Maximum Retail Price (incl. of all taxes)", "Rs. 20 (incl. of all taxes)"),
      declaredField("Month & Year of Manufacture / Packing", "07/2026"),
      declaredField("Consumer Care Details", "Toll-free 1800-103-1947"),
    ],
  },
  {
    // The one non-food item in this set: a non-weight/volume commodity, so
    // "Net Quantity" is declared by count per component (as printed) rather
    // than weight — Rule 6(1)(c) covers count-based declarations the same
    // way it covers weight/volume ones.
    match: "airpods", name: "Apple AirPods Pro (2nd Generation)", glb: "/models/airpods-pro-2.glb",
    declaredFields: [
      declaredField("Manufacturer / Packer / Importer Name & Address", "Manufactured by: Apple Inc., One Apple Park Way, Cupertino, CA 95014, USA. Imported by: Apple India Pvt. Ltd., No. 24, 19th Floor, Concorde Tower C, UB City, Vittal Mallya Road, Bangaluru, Karnataka - 560 001"),
      declaredField("Net Quantity", "Earbuds: 2N · Charging Case: 1N · Cable: 1N · Ear Tips: 8N"),
      declaredField("Maximum Retail Price (incl. of all taxes)", "Rs. 26,900 (incl. of all taxes)"),
      declaredField("Month & Year of Manufacture / Packing", "01/2023"),
      declaredField("Consumer Care Details", "Toll-free 000800 100 9009 · india_support@apple.com"),
    ],
  },
  {
    // Same brand as the "compliant sample" label photo used elsewhere
    // (public/samples/parle-g-compliant.jpg), but a different pack size —
    // that photo is a 130g pack; this is a distinct 250g SKU with its own
    // batch, MRP, and packing date, transcribed separately rather than
    // reused, since Net Quantity/MRP/date are pack-specific, not brand-wide.
    match: "parle", name: "Parle-G Gluco Biscuits (250g)", glb: "/models/parle-g-250g.glb",
    declaredFields: [
      declaredField("Manufacturer / Packer / Importer Name & Address", "Parle Biscuits Pvt. Ltd., North Level Crossing, Vile Parle East, Mumbai, MH-400057"),
      declaredField("Net Quantity", "200 g + 50 g Extra = 250 g"),
      declaredField("Maximum Retail Price (incl. of all taxes)", "Rs. 30.00 (incl. of all taxes)"),
      declaredField("Month & Year of Manufacture / Packing", "06/2026"),
      declaredField("Consumer Care Details", "Toll-free 1800 209 6929 · cs@parle.biz"),
    ],
  },
];

export function findDemo3DProduct(brand) {
  const lower = (brand || "").toLowerCase();
  return DEMO_3D_PRODUCTS.find((p) => lower.includes(p.match)) || null;
}
