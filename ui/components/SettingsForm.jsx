import React, { useState } from "react";
import { UserRound, House, ReceiptText, FileText, Landmark, Save, Undo2, FileCheck2, ShieldCheck } from "lucide-react";
import { CollapsibleSection } from "./CollapsibleSection.jsx";

const sections = [
  { title: "Tenant", description: "Who receives your monthly invoice", icon: UserRound, fields: [
    ["tenant", "name", "Name"], ["tenant", "email", "Email", "email"],
    ["tenant", "address", "Address"], ["tenant", "phone", "Phone (optional)", "tel"]
  ] },
  { title: "Landlord", description: "Your contact and notification details", icon: House, fields: [
    ["landlord", "name", "Name"], ["landlord", "email", "Notification email", "email"],
    ["landlord", "address", "Address"], ["landlord", "phone", "Phone (optional)", "tel"]
  ] },
  { title: "Invoice", description: "Property, amounts, numbering, and monthly schedule", icon: ReceiptText, fields: [
    ["property", "address", "Property address"],
    ["property", "amount", "Monthly rent", "number", { min: 0.01, step: 0.01, max: 9999999 }],
    ["property", "fees", "Additional monthly fees", "number", { min: 0, step: 0.01, max: 9999999 }],
    ["", "currency", "Currency", "text", { pattern: "[A-Za-z]{3}", maxLength: 3 }],
    ["invoices", "prefix", "Prefix", "text", { pattern: "[a-zA-Z0-9_\\-]+", maxLength: 40 }],
    ["invoices", "suffix", "Starting number (before first send)", "number", { min: 1, max: 999999999, step: 1 }],
    ["", "timezone", "Timezone (e.g. America/New_York)"],
    ["", "dueDay", "Due day next month", "number", { min: 1, max: 31, step: 1 }],
    ["", "sendDay", "Monthly send day", "number", { min: 1, max: 28, step: 1 }],
    ["", "sendHour", "Send after hour (0-23)", "number", { min: 0, max: 23, step: 1 }]
  ] },
  { title: "Template", description: "Your Google Doc and private PDF destination", icon: FileText, fields: [
    ["", "templateId", "Google Docs template ID", "text", { maxLength: 200 }],
    ["", "outputFolderId", "PDF output folder ID", "text", { maxLength: 200 }]
  ] },
  { title: "Payment options", description: "Optional bank-transfer instructions for your invoice", icon: Landmark, fields: [
    ["payment", "accountName", "Name on bank account"],
    ["payment", "bankName", "Bank name"],
    ["payment", "accountNumber", "Account number", "password", { autoComplete: "off" }],
    ["payment", "routingNumber", "Routing number", "text", { inputMode: "numeric", pattern: "[0-9]{9}", maxLength: 9 }],
    ["payment", "routingNumberPaperElectronic", "Routing number (paper & electronic)", "text", { inputMode: "numeric", pattern: "[0-9]{9}", maxLength: 9 }],
    ["payment", "routingNumberWires", "Routing number (wires)", "text", { inputMode: "numeric", pattern: "[0-9]{9}", maxLength: 9 }],
    ["payment", "accountType", "Account type", "select"],
    ["payment", "memo", "Payment memo", "text", { maxLength: 300 }]
  ] }
];

export function SettingsForm({ settings, configured, busy, onSave, onDirty, onCurrentTemplate }) {
  const [form, setForm] = useState(settings);
  const [dirty, setDirty] = useState(false);
  const [templateError, setTemplateError] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [showAccount, setShowAccount] = useState(false);

  function change(group, key, value) {
    setForm(current => group ? { ...current, [group]: { ...current[group], [key]: value } } : { ...current, [key]: value });
    setDirty(true); onDirty(true);
  }

  async function currentTemplate() {
    setSelecting(true); setTemplateError("");
    try {
      const doc = await onCurrentTemplate();
      change("", "templateId", doc.id);
    } catch (error) {
      setTemplateError(error.message);
    } finally { setSelecting(false); }
  }

  function submit(event) {
    event.preventDefault();
    const value = structuredClone(form);
    ["amount", "fees"].forEach(key => { value.property[key] = Number(value.property[key]); });
    ["dueDay", "sendDay", "sendHour"].forEach(key => { value[key] = Number(value[key]); });
    value.invoices.suffix = Number(value.invoices.suffix);
    onSave(value);
  }

  return <section className="min-w-0">
    <div className="mb-6"><h2>{configured ? "Your settings" : "Welcome! Set up your first invoice"}</h2>
      <p className="mt-2">A few details now. Effortless invoices every month.</p></div>
    <form onSubmit={submit}
      onInvalidCapture={event => {
        const section = event.target.closest("details");
        if (section) section.open = true;
      }}>
      <fieldset disabled={busy || selecting} className="space-y-4">
        {sections.map(({ title, description, icon, fields }) =>
          <CollapsibleSection key={title} title={title} description={description} icon={icon}>
            <div className="fields">{fields.map(([group, key, label, type = "text", attributes]) => {
              const id = (group ? group + "-" : "") + key;
              const value = (group ? form[group]?.[key] : form[key]) ?? "";
              const common = {
                id, name: id, required: group !== "payment" && key !== "phone", value,
                onChange: event => change(group, key, event.target.value)
              };
              return <label key={id} htmlFor={id}>{label}
                {type === "select" ? <select {...common} aria-label={label}>
                  <option value="">Not specified</option><option value="checking">Checking</option><option value="savings">Savings</option>
                </select> : <input {...common} type={key === "accountNumber" && showAccount ? "text" : type}
                  maxLength={group === "payment" ? 100 : key === "phone" ? 60 : 500} {...attributes} />}
              </label>;
            })}</div>
            {title === "Template" && <>
              <button className="mt-4" type="button" onClick={currentTemplate}><FileCheck2 size={16} aria-hidden="true" />Use the current Google Doc as template</button>
              <p className="hint mt-3">Paste file IDs, not sharing URLs. Your master document stays unchanged.</p>
              {templateError && <p role="alert" className="message error mt-3">{templateError}</p>}
            </>}
            {title === "Invoice" && <p className="hint mt-4">Due dates clamp to the last day of short months. The starting number does not reset a sequence already in use.</p>}
            {title === "Payment options" && <>
              <label className="mt-4 flex-row items-center gap-2 font-normal">
                <input className="h-4 w-4 accent-coral-600" type="checkbox" checked={showAccount}
                  onChange={event => setShowAccount(event.target.checked)} />Show account number
              </label>
              <p className="hint mt-4 flex items-start gap-2"><ShieldCheck size={16} className="shrink-0" aria-hidden="true" />
                Bank details are optional and saved to your Google account. Corresponding tokens print full values on PDFs sent to the tenant. Routing numbers use nine digits; leading zeros are preserved. Private JSON backups include these details.</p>
            </>}
          </CollapsibleSection>)}
        <div className="save-bar"><span className="text-xs text-neutral-500">{dirty ? "You have unsaved changes" : "All settings up to date"}</span>
          <div className="buttons"><button type="button" disabled={!dirty} onClick={() => {
            setForm(settings); setDirty(false); onDirty(false); setTemplateError(""); setShowAccount(false);
          }}><Undo2 size={16} aria-hidden="true" />Discard changes</button>
            <button className="primary" type="submit" disabled={!dirty}><Save size={16} aria-hidden="true" />Save settings</button></div>
        </div>
      </fieldset>
    </form>
  </section>;
}
