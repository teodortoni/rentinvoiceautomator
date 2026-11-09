function readRentAutomation_(store) {
  const raw = store.properties.getProperty("RENT_AUTOMATION");
  if (!raw) return { enabled: false, triggerId: null };
  const value = JSON.parse(raw);
  if (typeof value.enabled !== "boolean" ||
      (value.triggerId !== null && typeof value.triggerId !== "string")) {
    throw new Error("Invalid saved automation state.");
  }
  return value;
}

function updateRentAutomation_(enabled) {
  if (typeof enabled !== "boolean") throw new Error("Automation state must be a boolean.");
  return withRentUserLock_(() => {
    const service = new RentInvoiceServices();
    if (enabled) service.getConfigured();
    service.store.setJson("RENT_AUTOMATION", { enabled: false, triggerId: null });
    // getProjectTriggers only returns this user's triggers, not other landlords'.
    ScriptApp.getProjectTriggers().forEach(trigger => {
      if (trigger.getHandlerFunction() === "sendMonthlyRentInvoice") ScriptApp.deleteTrigger(trigger);
    });
    if (enabled) {
      const trigger = ScriptApp.newTrigger("sendMonthlyRentInvoice")
        .timeBased().everyHours(1).create();
      service.store.setJson("RENT_AUTOMATION", { enabled: true, triggerId: trigger.getUniqueId() });
    }
    return service.dashboard();
  });
}

function isRentScheduleDue_(settings, store, now = new Date()) {
  const automation = readRentAutomation_(store);
  return automation.enabled &&
    Number(Utilities.formatDate(now, settings.timezone, "d")) === settings.sendDay &&
    Number(Utilities.formatDate(now, settings.timezone, "H")) >= settings.sendHour;
}

function sendMonthlyRentInvoice(event) {
  const store = new RentConfigStore();
  const automation = readRentAutomation_(store);
  if (!automation.enabled) return;
  if (!event || String(event.triggerUid) !== automation.triggerId) {
    throw new Error("This function must run from your installed add-on trigger.");
  }
  const authorization = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL);
  if (authorization.getAuthorizationStatus() === ScriptApp.AuthorizationStatus.REQUIRED) {
    console.error("Rent invoice automation needs reauthorization. Open the add-on in Google Docs.");
    return;
  }
  const service = new RentInvoiceServices(store);
  const config = service.getConfigured();
  if (!isRentScheduleDue_(config.settings, store)) return;
  return service.send(service.context(config.settings).billingKey, config.revision, true);
}
