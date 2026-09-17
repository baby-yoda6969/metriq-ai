import { Link } from 'react-router-dom';
const FEATURES = [
  ['01', 'Label inspection', 'Upload a label photograph or capture one in the field. Check the manufacturer, net quantity, price, packing date, and consumer-care declarations.'],
  ['02', 'Evidence & corrections', 'Review what was extracted. Attach supporting photographs and correct a reading with evidence before saving the case.'],
  ['03', 'Case history', 'Search recorded inspections by brand, category, and region. Filter results by status and open the complete findings.'],
  ['04', 'Supervisory review', 'Review compliance trends, assign follow-up work, escalate cases, and document supervisory decisions.'],
  ['05', 'Rule management', 'Draft amendments, compare versions, review changes, and publish the rules used by inspections.'],
  ['06', 'Reports', 'Export case findings and evidence as a PDF or an editable Word document.'],
];
export function Features() {
  return <div className="public-page"><header className="public-page-heading"><span className="phantom-section-label">PLATFORM FEATURES</span><h1>From label to case report.</h1><p>The tools for capturing evidence, reviewing declarations, and following an inspection through.</p></header><div className="feature-directory">{FEATURES.map(([n,title,text]) => <article key={n}><span>{n}</span><div><h2>{title}</h2><p>{text}</p></div></article>)}</div><div className="public-page-action"><Link to="/sign-in" className="phantom-primary">Open your workspace</Link><Link to="/use-cases">Find your role ↗</Link></div></div>;
}
