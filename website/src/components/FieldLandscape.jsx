/** Theme-aware, local vector artwork. No remote assets or animation required. */
export function FieldLandscape({ className = '' }) {
  const contours = Array.from({ length: 64 }, (_, row) => {
    const points = Array.from({ length: 101 }, (_, col) => {
      const x = col * 8;
      const peak = 240 * Math.exp(-(((x - 490) / 145) ** 2));
      const ridge = 90 * Math.exp(-(((x - 190) / 130) ** 2));
      const y = 330 + row * 7 - (peak + ridge) * (1 - row / 92) + Math.sin(x / 62 + row / 11) * 15;
      return `${x},${y.toFixed(2)}`;
    }).join(' ');
    return <polyline key={row} points={points} opacity={.22 + row / 110} />;
  });
  return <div className={`field-landscape ${className}`} aria-hidden="true">
    <svg viewBox="0 0 800 800" preserveAspectRatio="xMidYMid slice" fill="none">
      <circle className="field-sun" cx="520" cy="178" r="77" />
      <g stroke="currentColor" strokeWidth="1.4">{contours}</g>
      <g fill="currentColor">{Array.from({ length: 180 }, (_, i) => <circle key={i} cx={(i * 137.508) % 800} cy={(i * 71.31) % 800} r={i % 3 === 0 ? .8 : .45} opacity=".35" />)}</g>
      <path d="M70 80h22M81 69v22M698 688h22M709 677v22" stroke="currentColor" opacity=".6" />
    </svg>
    <div className="field-landscape-caption"><span>METRIQ / FIELD NOTES</span><span>A clearer perspective.</span></div>
  </div>;
}
