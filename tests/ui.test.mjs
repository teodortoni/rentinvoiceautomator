import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { buildSettings } from "../scripts/build.mjs";

const html = await buildSettings({ demo: true, write: false });

async function waitFor(check) {
  const deadline = Date.now() + 2000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for React.");
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

async function render(t) {
  const dom = new JSDOM(html, {
    runScripts: "dangerously", url: "http://localhost/",
    beforeParse(window) {
      window.structuredClone = structuredClone;
      window.confirm = () => true;
    }
  });
  t.after(() => dom.window.close());
  await waitFor(() => dom.window.document.querySelector("#tenant-name"));
  const document = dom.window.document;
  const button = name => {
    const value = [...document.querySelectorAll("button")].find(node => node.textContent === name);
    assert.ok(value, "Missing button: " + name);
    return value;
  };
  const input = (id, value) => {
    const node = document.getElementById(id);
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set.call(node, value);
    node.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  };
  return { dom, document, button, input };
}

test("React renders component sections and makes local demo limitations explicit", async t => {
  const f = await render(t);
  assert.match(f.document.body.textContent, /LOCAL DEMO/);
  assert.match(f.document.body.textContent, /Your settings/);
  assert.match(f.document.body.textContent, /Review & delivery/);
  assert.match(f.document.body.textContent, /Invoice history/);
  assert.equal(f.document.querySelector("#tenant-email").value, "tenant@example.com");
});

test("editing blocks send/scheduling until save, and numeric settings are handled", async t => {
  const f = await render(t);
  f.input("property-amount", "2100.25");
  await waitFor(() => f.button("Send invoice now").disabled);
  assert.equal(f.button("Enable monthly automation").disabled, true);
  f.document.querySelector("form").dispatchEvent(new f.dom.window.Event("submit", { bubbles: true, cancelable: true }));
  await waitFor(() => f.document.querySelector(".amount").textContent === "$2,100.25");
  assert.match(f.document.querySelector(".amount").textContent, /2,100.25/);
  assert.equal(f.button("Send invoice now").disabled, false);
});

test("discard restores saved settings and current-document shortcut does not edit code", async t => {
  const f = await render(t);
  f.input("tenant-name", "Changed");
  await waitFor(() => !f.button("Discard changes").disabled);
  f.button("Discard changes").click();
  await waitFor(() => f.document.querySelector("#tenant-name").value === "Example Tenant");
  f.button("Use the current Google Doc as template").click();
  await waitFor(() => !f.button("Save settings").disabled);
  assert.equal(f.document.querySelector("#templateId").value, "example-template");
});

test("preview does not create history or email and describes demo behavior honestly", async t => {
  const f = await render(t);
  f.button("Preview PDF (no email)").click();
  await waitFor(() => f.document.body.textContent.includes("Demo preview only"));
  assert.match(f.document.body.textContent, /No invoices sent yet/);
});

test("send confirmation can cancel, successful demo send displays history and blocks repeat", async t => {
  const f = await render(t);
  f.dom.window.confirm = () => false;
  f.button("Send invoice now").click();
  assert.equal(f.document.querySelector("tbody"), null);
  f.dom.window.confirm = () => true;
  f.button("Send invoice now").click();
  await waitFor(() => f.document.querySelector("tbody"));
  assert.match(f.document.querySelector("tbody").textContent, /sent/);
  assert.equal(f.button("Send invoice now").disabled, true);
  assert.match(f.document.body.textContent, /No email was sent/);
});

test("automation controls toggle the local simulation", async t => {
  const f = await render(t);
  f.button("Enable monthly automation").click();
  await waitFor(() => [...f.document.querySelectorAll("button")].some(node => node.textContent === "Pause automation"));
  f.button("Pause automation").click();
  await waitFor(() => f.document.body.textContent.includes("Automation paused."));
});

test("production build contains no local demo implementation and reports missing Google bridge", async t => {
  const production = await buildSettings({ write: false });
  assert.doesNotMatch(production, /example-template|Example Tenant|demo billing month/);
  const dom = new JSDOM(production, { runScripts: "dangerously" });
  t.after(() => dom.window.close());
  await waitFor(() => dom.window.document.querySelector('[role="alert"]'));
  assert.match(dom.window.document.querySelector('[role="alert"]').textContent, /Open this dialog through Google Docs/);
  assert.doesNotMatch(production, /@tailwind|@apply/);
  assert.match(production, /button\.primary/);
  assert.match(production, /rgb\(218 36 72/);
});

test("all five settings sections are independently collapsible and invalid hidden fields reopen", async t => {
  const f = await render(t);
  const sections = [...f.document.querySelectorAll(".settings-section")];
  assert.equal(sections.length, 5);
  assert.deepEqual(sections.map(section => section.querySelector(".section-summary .text-base").textContent),
    ["Tenant", "Landlord", "Invoice", "Template", "Payment options"]);
  const tenant = sections[0];
  tenant.open = false;
  assert.equal(tenant.open, false);
  assert.equal(sections[1].open, true);
  f.input("tenant-name", "");
  f.document.getElementById("tenant-name").dispatchEvent(new f.dom.window.Event("invalid", { cancelable: true }));
  assert.equal(tenant.open, true);
});

test("bank details stay string-valued, account type is selectable, and account number is masked by default", async t => {
  const f = await render(t);
  f.input("payment-accountNumber", "000012345678");
  f.input("payment-routingNumber", "001234567");
  f.input("payment-bankName", "Example Bank");
  const select = f.document.getElementById("payment-accountType");
  select.value = "savings";
  select.dispatchEvent(new f.dom.window.Event("change", { bubbles: true }));
  await waitFor(() => !f.button("Save settings").disabled);
  assert.equal(f.document.getElementById("payment-accountNumber").type, "password");
  const checkbox = f.document.querySelector('input[type="checkbox"]');
  checkbox.click();
  await waitFor(() => f.document.getElementById("payment-accountNumber").type === "text");
  f.document.querySelector("form").dispatchEvent(new f.dom.window.Event("submit", { bubbles: true, cancelable: true }));
  await waitFor(() => f.document.body.textContent.includes("Settings saved privately"));
  await waitFor(() => f.button("Save settings").disabled);
  assert.equal(f.document.getElementById("payment-accountNumber").value, "000012345678");
  assert.equal(f.document.getElementById("payment-accountNumber").type, "password");
  assert.equal(f.document.getElementById("payment-routingNumber").value, "001234567");
  assert.equal(f.document.getElementById("payment-accountType").value, "savings");
  assert.match(f.document.body.textContent, /BANK_ROUTING_NUMBER_PAPER_ELECTRONIC/);
  assert.match(f.document.body.textContent, /PAYMENT_MEMO/);
});
