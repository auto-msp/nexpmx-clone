/** Hides app chrome and flattens colours when printing a `.print-doc` page. */
export function PrintStyles() {
  const css = `@media print {
  aside, nav, footer, header.sticky, .no-print, [role="dialog"], .fixed { display: none !important; }
  body, main { background: #fff !important; }
  main { padding: 0 !important; }
  .print-doc, .print-doc * { color: #111 !important; background: transparent !important; border-color: #bbb !important; box-shadow: none !important; }
  .print-doc { border: 0 !important; }
}`;
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
