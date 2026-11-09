class RentConfigStore {
  constructor() {
    this.properties = PropertiesService.getUserProperties();
  }

  defaults() {
    return {
      templateId: "", outputFolderId: "",
      tenant: { name: "", address: "", phone: "", email: "" },
      landlord: { name: "", address: "", phone: "", email: "" },
      property: { address: "", amount: 0, fees: 0 },
      payment: {
        accountName: "", bankName: "", accountNumber: "", routingNumber: "",
        routingNumberPaperElectronic: "", routingNumberWires: "", accountType: "", memo: ""
      },
      dueDay: 1, sendDay: 25, sendHour: 9, timezone: "America/New_York",
      currency: "USD", invoices: { prefix: "RENT", suffix: 1 }
    };
  }

  read() {
    const raw = this.properties.getProperty("RENT_CONFIG");
    if (!raw) return { settings: this.defaults(), revision: null, configured: false };
    const saved = JSON.parse(raw);
    if (saved.schemaVersion !== 1 || typeof saved.revision !== "string") {
      throw new Error("Unsupported saved configuration. Contact support before changing data.");
    }
    return {
      settings: this.validate(saved.settings),
      revision: saved.revision,
      configured: true
    };
  }

  validate(input) {
    if (!input || typeof input !== "object") throw new Error("Settings are required.");
    const value = this.defaults();
    const text = (source, key, required = true, max = 500) => {
      if (!source || typeof source[key] !== "string" ||
          source[key].trim().length > max || (required && !source[key].trim())) {
        throw new Error(key + " must be " + (required ? "non-empty text" : "text") + " (max " + max + " characters).");
      }
      return source[key].trim();
    };
    ["templateId", "outputFolderId"].forEach(key => {
      value[key] = text(input, key, true, 200);
      if (!/^[\w-]+$/.test(value[key])) throw new Error(key + " must be a Drive file ID, not a URL.");
    });
    ["tenant", "landlord"].forEach(group => {
      ["name", "address", "phone", "email"].forEach(key => {
        value[group][key] = text(input[group], key, key !== "phone", key === "phone" ? 60 : 500);
      });
      if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(value[group].email)) {
        throw new Error(group + " email must be one valid email address.");
      }
    });
    value.property.address = text(input.property, "address");
    ["amount", "fees"].forEach(key => {
      const number = input.property && input.property[key];
      if (typeof number !== "number" || !Number.isFinite(number) ||
          number < (key === "amount" ? 0.01 : 0) || number > 9999999 ||
          Math.abs(number * 100 - Math.round(number * 100)) > 0.00001) {
        throw new Error(key + " must be a valid amount with at most two decimal places.");
      }
      value.property[key] = number;
    });
    [["dueDay", 1, 31], ["sendDay", 1, 28], ["sendHour", 0, 23]].forEach(([key, min, max]) => {
      if (!Number.isInteger(input[key]) || input[key] < min || input[key] > max) {
        throw new Error(key + " must be an integer from " + min + " to " + max + ".");
      }
      value[key] = input[key];
    });
    value.timezone = text(input, "timezone", true, 100);
    new Intl.DateTimeFormat("en-US", { timeZone: value.timezone });
    value.currency = text(input, "currency", true, 3).toUpperCase();
    if (!/^[A-Z]{3}$/.test(value.currency)) throw new Error("Currency must be a three-letter code.");
    new Intl.NumberFormat("en-US", { style: "currency", currency: value.currency });
    value.invoices.prefix = text(input.invoices, "prefix", true, 40);
    if (!/^[a-zA-Z0-9_-]+$/.test(value.invoices.prefix)) throw new Error("Invoice prefix may only contain letters, digits, underscores and hyphens.");
    if (!input.invoices || !Number.isSafeInteger(input.invoices.suffix) ||
        input.invoices.suffix < 1 || input.invoices.suffix > 999999999) {
      throw new Error("Starting invoice number must be an integer from 1 to 999999999.");
    }
    value.invoices.suffix = input.invoices.suffix;
    // Older saved settings predate payment options; an absent section remains optional.
    const payment = input.payment === undefined ? value.payment : input.payment;
    Object.keys(value.payment).forEach(key => {
      value.payment[key] = text(payment, key, false, key === "memo" ? 300 : 100);
    });
    ["routingNumber", "routingNumberPaperElectronic", "routingNumberWires"].forEach(key => {
      if (value.payment[key] && !/^\d{9}$/.test(value.payment[key])) {
        throw new Error(key + " must contain exactly nine digits when provided.");
      }
    });
    if (!["", "checking", "savings"].includes(value.payment.accountType)) {
      throw new Error("Account type must be checking or savings.");
    }
    return value;
  }

  write(settings) {
    const saved = {
      schemaVersion: 1, settings: this.validate(settings),
      revision: Utilities.getUuid()
    };
    this.setJson("RENT_CONFIG", saved);
    return saved;
  }

  setJson(key, value) {
    const json = JSON.stringify(value);
    if (Utilities.newBlob(json).getBytes().length > 8500) {
      throw new Error("This record exceeds the Apps Script property size limit. Shorten text fields.");
    }
    const existing = this.properties.getProperties();
    existing[key] = json;
    const bytes = Object.entries(existing).reduce((sum, [name, text]) =>
      sum + Utilities.newBlob(name + text).getBytes().length, 0);
    if (bytes > 450000) throw new Error("User storage is nearly full. Export and archive invoice history before continuing.");
    this.properties.setProperty(key, json);
  }

  history() {
    return Object.entries(this.properties.getProperties())
      .filter(([key]) => key.startsWith("RENT_INVOICE_"))
      .map(([, value]) => JSON.parse(value))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

function withRentUserLock_(action) {
  const lock = LockService.getUserLock();
  if (!lock.tryLock(30000)) throw new Error("Another invoice operation is running. Please try again.");
  try {
    return action();
  } finally {
    lock.releaseLock();
  }
}
