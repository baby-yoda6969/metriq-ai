// Feature-audit fix: previously every field's compliant/non_compliant/missing
// verdict was Gemini's own free-text judgment — not independently checked,
// despite the project's own founding spec asking for "compliance pass/fail
// logic [to stay] as deterministic ... code, not a second model call, so the
// same photo gives the same verdict every time." Gemini's role is narrowed
// here to OCR/extraction only (the "value" it read); this function re-derives
// the actual status from that raw text against the real Legal Metrology
// (Packaged Commodities) Rules, 2011 (see rule_engine_ref/ at the repo root
// for the primary source and the verified checklist this was built against).
// Grounded in: Rule 6(1)(a)/10(1) (manufacturer address + PIN code),
// Rule 6(1)(e) (MRP wording), Rule 6(1)(d) (mfg date), Rule 6(2) (consumer
// care — real text requires phone AND e-mail "if available", not either/or;
// the app's own seeded v2.2 rule-changelog entry, an "e-mail as an accepted
// alternative to a toll-free number" amendment, is demo/illustrative content
// layered on top of that real baseline, honored here via the active rule
// text rather than assumed).
//
// Pulled into its own module (rather than living inline in index.js) so it's
// a pure, side-effect-free set of functions Vitest can exercise directly
// without booting Express/dotenv/fetch.
// Bug fix: this only ever recognized the literal strings "null"/"n/a"/"none"
// as "no value" — but Gemini routinely reports an absent field in plain
// English ("Not declared", "Not visible", "Not found on the label", ...),
// none of which matched. That sent the raw phrase straight into the
// field-specific checks below, which then judged it as a badly-worded
// declaration ("MRP doesn't state 'inclusive of all taxes'") instead of
// recognizing the declaration wasn't made at all — a real pack with no MRP
// or mfg date printed was showing up as "non_compliant" with a misleading
// explanation instead of "missing".
const NO_VALUE_PATTERN = /^(null|n\/a|none|nil|absent|not\s+(declared|found|visible|present|stated|mentioned|available|specified|given|printed|legible)\b.*)$/i;

export function deriveFieldStatus(fieldName, rawValue, activeRuleText) {
  const value = (rawValue == null ? "" : String(rawValue)).trim();
  if (!value || NO_VALUE_PATTERN.test(value)) {
    return { status: "missing", explanation: "Not found anywhere on the visible label." };
  }

  switch (fieldName) {
    case "Manufacturer / Packer / Importer Name & Address": {
      // Bug fix: required 6 contiguous digits with no separator, but Indian
      // PIN codes are very commonly printed with a mid-code space or hyphen
      // (official postal convention, e.g. "560 001" or "560-001"), which
      // this rejected outright as "missing" on an address that actually had
      // one.
      const hasPin = /\b\d{3}[\s-]?\d{3}\b/.test(value);
      return hasPin
        ? { status: "compliant", explanation: "Name, address, and PIN code are present (Rule 10(1))." }
        : { status: "non_compliant", explanation: "Address is missing a 6-digit PIN code (Rule 10(1), Explanation 1)." };
    }
    case "Net Quantity": {
      // Rule 13(4) bans these counting terms outright as a quantity
      // declaration, regardless of what unit (if any) follows them — this
      // used to just fall through to the generic "not a recognized unit"
      // branch below, which happened to land on the right status but cited
      // the wrong rule for what is actually a specifically-named violation.
      if (/\b(dozen|score|gross|great gross)\b/i.test(value)) {
        return { status: "non_compliant", explanation: "Banned counting term used instead of a standard unit (Rule 13(4))." };
      }
      // Rule 13(3): a quantity ≥1kg/1L must use decimal/sub-multiple
      // fractions of the larger unit ("1.5 kg"), not mixed whole units
      // ("1 kg 500 g") — a real, specifically-banned notation that the old
      // logic never caught: it just matched the first unit it found (here,
      // "kg") and called the whole thing compliant.
      const mixedWeight = /\d+\s*kgs?\b.*\d+\s*(?:gms?|grams?|g)\b/i.test(value) || /\d+\s*(?:gms?|grams?|g)\b.*\d+\s*kgs?\b/i.test(value);
      const mixedVolume = /\d+\s*l(?:tr|itres?|iters?)?s?\b.*\d+\s*mls?\b/i.test(value) || /\d+\s*mls?\b.*\d+\s*l(?:tr|itres?|iters?)?s?\b/i.test(value);
      if (mixedWeight || mixedVolume) {
        return { status: "non_compliant", explanation: "Mixed units aren't allowed — use decimal fractions of one unit instead (Rule 13(3))." };
      }
      // Bug fix: only matched the bare single-letter units "kg"/"g"/"l"/"ml"
      // — real packs routinely abbreviate as "Gm(s)", "Kgs", "Ltr(s)",
      // "Litre(s)/Liter(s)", "mL(s)", all of which are still standard
      // metric declarations under Rule 13, not violations of it.
      const m = value.match(/([\d.]+)\s*(kgs?|gms?|grams?|g|l(?:tr|itres?|iters?)?s?|mls?)\b/i);
      if (m) {
        let qty = parseFloat(m[1]);
        let unit = m[2].toLowerCase();
        if (unit.startsWith("k")) { qty *= 1000; unit = "g"; }
        else if (unit.startsWith("l")) { qty *= 1000; unit = "ml"; }
        if (qty <= 10) return { status: "compliant", explanation: "Exempt commodity (≤10g/10ml, Rule 26(a))." };
        return { status: "compliant", explanation: "Net quantity is declared in standard metric units (Rule 13)." };
      }
      // Rule 12(2)/13(5): count is a legitimate declaration for commodities
      // sold by number (garments, tyres, nails, ...) — this previously
      // treated "not weight or volume" as automatically non-compliant, which
      // would wrongly fail a genuinely by-count product's real declaration.
      if (/(^|\s)(n|u)\s*[:=]?\s*\d+\b|\b\d+\s*(pcs?|pieces?|units?|nos?\.?)\b|\bpack of\s*\d+\b/i.test(value)) {
        return { status: "compliant", explanation: "Net quantity is declared by count, as permitted for this commodity type (Rule 12(2))." };
      }
      return { status: "non_compliant", explanation: "Not declared in a recognized metric unit (Rule 13)." };
    }
    case "Maximum Retail Price (incl. of all taxes)": {
      // Also catches a range written with the currency repeated on both
      // sides (e.g. "Rs. 20 - Rs. 25"), not just "20-25" — the original
      // pattern needed a bare digit right after the dash, so a repeated
      // "Rs"/"₹"/"INR" in between let a genuine range slip through as
      // compliant.
      const looksRange = /\d\s*(-|–|—|to)\s*(?:rs\.?|inr|₹)?\s*\d/i.test(value);
      if (looksRange) return { status: "non_compliant", explanation: "MRP is shown as a range, not a single fixed value (Rule 6(1)(e))." };
      const hasInclWording = /incl/i.test(value);
      return hasInclWording
        ? { status: "compliant", explanation: "MRP is a single fixed value, inclusive of all taxes (Rule 6(1)(e))." }
        : { status: "non_compliant", explanation: "MRP doesn't state 'inclusive of all taxes' (Rule 6(1)(e))." };
    }
    case "Month & Year of Manufacture / Packing": {
      // Bug fix: this only ever matched a bare "MM/YYYY" or "Mon YYYY"
      // declaration — but plenty of real packs print a full packing date
      // instead (e.g. "PKD: 18/6/20"), which still names a month and a
      // year, just with a day attached too. That's a superset of what
      // Rule 6(1)(d) asks for, not a violation of it, so a full DD/MM/YY(YY)
      // date now counts as compliant as well.
      const monthYearOnly = /\b(0?[1-9]|1[0-2])\s*[/-]\s*(19|20)\d{2}\b/.test(value);
      const monthNameYear = /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(19|20)\d{2}/i.test(value);
      const fullDate = /\b(0?[1-9]|[12]\d|3[01])\s*[/-]\s*(0?[1-9]|1[0-2])\s*[/-]\s*(\d{2}|\d{4})\b/.test(value);
      const validDate = monthYearOnly || monthNameYear || fullDate;
      return validDate
        ? { status: "compliant", explanation: "Month and year of manufacture are clearly declared (Rule 6(1)(d))." }
        : { status: "non_compliant", explanation: "Not a recognizable month/year declaration (Rule 6(1)(d))." };
    }
    case "Consumer Care Details": {
      const hasPhone = /(\+?\d[\d\-\s]{7,}\d)/.test(value);
      const hasEmail = /[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(value);
      const emailAlternativeAllowed = activeRuleText
        && /e-?mail[^.]*(accepted alternative|alternative to)/i.test(activeRuleText);
      if (hasPhone) {
        return { status: "compliant", explanation: "Consumer-care phone number is provided (Rule 6(2))." };
      }
      if (hasEmail && emailAlternativeAllowed) {
        return { status: "compliant", explanation: "E-mail accepted as an alternative consumer-care contact under the active rule version." };
      }
      if (hasEmail) {
        return { status: "non_compliant", explanation: "Only an e-mail is given; Rule 6(2) also expects a phone number." };
      }
      return { status: "missing", explanation: "No consumer-care phone number or e-mail found (Rule 6(2))." };
    }
    default:
      return null; // unrecognized field name — leave Gemini's own status as-is
  }
}

// Re-derives every field's status deterministically from Gemini's raw OCR
// "value" (never from Gemini's own status opinion), then recomputes
// overall_status from the corrected set — so the same photo produces the
// same verdict on every run, not just a plausible-sounding one.
export function applyDeterministicRules(parsed, activeRuleText) {
  if (!Array.isArray(parsed.fields)) return parsed;
  const fields = parsed.fields.map((f) => {
    const derived = deriveFieldStatus(f.name, f.value, activeRuleText);
    return derived ? { ...f, status: derived.status, explanation: derived.explanation } : f;
  });
  const overall_status = fields.some((f) => f.status !== "compliant") ? "non_compliant" : "compliant";
  return { ...parsed, fields, overall_status };
}
