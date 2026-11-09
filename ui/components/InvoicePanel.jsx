import React from "react";
import { CalendarDays, Send, Eye, Pause, Play, FileText, CircleCheck } from "lucide-react";

const tokens = ["TENANT_NAME", "TENANT_ADDRESS", "TENANT_PHONE", "LANDLORD_NAME",
  "LANDLORD_ADDRESS", "LANDLORD_PHONE", "PROPERTY_ADDRESS", "DATE_ISSUED",
  "RENT_PERIOD", "DUE_DATE", "RENT_AMOUNT", "FEES", "TOTAL", "INVOICE_NUMBER",
  "BANK_ACCOUNT_NAME", "BANK_NAME", "BANK_ACCOUNT_NUMBER", "BANK_ROUTING_NUMBER",
  "BANK_ROUTING_NUMBER_PAPER_ELECTRONIC", "BANK_ROUTING_NUMBER_WIRES",
  "BANK_ACCOUNT_TYPE", "PAYMENT_MEMO"];

export function InvoicePanel({ data, busy, dirty, preview, onPreview, onSend, onAutomation }) {
  const next = data.nextInvoice;
  const disabled = busy || dirty || !data.configured;
  const enabled = data.automation.enabled && data.automation.installed;
  return <aside className="card shadow-[0_6px_28px_rgba(0,0,0,0.07)] lg:sticky lg:top-6">
    <div className="mb-4 flex items-center justify-between gap-2"><h2>Review & delivery</h2><FileText size={20} className="text-neutral-400" aria-hidden="true" /></div>
    <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600">
      <CircleCheck size={13} aria-hidden="true" />{enabled ? "Automation active" : "You're in control"}</span>
    {next ? <><p className="amount">{next.amount}</p><p><strong>{next.billingPeriod}</strong><br />{next.invoiceNumber}</p>
      <dl className="mt-5 space-y-3 border-y border-neutral-100 py-5 text-sm"><div><dt className="text-xs text-neutral-500">Recipient</dt><dd className="mt-1 break-all">{data.settings.tenant.email}</dd></div><div><dt className="flex items-center gap-1.5 text-xs text-neutral-500"><CalendarDays size={13} aria-hidden="true" />Schedule</dt>
        <dd className="mt-1">Day {data.settings.sendDay}, after {String(data.settings.sendHour).padStart(2, "0")}:00<br />{data.settings.timezone}</dd></div></dl></> :
      <p>Save valid settings to preview your next invoice.</p>}
    {dirty && <p className="message warning">Save or discard changes before sending or scheduling.</p>}
    {next?.blocked && <p className="message warning">This period was sent or needs review. Check history and your Sent folder. Resending is blocked.</p>}
    {data.automation.enabled !== data.automation.installed && <p className="message warning">Schedule state differs from the installed trigger. Pause and re-enable automation.</p>}
    <div className="actions">
      <button disabled={disabled} onClick={onPreview}><Eye size={16} aria-hidden="true" />Preview PDF (no email)</button>
      <button disabled={disabled || next?.blocked} className="primary" onClick={onSend}><Send size={16} aria-hidden="true" />Send invoice now</button>
      <button disabled={busy || dirty || (!data.configured && !enabled)} onClick={() => onAutomation(!enabled)}>{enabled ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}{enabled ? "Pause automation" : "Enable monthly automation"}</button>
    </div>
    {preview && <p className="message success">{preview.url ?
      <a href={preview.url} target="_blank" rel="noreferrer">Open preview PDF</a> : "Demo preview: no PDF was created."}</p>}
    <p className="hint">Hourly checks send on the configured day after your selected hour. Timing is approximate. No automatic catch-up on later days.</p>
    <details className="mt-5 border-t border-neutral-200 pt-4 text-sm"><summary className="font-semibold underline underline-offset-4">Invoice template guide</summary>
      <p>Required: TENANT_NAME, RENT_PERIOD, DUE_DATE, TOTAL, INVOICE_NUMBER. Other supported fields are optional.</p>
      <ul className="tokens">{tokens.map(token => <li key={token}><code>{"{{" + token + "}}"}</code></li>)}</ul>
      <p className="hint">Keep placeholders contiguous. Use a private copy of your template; previews and invoices never overwrite it.</p>
      <p className="hint mt-2">Bank tokens are optional. If used, they include full payment details in the PDF. Blank payment fields produce blank token values.</p>
    </details>
  </aside>;
}
