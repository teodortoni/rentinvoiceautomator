import { demoCall } from "./demo.js";

const methods = new Set(["getRentDashboard", "saveRentSettings", "previewRentInvoice",
  "sendRentInvoice", "setRentAutomation", "useCurrentRentTemplate", "exportRentData"]);

export const demoMode = __LOCAL_DEMO__;

export function callServer(method, ...args) {
  if (!methods.has(method)) return Promise.reject(new Error("Unknown operation."));
  if (__LOCAL_DEMO__) return demoCall(method, ...args);
  return new Promise((resolve, reject) => {
    if (!globalThis.google?.script?.run) {
      reject(new Error("Open this dialog through Google Docs, or use npm run dev for a local demo."));
      return;
    }
    const runner = globalThis.google.script.run.withSuccessHandler(resolve)
      .withFailureHandler(error => reject(new Error(error?.message || String(error))));
    runner[method](...args);
  });
}
