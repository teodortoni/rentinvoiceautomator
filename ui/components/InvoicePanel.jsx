import React from "react";

const tokens = ["TENANT_NAME", "TENANT_ADDRESS", "TENANT_PHONE", "LANDLORD_NAME",
  "LANDLORD_ADDRESS", "LANDLORD_PHONE", "PROPERTY_ADDRESS", "DATE_ISSUED",
  "RENT_PERIOD", "DUE_DATE", "RENT_AMOUNT", "FEES", "TOTAL", "INVOICE_NUMBER"];

export function InvoicePanel({ data, busy, dirty, preview, onPreview, onSend, onAutomation }) {
  const next = data.nextInvoice;
  const disabled = busy || dirty || !data.configured;
  const enabled = data.automation.enabled && data.automation.installed;
  return <aside className="card">
    <h2>Review & delivery</h2>
    {next ? <><p className="amount">{next.amount}</p><p><strong>{next.billingPeriod}</strong><br />{next.invoiceNumber}</p>
      <dl><dt>Recipient</dt><dd>{data.settings.tenant.email}</dd><dt>Schedule</dt>
        <dd>Day {data.settings.sendDay}, after {String(data.settings.sendHour).padStart(2, "0")}:00<br />{data.settings.timezone}</dd></dl></> :
      <p>Save valid settings to preview your next invoice.</p>}
    {dirty && <p className="message warning">Save or discard changes before sending or scheduling.</p>}
    {next?.blocked && <p className="message warning">This period was sent or needs review. Check history and your Sent folder. Resending is blocked.</p>}
    {data.automation.enabled !== data.automation.installed && <p className="message warning">Schedule state differs from the installed trigger. Pause and re-enable automation.</p>}
    <div className="actions">
      <button disabled={disabled} onClick={onPreview}>Preview PDF (no email)</button>
      <button disabled={disabled || next?.blocked} className="primary" onClick={onSend}>Send invoice now</button>
      <button disabled={busy || dirty || (!data.configured && !enabled)} onClick={() => onAutomation(!enabled)}>{enabled ? "Pause automation" : "Enable monthly automation"}</button>
    </div>
    {preview && <p className="message success">{preview.url ?
      <a href={preview.url} target="_blank" rel="noreferrer">Open preview PDF</a> : "Demo preview: no PDF was created."}</p>}
    <p className="hint">Hourly checks send on the configured day after your selected hour. Timing is approximate. No automatic catch-up on later days.</p>
    <details><summary>Invoice template guide</summary>
      <p>Required: TENANT_NAME, RENT_PERIOD, DUE_DATE, TOTAL, INVOICE_NUMBER. Other supported fields are optional.</p>
      <ul className="tokens">{tokens.map(token => <li key={token}><code>{"{{" + token + "}}"}</code></li>)}</ul>
      <p className="hint">Keep placeholders contiguous. Use a private copy of your template; previews and invoices never overwrite it.</p>
    </details>
  </aside>;
}
