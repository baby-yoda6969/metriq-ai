import { NavLink, Link, Outlet, useLocation } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo.jsx';
import '../styles/landing.css';
import '../styles/pages.css';
export function PublicLayout() {
  const isLanding = useLocation().pathname === "/";
  return <div className={`phantom-landing public-layout${isLanding ? " public-layout-landing" : ""}`}>
    <header className="phantom-header">
      <Link to="/" className="phantom-brand" aria-label="Metriq home"><BrandLogo mark className="phantom-mark" /><span>Metriq</span></Link>
      <nav aria-label="Main navigation">{[['/', 'Platform'], ['/features', 'Features'], ['/use-cases', 'Use cases'], ['/sign-in', 'Sign in']].map(([to, label]) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => isActive ? 'phantom-nav-current' : ''}>{label}{to === '/sign-in' && <ArrowUpRight size={14} />}</NavLink>)}</nav>
    </header>
    <main id="page-content" className="public-content"><Outlet /></main>
    <footer className="phantom-footer"><Link to="/" className="phantom-brand"><BrandLogo mark className="phantom-mark" /><span>Metriq</span></Link><span>Legal Metrology · Field Compliance</span><Link to="/sign-in">Open workspace ↗</Link></footer>
  </div>;
}
