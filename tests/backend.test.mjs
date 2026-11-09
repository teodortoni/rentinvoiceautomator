import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = (await Promise.all(["configs.gs", "invoiceservice.gs", "main.gs", "trigger.gs"]
  .map(file => readFile(file, "utf8")))).join("\n");
const clone = value => JSON.parse(JSON.stringify(value));
const initialSettings = {
  templateId: "template", outputFolderId: "folder",
  tenant: { name: "Example Tenant", email: "tenant@example.com", address: "100 Example Street", phone: "" },
  landlord: { name: "Example Landlord", email: "landlord@example.com", address: "200 Example Avenue", phone: "" },
  property: { address: "100 Example Street, Unit 1", amount: 1500, fees: 25.25 },
  currency: "USD", dueDay: 1, sendDay: 25, sendHour: 9, timezone: "America/New_York",
  invoices: { prefix: "RENT", suffix: 4 }
};
const required = ["TENANT_NAME", "RENT_PERIOD", "DUE_DATE", "TOTAL", "INVOICE_NUMBER"];

function formatDate(date, timezone, pattern) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hourCycle: "h23"
  }).formatToParts(date).map(part => [part.type, part.value]));
  if (pattern === "yyyy-MM") return `${parts.year}-${parts.month}`;
  if (pattern === "d") return String(Number(parts.day));
  if (pattern === "H") return parts.hour;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, month: pattern === "MMMM yyyy" ? "long" : "short", year: "numeric",
    ...(pattern === "MMMM yyyy" ? {} : { day: "numeric" })
  }).format(date);
}

function fixture(options = {}) {
  let user = "alice";
  let now = new Date(options.now || "2026-11-25T15:00:00Z");
  let uuid = 0;
  let writes = 0;
  let releases = 0;
  const stores = new Map();
  const triggers = new Map();
  const emails = [];
  const files = [];
  const logs = [];
  const sections = [];
  const copies = [];
  const fail = { ...options };
  const storeForUser = () => {
    if (!stores.has(user)) stores.set(user, new Map());
    return stores.get(user);
  };
  const properties = () => {
    const store = storeForUser();
    return {
      getProperty: key => store.get(key) ?? null,
      getProperties: () => Object.fromEntries(store),
      setProperty(key, value) {
        writes++;
        if (fail.failWriteAt === writes || (fail.failCounter && key === "RENT_NEXT_NUMBER")) throw new Error("Properties write failed");
        store.set(key, value);
      }
    };
  };
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now.getTime()])); }
  }
  const blob = { setName() { return this; } };
  function section(text) {
    return {
      text,
      findText(pattern) { return new RegExp(pattern).test(this.text) ? {} : null; },
      replaceText(pattern, value) { this.text = this.text.replace(new RegExp(pattern, "g"), () => value); }
    };
  }
  const sandbox = {
    Date: Clock, Intl,
    console: { log: value => logs.push(value), error: value => logs.push(value) },
    PropertiesService: { getUserProperties: properties, getScriptProperties: () => { throw new Error("Shared state is forbidden"); } },
    LockService: { getUserLock: () => ({
      tryLock: () => !fail.lockUnavailable,
      releaseLock: () => { releases++; }
    }) },
    Utilities: {
      formatDate, getUuid: () => "uuid-" + (++uuid),
      newBlob: value => ({ getBytes: () => [...Buffer.from(value, "utf8")] }),
      parseDate: (value, timezone) => {
        const [date] = value.split(" ");
        const offset = new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "longOffset" })
          .formatToParts(new Date(date + "T12:00:00Z")).find(part => part.type === "timeZoneName").value;
        return new Date(date + "T12:00:00" + (offset === "GMT" ? "Z" : offset.slice(3)));
      }
    },
    DriveApp: {
      getFileById() {
        if (fail.accessDenied) throw new Error("Template access denied");
        return { makeCopy() {
          if (fail.generationFailed) throw new Error("Template copy failed");
          const copy = { getId: () => "copy", getAs: () => blob, setTrashed: value => { copy.trashed = value; } };
          copies.push(copy);
          return copy;
        } };
      },
      getFolderById: () => ({
        createFile: () => {
          const file = { getUrl: () => "https://drive.google.com/file/d/example/view" };
          files.push(file);
          return file;
        }
      })
    },
    DocumentApp: {
      openById() {
        const body = section(fail.templateText ?? required.map(token => "{{" + token + "}}").join("\n"));
        const header = section("{{LANDLORD_NAME}}");
        const footer = section("{{INVOICE_NUMBER}}");
        sections.push(body, header, footer);
        const childBody = section("{{PROPERTY_ADDRESS}}");
        const child = { asDocumentTab: () => ({ getBody: () => childBody, getHeader: () => null, getFooter: () => null }), getChildTabs: () => [] };
        sections.push(childBody);
        return {
          getTabs: () => [{
            asDocumentTab: () => ({ getBody: () => body, getHeader: () => header, getFooter: () => footer }),
            getChildTabs: () => [child]
          }],
          saveAndClose() {}
        };
      },
      getActiveDocument: () => ({ getId: () => "current-template", getName: () => "Current template" }),
      getUi: () => ({
        createAddonMenu: () => ({
          addItem() { return this; }, addToUi() {}
        }),
        showModalDialog() {}
      })
    },
    MimeType: { PDF: "application/pdf" },
    MailApp: {
      getRemainingDailyQuota: () => fail.quota ?? 100,
      sendEmail(email) {
        if (email.to === "tenant@example.com" && fail.tenantSendFailed) throw new Error("Gmail send failed");
        if (email.to === "landlord@example.com" && fail.ownerSendFailed) throw new Error("Confirmation failed");
        emails.push({ ...email, user });
      }
    },
    ScriptApp: {
      AuthMode: { FULL: "FULL" }, AuthorizationStatus: { REQUIRED: "REQUIRED" },
      getAuthorizationInfo: () => ({ getAuthorizationStatus: () => fail.reauthorization ? "REQUIRED" : "AUTHORIZED" }),
      getProjectTriggers: () => triggers.get(user) || [],
      deleteTrigger: trigger => triggers.set(user, (triggers.get(user) || []).filter(item => item !== trigger)),
      newTrigger(handler) {
        const owner = user;
        return {
          timeBased() { return this; }, everyHours(value) { assert.equal(value, 1); return this; },
          create() {
            if (fail.triggerFailed) throw new Error("Trigger creation failed");
            const id = "trigger-" + (++uuid);
            const trigger = { getUniqueId: () => id, getHandlerFunction: () => handler };
            triggers.set(owner, [...(triggers.get(owner) || []), trigger]);
            return trigger;
          }
        };
      }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(source + "\nthis.service = () => new RentInvoiceServices();", sandbox);
  const api = sandbox;
  return {
    api, fail, emails, files, logs, sections, copies,
    service: () => api.service(),
    settings: () => clone(initialSettings),
    configure: settings => api.saveRentSettings(settings || clone(initialSettings), api.getRentDashboard().revision),
    get properties() { return storeForUser(); },
    get releases() { return releases; },
    get writes() { return writes; },
    get triggers() { return triggers.get(user) || []; },
    asUser(value) { user = value; },
    setNow(value) { now = new Date(value); },
    send() {
      const state = api.getRentDashboard();
      return api.sendRentInvoice(state.nextInvoice.billingKey, state.revision);
    },
    tick() {
      const state = JSON.parse(storeForUser().get("RENT_AUTOMATION"));
      return api.sendMonthlyRentInvoice({ triggerUid: state.triggerId });
    }
  };
}

test("first run exposes empty onboarding defaults, without private settings or Drive access", () => {
  const f = fixture({ accessDenied: true });
  const state = f.api.getRentDashboard();
  assert.equal(state.configured, false);
  assert.equal(state.settings.tenant.email, "");
  assert.equal(state.nextInvoice, null);
  assert.equal(state.automation.enabled, false);
  assert.throws(() => f.api.previewRentInvoice(null), /Save your settings/);
});

test("settings persist and remain isolated between installed accounts", () => {
  const f = fixture();
  f.configure();
  f.asUser("bob");
  assert.equal(f.api.getRentDashboard().configured, false);
  const bob = f.settings();
  bob.tenant.name = "Bob Tenant";
  f.configure(bob);
  assert.equal(f.api.getRentDashboard().settings.tenant.name, "Bob Tenant");
  f.asUser("alice");
  assert.equal(f.api.getRentDashboard().settings.tenant.name, "Example Tenant");
});

test("settings validation rejects invalid numbers, recipients, timezone, IDs and oversized fields", () => {
  const f = fixture();
  const invalid = [
    { path: ["property", "amount"], value: 0 }, { path: ["property", "fees"], value: -1 },
    { path: ["property", "amount"], value: 1.001 }, { path: ["tenant", "email"], value: "a@b.com,c@d.com" },
    { path: ["dueDay"], value: 32 }, { path: ["sendDay"], value: 29 },
    { path: ["sendHour"], value: 24 }, { path: ["timezone"], value: "Invalid/Zone" },
    { path: ["templateId"], value: "https://docs.google.com/document/d/id" },
    { path: ["invoices", "suffix"], value: 0 }, { path: ["tenant", "name"], value: "x".repeat(501) }
  ];
  for (const { path, value } of invalid) {
    const settings = f.settings();
    const target = path.length === 2 ? settings[path[0]] : settings;
    target[path.at(-1)] = value;
    assert.throws(() => f.configure(settings));
  }
  assert.equal(f.api.getRentDashboard().configured, false);
});

test("concurrent stale settings and stale send/preview requests are rejected", () => {
  const f = fixture();
  const first = f.configure();
  f.configure();
  assert.throws(() => f.api.saveRentSettings(f.settings(), first.revision), /another window/);
  assert.throws(() => f.api.previewRentInvoice(first.revision), /Settings changed/);
  assert.throws(() => f.api.sendRentInvoice(first.nextInvoice.billingKey, first.revision), /Settings changed/);
});

test("inaccessible template prevents saving; current document selection works", () => {
  const f = fixture({ accessDenied: true });
  assert.throws(() => f.configure(), /access denied/);
  assert.equal(f.api.useCurrentRentTemplate().id, "current-template");
});

test("billing dates respect dueDay, year rollover, short months and local timezone boundaries", () => {
  const f = fixture();
  const settings = f.settings();
  settings.dueDay = 31;
  const context = date => f.service().context(settings, new Date(date));
  assert.equal(context("2026-12-25T15:00:00Z").billingKey, "2027-01");
  assert.equal(context("2026-01-25T15:00:00Z").dueDate, "Feb 28, 2026");
  assert.equal(context("2028-01-25T15:00:00Z").dueDate, "Feb 29, 2028");
  assert.equal(context("2026-12-01T01:00:00Z").billingKey, "2026-12");
  assert.equal(context("2026-11-25T15:00:00Z").rentPeriod, "Dec 1, 2026 - Dec 31, 2026");
  settings.timezone = "Pacific/Kiritimati";
  assert.equal(context("2026-11-30T12:00:00Z").billingKey, "2027-01");
});

test("preview replaces body/header/footer/child-tab tokens without sending or advancing sequence", () => {
  const f = fixture();
  const saved = f.configure();
  const result = f.api.previewRentInvoice(saved.revision);
  assert.match(result.url, /drive.google.com/);
  assert.equal(f.emails.length, 0);
  assert.equal(f.api.getRentDashboard().history.length, 0);
  assert.equal(f.properties.has("RENT_NEXT_NUMBER"), false);
  f.sections.forEach(section => assert.doesNotMatch(section.text, /\{\{/));
  assert.equal(f.copies[0].trashed, true);
});

test("missing and unknown placeholders fail before sending, preserving master template cleanup", () => {
  for (const text of ["{{TENANT_NAME}}", required.map(token => "{{" + token + "}}").join("\n") + "{{UNKNOWN}}"]) {
    const f = fixture({ templateText: text });
    f.configure();
    assert.throws(() => f.send(), /placeholder/);
    assert.equal(f.api.getRentDashboard().history[0].status, "failed");
    assert.equal(f.emails.filter(email => email.to === "tenant@example.com").length, 0);
    assert.equal(f.copies[0].trashed, true);
  }
});

test("successful send records history and advances sequence; changing prefix cannot bypass month guard", () => {
  const f = fixture();
  f.configure();
  const sent = f.send();
  assert.equal(sent.history[0].status, "sent");
  assert.equal(sent.history[0].invoiceNumber, "RENT-2026-004");
  assert.equal(sent.history[0].amount, "$1,525.25");
  assert.equal(f.emails.length, 2);
  assert.equal(f.properties.get("RENT_NEXT_NUMBER"), "5");
  assert.throws(() => f.send(), /needs review/);
  const changed = f.settings();
  changed.invoices.prefix = "NEW";
  changed.invoices.suffix = 99;
  f.configure(changed);
  assert.throws(() => f.send(), /needs review/);
  assert.equal(f.emails.length, 2);
});

test("two accounts can independently send and install/pause schedules", () => {
  const f = fixture();
  f.configure(); f.send(); f.api.setRentAutomation(true);
  f.asUser("bob");
  f.configure(); f.send(); f.api.setRentAutomation(true);
  assert.equal(f.triggers.length, 1);
  f.api.setRentAutomation(false);
  f.asUser("alice");
  assert.equal(f.triggers.length, 1);
  assert.equal(f.api.getRentDashboard().automation.enabled, true);
  assert.equal(f.api.getRentDashboard().history.length, 1);
  assert.equal(f.emails.filter(email => email.to === "tenant@example.com").length, 2);
});

test("document failure is retryable; ambiguous mail failure blocks retry", () => {
  const f = fixture({ generationFailed: true });
  f.configure();
  assert.throws(() => f.send(), /Template copy failed/);
  assert.equal(f.api.getRentDashboard().nextInvoice.blocked, false);
  f.fail.generationFailed = false;
  f.fail.tenantSendFailed = true;
  assert.throws(() => f.send(), /Gmail send failed/);
  assert.equal(f.api.getRentDashboard().history[0].status, "uncertain");
  assert.equal(f.api.getRentDashboard().nextInvoice.blocked, true);
});

test("persistence failure before send never sends tenant email; failure after send stays uncertain", () => {
  for (const phase of [2, 3]) {
    const f = fixture();
    f.configure();
    f.fail.failWriteAt = f.writes + phase;
    assert.throws(() => f.send(), /Properties write failed/);
    const state = f.api.getRentDashboard();
    assert.equal(state.history[0].status, phase === 2 ? "failed" : "uncertain");
    assert.equal(f.emails.filter(email => email.to === "tenant@example.com").length, phase === 2 ? 0 : 1);
  }
});

test("landlord notification failure never downgrades a sent invoice", () => {
  const f = fixture({ ownerSendFailed: true });
  f.configure();
  const result = f.send();
  assert.equal(result.history[0].status, "sent");
  assert.match(result.history[0].warning, /Confirmation failed/);
  assert.equal(result.nextInvoice.blocked, true);
});

test("counter write failure cannot reuse a reserved number next month", () => {
  const f = fixture({ failCounter: true });
  f.configure(); f.send();
  f.setNow("2026-12-25T15:00:00Z");
  assert.equal(f.api.getRentDashboard().nextInvoice.invoiceNumber, "RENT-2027-005");
});

test("insufficient quota and locks fail explicitly without sending", () => {
  const f = fixture({ quota: 1 });
  f.configure();
  assert.throws(() => f.send(), /daily email quota/);
  assert.equal(f.files.length, 0);
  assert.equal(f.emails.length, 0);
  f.fail.quota = 100;
  f.fail.lockUnavailable = true;
  assert.throws(() => f.send(), /Another invoice operation/);
});

test("hourly schedule only sends on configured local day/hour, and skips repeated ticks", () => {
  const f = fixture({ now: "2026-11-25T12:00:00Z" });
  f.configure(); f.api.setRentAutomation(true);
  f.tick();
  assert.equal(f.emails.length, 0);
  f.setNow("2026-11-25T15:00:00Z");
  f.tick(); f.tick();
  assert.equal(f.emails.length, 2);
  f.setNow("2026-12-26T15:00:00Z");
  f.tick();
  assert.equal(f.emails.length, 2);
});

test("schedule installation is idempotent and failures persist paused state", () => {
  const f = fixture();
  f.configure();
  f.api.setRentAutomation(true); f.api.setRentAutomation(true);
  assert.equal(f.triggers.length, 1);
  f.fail.triggerFailed = true;
  assert.throws(() => f.api.setRentAutomation(true), /Trigger creation failed/);
  assert.equal(f.api.getRentDashboard().automation.enabled, false);
  assert.equal(f.triggers.length, 0);
});

test("trigger rejects forged/manual execution and stops for missing authorization", () => {
  const f = fixture();
  f.configure(); f.api.setRentAutomation(true);
  assert.throws(() => f.api.sendMonthlyRentInvoice({ triggerUid: "forged" }), /installed add-on trigger/);
  f.fail.reauthorization = true;
  f.tick();
  assert.equal(f.emails.length, 0);
  assert.match(f.logs.join("\n"), /reauthorization/);
});

test("storage guards reject oversize records or total capacity without dropping history", () => {
  const f = fixture();
  f.configure(); f.send();
  const store = f.service().store;
  assert.throws(() => store.setJson("large", { text: "x".repeat(9000) }), /size limit/);
  f.properties.set("unrelated", "x".repeat(450000));
  assert.throws(() => store.setJson("small", {}), /nearly full/);
  assert.equal(f.api.getRentDashboard().history[0].status, "sent");
});

test("export only returns the current user's data and never enables automation", () => {
  const f = fixture();
  f.configure(); f.send();
  assert.equal(f.api.exportRentData().history.length, 1);
  f.asUser("bob");
  assert.equal(f.api.exportRentData().history.length, 0);
  assert.equal(f.api.exportRentData().settings.tenant.email, "");
});
