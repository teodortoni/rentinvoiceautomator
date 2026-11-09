import React from "react";
import { Download, Clock3, FileDown } from "lucide-react";

export function History({ history, busy, onExport }) {
  return <section className="card history">
    <div className="section-title"><h2 className="flex items-center gap-2"><Clock3 size={20} aria-hidden="true" />Invoice history</h2><button disabled={busy} onClick={onExport}><Download size={16} aria-hidden="true" />Export private JSON backup</button></div>
    {!history.length ? <p className="py-8 text-center">No invoices sent yet. Previews do not count as sends.</p> :
      <div className="table-scroll"><table><thead><tr><th>Invoice</th><th>Recipient</th><th>Amount</th><th>Status</th><th>Document</th></tr></thead>
        <tbody>{history.map(row => <tr key={row.billingKey}><td><strong>{row.invoiceNumber}</strong><br />{row.billingPeriod}<br />
          <small>{new Date(row.sentAt || row.createdAt).toLocaleString()}</small></td>
          <td>{row.recipient}</td><td>{row.amount}</td><td><span className={"badge " + row.status}>{row.status}</span>
            {row.error && <p className="row-error">{row.error}</p>}{row.warning && <p className="row-error">{row.warning}</p>}</td>
          <td>{row.pdfUrl ? <a className="inline-flex items-center gap-1" href={row.pdfUrl} target="_blank" rel="noreferrer"><FileDown size={14} aria-hidden="true" />PDF</a> : "-"}</td></tr>)}</tbody>
      </table></div>}
  </section>;
}
