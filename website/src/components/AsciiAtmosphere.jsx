// A deterministic ASCII sphere: local vector type, no canvas loop or network asset.
const GLYPHS = ' .:+xX08@';
const SPHERE = [];
for (let row = 0; row < 46; row++) {
  for (let col = 0; col < 76; col++) {
    const x = (col - 37.5) / 34;
    const y = (row - 22.5) / 21;
    const radius = x * x + y * y;
    if (radius > 1) continue;
    const z = Math.sqrt(1 - radius);
    const light = Math.max(0, x * .45 - y * .68 + z * .28);
    const texture = (Math.sin(col * 17.7 + row * 29.1) + 1) / 2;
    const strength = light * (.5 + texture * .5);
    if (strength < .19 || (y > .15 && texture < .83)) continue;
    SPHERE.push({ x: col * 8 + 18, y: row * 10 + 18, glyph: GLYPHS[Math.min(8, Math.floor(strength * 10))], opacity: strength * .65 });
  }
}

export function AsciiAtmosphere() {
  return <div className="phantom-atmosphere" aria-hidden="true">
    <div className="phantom-haze" />
    <svg className="phantom-sphere" viewBox="0 0 640 500" fill="currentColor">
      {SPHERE.map((point, i) => <text key={i} x={point.x} y={point.y} opacity={point.opacity}>{point.glyph}</text>)}
    </svg>
    <div className="phantom-dust">{Array.from({ length: 24 }, (_, i) => <span key={i} style={{ left: `${5 + (i * 37.3) % 90}%`, top: `${17 + (i * 23.1) % 77}%`, opacity: .12 + (i % 3) * .04 }}>{['+', '−', 'x', '='][i % 4]}</span>)}</div>
  </div>;
}

