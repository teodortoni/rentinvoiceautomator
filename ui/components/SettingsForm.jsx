import React, { useState } from "react";

const groups = [
  ["tenant", "Tenant", [["name", "Name"], ["email", "Email", "email"], ["address", "Address"], ["phone", "Phone (optional)", "tel"]]],
  ["landlord", "Landlord", [["name", "Name"], ["email", "Notification email", "email"], ["address", "Address"], ["phone", "Phone (optional)", "tel"]]],
  ["property", "Property & rent", [["address", "Property address"], ["amount", "Monthly rent", "number", { min: 0.01, step: 0.01, max: 9999999 }], ["fees", "Additional monthly fees", "number", { min: 0, step: 0.01, max: 9999999 }]]],
  ["invoices", "Invoice numbering", [["prefix", "Prefix", "text", { pattern: "[a-zA-Z0-9_\\-]+", maxLength: 40 }], ["suffix", "Starting number (before first send)", "number", { min: 1, max: 999999999, step: 1 }]]],
  ["", "Template & delivery", [
    ["templateId", "Google Docs template ID"], ["outputFolderId", "PDF output folder ID"],
    ["currency", "Currency", "text", { pattern: "[A-Za-z]{3}", maxLength: 3 }],
    ["timezone", "Timezone (e.g. America/New_York)"],
    ["dueDay", "Due day next month", "number", { min: 1, max: 31, step: 1 }],
    ["sendDay", "Monthly send day", "number", { min: 1, max: 28, step: 1 }],
    ["sendHour", "Send after hour (0-23)", "number", { min: 0, max: 23, step: 1 }]
  ]]
];

export function SettingsForm({ settings, configured, busy, onSave, onDirty, onCurrentTemplate }) {
  const [form, setForm] = useState(settings);
  const [dirty, setDirty] = useState(false);
  const [templateError, setTemplateError] = useState("");
  const [selecting, setSelecting] = useState(false);

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

  return (
    <section className="card"><h2>{configured ? "Your settings" : "Welcome! Set up your first invoice"}</h2>
      <p>Save once, then manage everything here. No code or spreadsheet changes.</p>
      <form onSubmit={submit}><fieldset disabled={busy || selecting}>
        {groups.map(([group, title, fields]) => <section key={title} className="form-section"><h3>{title}</h3>
          <div className="fields">{fields.map(([key, label, type = "text", attributes]) => {
            const id = (group ? group + "-" : "") + key;
            return <label key={id} htmlFor={id}>{label}<input id={id} type={type}
              required={key !== "phone"} value={group ? form[group][key] : form[key]}
              maxLength={key === "phone" ? 60 : 500} {...attributes}
              onChange={event => change(group, key, event.target.value)} /></label>;
          })}</div>
          {!group && <button type="button" onClick={currentTemplate}>Use the current Google Doc as template</button>}
        </section>)}
        {templateError && <p role="alert" className="message error">{templateError}</p>}
        <p className="hint">Paste IDs, not sharing URLs. Due dates clamp to the last day of short months. The starting number does not reset a sequence already in use.</p>
        <div className="buttons"><button className="primary" type="submit" disabled={!dirty}>Save settings</button>
          <button type="button" disabled={!dirty} onClick={() => { setForm(settings); setDirty(false); onDirty(false); setTemplateError(""); }}>Discard changes</button></div>
      </fieldset></form>
    </section>
  );
}
