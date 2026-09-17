import { Link } from 'react-router-dom';
import { AsciiAtmosphere } from '../components/AsciiAtmosphere.jsx';

export function Landing() {
  return <section className="phantom-cover">
    <AsciiAtmosphere />
    <div className="phantom-hero">
      <h1>Know what’s on the label.<br />Find what’s missing.</h1>
      <p>Check packaged goods, document the evidence,<br className="phantom-desktop-break" /> and bring every inspection into one workspace.</p>
      <Link className="phantom-primary" to="/sign-in">Start an inspection</Link>
    </div>
    <Link className="phantom-scroll" to="/features">Explore the platform <span>↗</span></Link>
  </section>;
}
