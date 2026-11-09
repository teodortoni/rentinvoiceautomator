const initial = {
  templateId: "example-template", outputFolderId: "example-folder",
  tenant: { name: "Example Tenant", address: "100 Example Street", phone: "", email: "tenant@example.com" },
  landlord: { name: "Example Landlord", address: "200 Example Avenue", phone: "", email: "owner@example.com" },
  property: { address: "100 Example Street, Unit 1", amount: 1500, fees: 0 },
  dueDay: 1, sendDay: 25, sendHour: 9, timezone: "America/New_York",
  currency: "USD", invoices: { prefix: "RENT", suffix: 1 }
};
let state = {
  settings: initial, configured: true, revision: "demo-1",
  automation: { enabled: false, installed: false }, history: []
};

function dashboard() {
  const now = new Date();
  const next = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1));
  const billingKey = next.toISOString().slice(0, 7);
  return {
    ...state,
    nextInvoice: {
      billingKey, billingPeriod: next.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
      invoiceNumber: `${state.settings.invoices.prefix}-${billingKey.slice(0, 4)}-${String(state.settings.invoices.suffix).padStart(3, "0")}`,
      amount: new Intl.NumberFormat("en-US", { style: "currency", currency: state.settings.currency })
        .format(state.settings.property.amount + state.settings.property.fees),
      blocked: state.history.some(row => row.billingKey === billingKey && row.status === "sent")
    }
  };
}

export async function demoCall(method, ...args) {
  switch (method) {
    case "getRentDashboard": return structuredClone(dashboard());
    case "saveRentSettings":
      state.settings = structuredClone(args[0]);
      state.revision = String(Date.now());
      return structuredClone(dashboard());
    case "useCurrentRentTemplate": return { id: "example-template", name: "Example invoice template" };
    case "previewRentInvoice": return { url: null, invoiceNumber: dashboard().nextInvoice.invoiceNumber, billingPeriod: dashboard().nextInvoice.billingPeriod };
    case "setRentAutomation":
      state.automation = { enabled: args[0], installed: args[0] };
      return structuredClone(dashboard());
    case "sendRentInvoice": {
      const next = dashboard().nextInvoice;
      if (next.blocked) throw new Error("This demo billing month is already sent.");
      state.history.unshift({
        ...next, recipient: state.settings.tenant.email, status: "sent", warning: "",
        error: "", pdfUrl: null, createdAt: new Date().toISOString()
      });
      state.settings = { ...state.settings, invoices: { ...state.settings.invoices, suffix: state.settings.invoices.suffix + 1 } };
      return structuredClone(dashboard());
    }
    case "exportRentData": return structuredClone({ ...state, schemaVersion: 1 });
    default: throw new Error("Unknown demo operation.");
  }
}
