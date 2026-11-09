import React from "react";

export function History({ history, busy, onExport }) {
  return <section className="card history">
    <div className="section-title"><h2>Invoice history</h2><button disabled={busy} onClick={onExport}>Export private JSON backup</button></div>
    {!history.length ? <p>No invoices sent yet. Previews do not count as sends.</p> :
      <div className="table-scroll"><table><thead><tr><th>Invoice</th><th>Recipient</th><th>Amount</th><th>Status</th><th>Document</th></tr></thead>
        <tbody>{history.map(row => <tr key={row.billingKey}><td><strong>{row.invoiceNumber}</strong><br />{row.billingPeriod}<br />
          <small>{new Date(row.sentAt || row.createdAt).toLocaleString()}</small></td>
          <td>{row.recipient}</td><td>{row.amount}</td><td><span className={"badge " + row.status}>{row.status}</span>
            {row.error && <p className="row-error">{row.error}</p>}{row.warning && <p className="row-error">{row.warning}</p>}</td>
          <td>{row.pdfUrl ? <a href={row.pdfUrl} target="_blank" rel="noreferrer">PDF</a> : "-"}</td></tr>)}</tbody>
      </table></div>}
  </section>;
}
