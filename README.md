# Rent Invoice Manager - Google Docs Editor add-on

A React settings dialog for one tenant/property per landlord account. Users install the add-on, open Google Docs, and manage configuration without code, local JSON, or spreadsheets.

## Architecture and review changes

- [main.gs](./main.gs): Editor add-on `onOpen`/`onInstall` lifecycle, HTML dialog and RPC functions.
- [configs.gs](./configs.gs): validated per-user configuration and persistence using **User Properties**, never shared Script Properties.
- [invoiceservice.gs](./invoiceservice.gs): billing dates, template replacement, PDF previews, sending and invoice history.
- [trigger.gs](./trigger.gs): opt-in per-user hourly trigger checking the user's local send day and hour.
- [ui/](./ui/): React components for settings, preview/delivery, and history/backup.

The former hard-coded personal configuration is removed from distributable code. It is not automatically imported into other users' accounts. Each landlord completes onboarding and grants their own Google permissions. Existing standalone Script Properties, suffixes and sent markers are **not migrated**: this add-on is a separate installation. Do not enable it alongside your old rent sender. Disable the old trigger first, and do not send the same billing month from both projects.

The review also corrected ignored due-day settings, timezone-sensitive month boundaries, shared invoice numbering, missing concurrency protection, and swallowed delivery failures. Previews now open a private PDF instead of creating Gmail drafts, allowing **send-only MailApp permissions** without mailbox access.

## Local development

```sh
npm install
npm test
npm run build
npm run dev
```

Open http://127.0.0.1:5173. This explicitly marked demo uses fictional, in-memory data. It never calls Google, sends emails, creates PDFs, or installs real triggers. Changes reset on reload. Refresh after source edits. The production build excludes the demo adapter.

The installed clasp toolchain currently reports 8 upstream dependency audit warnings (6 moderate, 2 high). They are development-only dependencies and are not uploaded or bundled into the add-on. `npm audit --omit=dev` reports no production dependency advisories. Review upstream fixes before a release; no forced downgrade or incompatible override is applied.

## Test as a Google Docs add-on

1. Use a separate Apps Script project and test document/folder. Never test with tenant email addresses: use your own email for both tenant and landlord.
2. Enable the Apps Script API at https://script.google.com/home/usersettings.
3. Run `npm run clasp -- login`. Connect your existing test project using an ignored `.clasp.json`:

   ```json
   { "scriptId": "YOUR_SCRIPT_ID", "rootDir": "." }
   ```

4. Run `npm run push`, then `npm run clasp:status`. Only the four `.gs` files, generated `Settings.html` and manifest are uploaded.
5. In Apps Script, choose **Deploy > Test deployments > Editor add-on**, select Google Docs and a private test document, and launch the test. This is an **Editor add-on**, not a web-app deployment and not a CardService Workspace add-on.
6. In Docs use **Extensions > Rent Invoice Manager > Settings & invoices** (test menu naming may differ). Authorize when prompted.
7. Fill settings, select the current Doc as template, enter a private output folder ID, and save. Use your own email for all test sends.
8. Preview the PDF and inspect formatting before sending. Send once, confirm the history record and that a duplicate send is blocked. Enable automation only after account-specific tests.
9. Test with two authorized accounts to verify settings, counters, triggers and history are isolated. Validate actual permissions and trigger behavior in Google; local mocks are not a substitute.

The current-document shortcut avoids editing code; output folder/template IDs can be found in Drive URLs. A Drive Picker or automatic folder creation can be added later for a completely ID-free onboarding flow.

## Templates, delivery and storage

The add-on copies your master Doc and leaves it untouched. Body, tables, headers, footers, and document tabs are processed.

Required tokens:

`{{TENANT_NAME}}`, `{{RENT_PERIOD}}`, `{{DUE_DATE}}`, `{{TOTAL}}`, `{{INVOICE_NUMBER}}`

Optional tokens:

`{{TENANT_ADDRESS}}`, `{{TENANT_PHONE}}`, `{{LANDLORD_NAME}}`, `{{LANDLORD_ADDRESS}}`, `{{LANDLORD_PHONE}}`, `{{PROPERTY_ADDRESS}}`, `{{DATE_ISSUED}}`, `{{RENT_AMOUNT}}`, `{{FEES}}`

Keep tokens contiguous, without splitting them across differently formatted text runs. Missing required or unknown tokens stop generation.

Invoices cover the following month. Due days clamp to that month's last day; send days are limited to 1-28. Money uses the chosen currency and two-decimal inputs. After the first successful send, the per-user sequence advances; changing the starting number does not reset it.

Users explicitly opt in to an hourly trigger (the maximum frequency for Editor add-ons). It sends only on their configured local day, at or after their selected hour, and never catches up on later days. No exact delivery time is guaranteed. Uninstalling or disabling the add-on can stop its triggers. Reauthorization after scope changes may also stop delivery; reopen the add-on and reauthorize.

Duplicate prevention is keyed by billing month, independent of prefix/sequence changes, and protected by a user lock. Email and persistent state are not transactional: `sending` or `uncertain` records block resend until the user checks their Sent folder. There is intentionally no force-resend control. Document-generation errors are retryable. Landlord confirmation failures stay warnings on an already sent record. Successful sending means Google accepted the request, not guaranteed inbox delivery.

Settings, per-month records and sequence counters use User Properties. Each record is capped below 9 KB; writes stop with an explicit error before total storage reaches 500 KB. History is never silently pruned. Export a private JSON backup from the UI; there is no import or automatic archiving in this release. User backups contain personal data and must be kept private. No tenant information is logged intentionally.

## Marketplace release checklist

This is a development foundation, **not an approved Marketplace listing**. Publishing requires steps outside this repository:

1. Associate the Apps Script project with a standard Google Cloud project.
2. Configure OAuth branding, consent, test users, verified domains and the requested scopes.
3. Enable/configure Google Workspace Marketplace SDK and register a **Google Docs Editor add-on** with an immutable script version.
4. Provide a public website, support contact, privacy policy, terms, icons and screenshots.
5. Explain data use, retention/deletion and permission needs; implement and validate a supported data-deletion process before public launch.
6. Complete applicable OAuth verification and Marketplace review. Public distribution is not the same as a private/domain-only listing.
7. Validate install/uninstall, consent-denied, reauthorization, daily email quotas and cross-account isolation with real test accounts.

The manifest uses broad Drive and Docs scopes because users can select existing private templates and output folders by ID. These permissions need review/justification and may require additional verification. MailApp uses `script.send_mail`, not unrestricted Gmail inbox access. Avoid claiming approval or zero verification cost. A future Drive Picker/file-scoped design could reduce scope requirements but must be designed and tested for unattended PDF generation.

Official references:

- [Editor versus Workspace add-ons](https://developers.google.com/workspace/add-ons/concepts/types)
- [Editor add-on trigger restrictions](https://developers.google.com/workspace/add-ons/concepts/editor-triggers)
- [Properties isolation](https://developers.google.com/apps-script/guides/properties)
- [Marketplace publishing](https://developers.google.com/workspace/marketplace/how-to-publish)
