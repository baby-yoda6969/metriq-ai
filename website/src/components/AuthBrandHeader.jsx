import { BrandLogo } from "./BrandLogo.jsx";
const TOPO = `url("data:image/svg+xml,${encodeURIComponent(`
<svg xmlns='http://www.w3.org/2000/svg' width='390' height='340' viewBox='0 0 390 340' fill='none'>
  <path d='M-40 55 C20 28, 70 78, 130 52 S220 8, 285 42 S360 88, 430 55' stroke='#D0E0F8' stroke-opacity='0.22' stroke-width='1.15'/>
  <path d='M-50 105 C15 72, 80 128, 145 98 S245 48, 315 95 S390 145, 450 110' stroke='#D0E0F8' stroke-opacity='0.18' stroke-width='1.15'/>
  <path d='M-30 155 C40 118, 100 175, 170 148 S275 100, 340 145 S415 195, 460 160' stroke='#D0E0F8' stroke-opacity='0.14' stroke-width='1.15'/>
  <path d='M-45 205 C30 165, 105 225, 175 195 S280 150, 350 195 S430 245, 470 210' stroke='#D0E0F8' stroke-opacity='0.11' stroke-width='1.15'/>
  <path d='M-35 255 C45 212, 115 275, 190 245 S295 200, 360 245 S440 295, 480 260' stroke='#D0E0F8' stroke-opacity='0.08' stroke-width='1.15'/>
  <path d='M-25 300 C55 258, 130 320, 205 290 S310 245, 375 290 S450 340, 490 305' stroke='#D0E0F8' stroke-opacity='0.06' stroke-width='1.15'/>
</svg>
`)}")`;

export function AuthBrandHeader() {
  return <div className="website-auth-header" style={{ backgroundImage: TOPO, backgroundSize: 'cover' }}>
    <BrandLogo mode="dark" />
    <svg viewBox="0 0 390 48" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 18 C70 46, 130 2, 195 22 S320 48, 390 14 L390 48 L0 48 Z" fill="#FFFFFF" />
    </svg>
  </div>;
}
