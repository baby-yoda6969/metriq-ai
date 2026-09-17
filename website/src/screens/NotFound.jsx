import { Link } from 'react-router-dom';
export function NotFound() {
  return <div className="public-page"><header className="public-page-heading"><span className="phantom-section-label">404</span><h1>Page not found.</h1><p>This address doesn’t match a page in Metriq.</p></header><Link className="phantom-primary" to="/">Back to platform</Link></div>;
}
