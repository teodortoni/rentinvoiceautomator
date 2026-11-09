function onOpen(event) {
  DocumentApp.getUi().createAddonMenu()
    .addItem("Settings & invoices", "showRentSettings")
    .addToUi();
}

function onInstall(event) {
  onOpen(event);
}

function showRentSettings() {
  const html = HtmlService.createHtmlOutputFromFile("Settings")
    .setWidth(1040).setHeight(760);
  DocumentApp.getUi().showModalDialog(html, "Rent Invoice Manager");
}

function getRentDashboard() {
  return new RentInvoiceServices().dashboard();
}

function saveRentSettings(settings, revision) {
  return new RentInvoiceServices().saveSettings(settings, revision);
}

function previewRentInvoice(revision) {
  return new RentInvoiceServices().preview(revision);
}

function sendRentInvoice(billingKey, revision) {
  return new RentInvoiceServices().send(billingKey, revision);
}

function setRentAutomation(enabled) {
  return updateRentAutomation_(enabled);
}

function useCurrentRentTemplate() {
  const doc = DocumentApp.getActiveDocument();
  if (!doc) throw new Error("Open your invoice template in Google Docs first.");
  return { id: doc.getId(), name: doc.getName() };
}

function exportRentData() {
  const service = new RentInvoiceServices();
  return {
    schemaVersion: 1, settings: service.store.read().settings,
    history: service.store.history(), exportedAt: new Date().toISOString()
  };
}
