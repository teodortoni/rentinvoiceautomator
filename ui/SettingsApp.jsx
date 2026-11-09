import React, { useEffect, useState } from "react";
import { callServer, demoMode } from "./api.js";
import { SettingsForm } from "./components/SettingsForm.jsx";
import { InvoicePanel } from "./components/InvoicePanel.jsx";
import { History } from "./components/History.jsx";

export function SettingsApp() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState(null);

  async function perform(action, message = "") {
    setBusy(true); setError(""); setNotice("");
    try {
      await action();
      setNotice(message);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  const refresh = () => perform(async () => { setData(await callServer("getRentDashboard")); });
  useEffect(() => { refresh(); }, []);

  async function save(settings) {
    await perform(async () => {
      setData(await callServer("saveRentSettings", settings, data.revision));
      setDirty(false); setPreview(null);
    }, "Settings saved privately for your Google account.");
  }

  async function send() {
    if (!window.confirm(`Send ${data.nextInvoice.amount} for ${data.nextInvoice.billingPeriod} to ${data.settings.tenant.email}?`)) return;
    await perform(async () => {
      try {
        setData(await callServer("sendRentInvoice", data.nextInvoice.billingKey, data.revision));
      } catch (failure) {
        try { setData(await callServer("getRentDashboard")); }
        catch (refreshError) {
          setData(null);
          throw new Error(`${failure.message} History refresh also failed: ${refreshError.message}`);
        }
        throw failure;
      }
    }, demoMode ? "Simulated send only. No email was sent." : "Invoice sent. Review history for confirmation warnings.");
  }

  async function exportData() {
    await perform(async () => {
      const value = await callServer("exportRentData");
      const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url; link.download = "rent-invoice-backup.json"; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "Private backup downloaded. Store it securely.");
  }

  return (
    <main>
      <header><div><p className="eyebrow">GOOGLE DOCS ADD-ON</p><h1>Rent Invoice Manager</h1><p>Your invoices. Your Google account. No spreadsheet required.</p></div>
        <button onClick={refresh} disabled={busy || dirty}>Reload</button></header>
      {demoMode && <p className="message warning">LOCAL DEMO: Fictional, in-memory data. No Google access, PDFs, real schedules, or emails. Reloading resets changes.</p>}
      {error && <p className="message error" role="alert">{error}</p>}
      {notice && <p className="message success" role="status">{notice}</p>}
      {!data ? <section className="card"><p>{busy ? "Loading settings..." : "Could not load settings."}</p>{!busy && <button onClick={refresh}>Retry</button>}</section> : <>
        <div className="layout">
          <SettingsForm key={data.revision || "onboarding"} settings={data.settings} configured={data.configured} busy={busy} onSave={save} onDirty={setDirty}
            onCurrentTemplate={() => callServer("useCurrentRentTemplate")} />
          <InvoicePanel data={data} busy={busy} dirty={dirty} preview={preview} onSend={send}
            onPreview={() => perform(async () => { setPreview(await callServer("previewRentInvoice", data.revision)); },
              demoMode ? "Demo preview only; no PDF created." : "Private preview PDF created. No email was sent.")}
            onAutomation={enabled => perform(async () => {
              try { setData(await callServer("setRentAutomation", enabled)); }
              catch (failure) {
                try { setData(await callServer("getRentDashboard")); }
                catch (refreshError) {
                  setData(null);
                  throw new Error(`${failure.message} Schedule refresh also failed: ${refreshError.message}`);
                }
                throw failure;
              }
            }, enabled ? "Monthly automation enabled." : "Automation paused.")} />
        </div>
        <History history={data.history} onExport={exportData} busy={busy || dirty} />
        <footer>Settings and invoice history are private to your Google account. Invoices bill the following month. <button onClick={() => globalThis.google?.script?.host?.close()}>Close</button></footer>
      </>}
    </main>
  );
}
