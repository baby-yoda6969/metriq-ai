import { Link } from 'react-router-dom';
const TEAMS = [
  ['inspector','Inspectors','Capture evidence in the field.',['Photograph or upload a product label','Review declarations and supporting evidence','Save inspections and export case reports']],
  ['supervisor','Supervisors','Turn findings into follow-up.',['Review regional and category trends','Assign, escalate, and assess cases','Download a jurisdiction summary']],
  ['ruleadmin','Rule administrators','Maintain the rules behind each check.',['Draft and compare rule amendments','Review proposed changes','Publish versioned rules for inspections']],
];
export function UseCases() {
  return <div className="public-page"><header className="public-page-heading"><span className="phantom-section-label">USE CASES</span><h1>One process.<br />A workspace for every role.</h1><p>Each role has its own tools, with a shared view of the inspection and its evidence.</p></header><div className="team-directory">{TEAMS.map(([role,title,summary,items]) => <article key={role}><div><span className="phantom-section-label">{title}</span><h2>{summary}</h2><Link to={`/sign-in/${role}`}>Continue as {title.toLowerCase()} ↗</Link></div><ul>{items.map(item => <li key={item}>{item}</li>)}</ul></article>)}</div></div>;
}
