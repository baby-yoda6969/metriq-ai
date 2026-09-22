import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FieldRow, IntegrityBadge, Stamp } from './scan/parts.jsx';
import { Button } from '../components/ui/Button.jsx';
import { downloadReport } from '../lib/pdf/caseReport.js';
import { downloadReportDocx } from '../lib/docx/caseReport.js';

export default function SharedReport() {
  const { token } = useParams();
  const [scan, setScan] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setScan(null); setError('');
    fetch(`/api/reports/${encodeURIComponent(token)}`, { signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to load report.');
        setScan(data);
      }).catch(error => { if (error.name !== 'AbortError') setError(error.message); });
    return () => controller.abort();
  }, [token]);
  return <main className="mx-auto w-full max-w-4xl px-5 py-12 sm:px-8">
    <p className="text-xs uppercase tracking-widest text-ink-soft">Metriq · Shared inspection report</p>
    {error ? <div className="mt-8 rounded-xl border border-border bg-panel p-6" role="alert"><h1 className="text-2xl font-semibold">Report unavailable</h1><p className="mt-3 text-ink-soft">{error}</p></div>
      : !scan ? <p className="mt-8" role="status">Loading report…</p> : <>
        <h1 className="mt-4 text-3xl font-semibold text-ink">{scan.brand}</h1>
        <p className="mt-2 text-sm text-ink-soft">{scan.category} · {scan.region} · {scan.date}</p>
        <p className="mt-2 font-mono text-sm">{scan.sampleId || `SMP-${(scan.hash || '').slice(0, 8).toUpperCase()}`} · Case {scan.id}</p>
        <div className="my-6 flex flex-wrap items-center gap-3">
          <Stamp status={scan.status} />
          <Button onClick={() => downloadReport(scan)}>Download PDF</Button>
          <Button onClick={() => downloadReportDocx(scan)}>Download Word</Button>
        </div>
        <p className="mb-6 text-sm text-ink-soft">Saved report snapshot · Inspected by {scan.inspector}. This page is read-only.</p>
        {scan.retakeReason && <p className="mb-4">{scan.retakeReason}</p>}
        <section aria-label="Declaration results" className="mb-6 space-y-3">
          {scan.fields.map((field, i) => <FieldRow key={i} field={field} correction={scan.fieldCorrections?.[field.name]} />)}
        </section>
        <IntegrityBadge scan={scan} />
        {Object.entries({ 'Label evidence': scan.imageDataUrl, 'Side evidence': scan.additionalPhotos?.side, 'Back evidence': scan.additionalPhotos?.back }).map(([label, image]) =>
          typeof image === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(image) ? <figure key={label} className="mt-6 rounded-xl border border-border bg-panel p-4"><figcaption className="mb-3 font-semibold">{label}</figcaption><img src={image} alt={label} className="mx-auto max-h-[680px] max-w-full object-contain" /></figure> : null)}
      </>}
  </main>;
}
