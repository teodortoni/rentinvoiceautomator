import React from "react";
import { ChevronDown } from "lucide-react";

export function CollapsibleSection({ title, description, icon: Icon, children, open = true }) {
  return <details className="settings-section group" open={open}>
    <summary className="section-summary">
      <span className="flex min-w-0 items-center gap-3">
        <span className="section-icon"><Icon size={20} aria-hidden="true" /></span>
        <span><span className="block text-base font-semibold text-neutral-900">{title}</span>
          <span className="mt-1 block text-xs font-normal leading-5 text-neutral-500">{description}</span></span>
      </span>
      <ChevronDown size={18} aria-hidden="true" className="shrink-0 text-neutral-500 transition-transform group-open:rotate-180" />
    </summary>
    <div className="section-content">{children}</div>
  </details>;
}
