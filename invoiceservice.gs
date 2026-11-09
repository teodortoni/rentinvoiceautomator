class RentInvoiceServices {
  constructor(store = new RentConfigStore()) {
    this.store = store;
  }

  context(settings, now = new Date()) {
    const [year, month] = Utilities.formatDate(now, settings.timezone, "yyyy-MM").split("-").map(Number);
    const next = new Date(Date.UTC(year, month, 1));
    const billingKey = next.toISOString().slice(0, 7);
    const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
    const date = day => Utilities.parseDate(
      billingKey + "-" + String(day).padStart(2, "0") + " 12:00", settings.timezone, "yyyy-MM-dd HH:mm");
    const format = value => Utilities.formatDate(value, settings.timezone, "MMM d, yyyy");
    const counter = this.store.properties.getProperty("RENT_NEXT_NUMBER");
    const reserved = this.store.history().filter(row => ["sent", "sending", "uncertain"].includes(row.status));
    const highestReserved = reserved.reduce((max, row) => Math.max(max, row.suffix), 0);
    const suffix = Math.max(counter === null ? settings.invoices.suffix : Number(counter), highestReserved + 1);
    if (!Number.isSafeInteger(suffix) || suffix < 1) throw new Error("The invoice sequence is invalid.");
    return {
      billingKey,
      billingPeriod: Utilities.formatDate(date(1), settings.timezone, "MMMM yyyy"),
      rentPeriod: format(date(1)) + " - " + format(date(lastDay)),
      dueDate: format(date(Math.min(settings.dueDay, lastDay))),
      dateIssued: format(now),
      invoiceNumber: settings.invoices.prefix + "-" + billingKey.substring(0, 4) + "-" + String(suffix).padStart(3, "0"),
      suffix
    };
  }

  formatCurrency(value, settings) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: settings.currency }).format(value);
  }

  replacements(settings, context) {
    return {
      TENANT_NAME: settings.tenant.name,
      TENANT_ADDRESS: settings.tenant.address,
      TENANT_PHONE: settings.tenant.phone,
      LANDLORD_NAME: settings.landlord.name,
      LANDLORD_ADDRESS: settings.landlord.address,
      LANDLORD_PHONE: settings.landlord.phone,
      PROPERTY_ADDRESS: settings.property.address,
      DATE_ISSUED: context.dateIssued,
      RENT_PERIOD: context.rentPeriod,
      DUE_DATE: context.dueDate,
      RENT_AMOUNT: this.formatCurrency(settings.property.amount, settings),
      FEES: this.formatCurrency(settings.property.fees, settings),
      TOTAL: this.formatCurrency(Math.round((settings.property.amount + settings.property.fees) * 100) / 100, settings),
      INVOICE_NUMBER: context.invoiceNumber
    };
  }

  sections(doc) {
    const sections = [];
    const visit = tab => {
      const documentTab = tab.asDocumentTab();
      sections.push(documentTab.getBody());
      if (documentTab.getHeader()) sections.push(documentTab.getHeader());
      if (documentTab.getFooter()) sections.push(documentTab.getFooter());
      tab.getChildTabs().forEach(visit);
    };
    doc.getTabs().forEach(visit);
    return sections;
  }

  createPdf(settings, context, preview = false) {
    const folder = DriveApp.getFolderById(settings.outputFolderId);
    const name = (preview ? "Preview-" : "Invoice-") + context.invoiceNumber;
    const copy = DriveApp.getFileById(settings.templateId).makeCopy(name, folder);
    try {
      const doc = DocumentApp.openById(copy.getId());
      const sections = this.sections(doc);
      const replacements = this.replacements(settings, context);
      const seen = new Set();
      sections.forEach(section => {
        Object.keys(replacements).forEach(key => {
          const pattern = "\\{\\{" + key + "\\}\\}";
          if (section.findText(pattern)) seen.add(key);
          section.replaceText(pattern, replacements[key]);
        });
        if (section.findText("\\{\\{[^{}]+\\}\\}")) {
          throw new Error("Unknown or unresolved template placeholder. Check the template guide.");
        }
      });
      const required = ["TENANT_NAME", "RENT_PERIOD", "DUE_DATE", "TOTAL", "INVOICE_NUMBER"];
      const missing = required.filter(key => !seen.has(key));
      if (missing.length) throw new Error("Template is missing required placeholders: " + missing.join(", "));
      doc.saveAndClose();
      const blob = copy.getAs(MimeType.PDF).setName(name + ".pdf");
      const file = folder.createFile(blob);
      return { blob, url: file.getUrl() };
    } finally {
      copy.setTrashed(true);
    }
  }

  getConfigured() {
    const config = this.store.read();
    if (!config.configured) throw new Error("Save your settings before creating invoices.");
    return config;
  }

  dashboard() {
    const config = this.store.read();
    const history = this.store.history();
    const context = config.configured ? this.context(config.settings) : null;
    const existing = context && this.store.properties.getProperty("RENT_INVOICE_" + context.billingKey);
    const automation = readRentAutomation_(this.store);
    const installed = automation.triggerId && ScriptApp.getProjectTriggers().some(trigger =>
      trigger.getUniqueId() === automation.triggerId && trigger.getHandlerFunction() === "sendMonthlyRentInvoice");
    return {
      ...config, history, automation: { enabled: automation.enabled, installed: Boolean(installed) },
      nextInvoice: context ? {
        ...context,
        amount: this.replacements(config.settings, context).TOTAL,
        blocked: Boolean(existing && ["sending", "sent", "uncertain"].includes(JSON.parse(existing).status))
      } : null
    };
  }

  saveSettings(settings, revision) {
    return withRentUserLock_(() => {
      const current = this.store.read();
      if (current.revision !== revision) throw new Error("Settings changed in another window. Reload before saving.");
      const validated = this.store.validate(settings);
      DriveApp.getFileById(validated.templateId);
      DriveApp.getFolderById(validated.outputFolderId);
      this.store.write(validated);
      return this.dashboard();
    });
  }

  preview(revision) {
    return withRentUserLock_(() => {
      const config = this.getConfigured();
      if (config.revision !== revision) throw new Error("Settings changed. Reload before previewing.");
      const context = this.context(config.settings);
      const pdf = this.createPdf(config.settings, context, true);
      return { url: pdf.url, invoiceNumber: context.invoiceNumber, billingPeriod: context.billingPeriod };
    });
  }

  send(billingKey, revision, scheduled = false) {
    return withRentUserLock_(() => {
      const config = this.getConfigured();
      if (config.revision !== revision) throw new Error("Settings changed. Reload before sending.");
      if (scheduled && !isRentScheduleDue_(config.settings, this.store)) return { skipped: true };
      const settings = config.settings;
      const context = this.context(settings);
      if (billingKey !== context.billingKey) throw new Error("Billing month changed. Reload before sending.");
      const key = "RENT_INVOICE_" + context.billingKey;
      const previous = this.store.properties.getProperty(key);
      if (previous && ["sending", "sent", "uncertain"].includes(JSON.parse(previous).status)) {
        if (scheduled) return { skipped: true };
        throw new Error("This period was sent or needs review. Check history and your Sent folder.");
      }
      if (MailApp.getRemainingDailyQuota() < 2) {
        throw new Error("Not enough daily email quota for the tenant invoice and landlord confirmation. Try again after quota resets.");
      }
      const record = {
        ...context, recipient: settings.tenant.email,
        amount: this.replacements(settings, context).TOTAL,
        status: "generating", createdAt: new Date().toISOString(),
        sentAt: null, pdfUrl: "", error: "", warning: ""
      };
      this.store.setJson(key, record);
      let sending = false;
      let committed = false;
      try {
        const pdf = this.createPdf(settings, context);
        record.pdfUrl = pdf.url;
        record.status = "sending";
        this.store.setJson(key, record);
        // Email and persistent state cannot commit atomically: block ambiguous retries.
        sending = true;
        MailApp.sendEmail({
          to: settings.tenant.email,
          subject: "Rent Invoice - " + context.rentPeriod,
          body: "Hello " + settings.tenant.name + ",\n\nPlease find attached your rent invoice for " +
            context.rentPeriod + ".\n\nPayment is due on " + context.dueDate +
            ".\n\nPlease use the bank transfer instructions included in the invoice.\n\nThank you,\n" +
            settings.landlord.name,
          attachments: [pdf.blob], name: settings.landlord.name
        });
        record.status = "sent";
        record.sentAt = new Date().toISOString();
        this.store.setJson(key, record);
        committed = true;
        try {
          this.store.properties.setProperty("RENT_NEXT_NUMBER", String(context.suffix + 1));
          MailApp.sendEmail({
            to: settings.landlord.email, subject: "Rent invoice sent - " + context.billingPeriod,
            body: "Invoice " + context.invoiceNumber + " was sent to " + settings.tenant.email +
              ".\n\nAmount: " + record.amount + "\nPDF: " + record.pdfUrl,
            attachments: [pdf.blob]
          });
        } catch (error) {
          record.warning = "Invoice sent, but sequence update or landlord confirmation failed: " + String(error.message || error);
          console.error(record.warning);
          this.store.setJson(key, record);
        }
      } catch (error) {
        // Confirmation failures must not downgrade an already committed successful send.
        if (committed) throw error;
        record.status = sending ? "uncertain" : "failed";
        record.error = String(error.message || error).slice(0, 1000);
        console.error(error.stack || record.error);
        try {
          this.store.setJson(key, record);
        } catch (storageError) {
          console.error("Could not save invoice failure: " + storageError);
        }
        try {
          MailApp.sendEmail({
            to: settings.landlord.email, subject: "ERROR: Rent invoice - " + context.billingPeriod,
            body: record.status + ": " + record.error + "\n\nCheck invoice history and your Sent folder before retrying."
          });
        } catch (notificationError) {
          console.error("Could not notify landlord: " + notificationError);
        }
        throw error;
      }
      return this.dashboard();
    });
  }
}
