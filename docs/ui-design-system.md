# LedgerApp UI design system · FAS 35

## Strategy and boundary

An operational Nordic workspace, not a marketing layout: neutral surfaces, ink
text, teal for the primary action, compact headings and predictable tables.
Financial state is always expressed with text as well as colour. Existing
NestJS, PostgreSQL, Decimal, authorization, version and snapshot contracts remain
authoritative. UI presentation never confers permission or regulatory approval.

Light mode first. Dark mode is deliberately deferred to avoid a second,
unverified accounting/print palette. No theme toggle pretending to work.

## Tokens

`app/globals.css` owns background, surface, muted surface, ink, secondary text,
border, accent, accent-soft, focus, success, warning and danger tokens. Tailwind
theme aliases allow primitives and feature components to use the same vocabulary.
The default typeface is the installed system sans-serif; no font network request.
Spacing follows 4/8 px increments. Controls are 40 px; smaller actions at least
32 px, enlarged on coarse-pointer devices. Panels use an 8 px radius. Shadows
are reserved for floating menus/dialogs. Financial columns use tabular numerals.

| Token                                  | Light value                        | Purpose                                       |
| -------------------------------------- | ---------------------------------- | --------------------------------------------- |
| background / surface / surface-muted   | `#f4f6f7` / `#ffffff` / `#f7f9fa`  | Workspace, panels, secondary surfaces         |
| ink / secondary / muted                | `#172b35` / `#4c626d` / `#566d78`  | Primary, secondary and supplementary text     |
| border                                 | `#dce4e8`                          | Neutral dividers, controls and table frames   |
| accent / accent-hover / accent-soft    | `#14695f` / `#0f514a` / `#e8f3ef`  | Primary action and selection                  |
| focus                                  | `#287fba`                          | 2 px keyboard outline with 3 px offset        |
| success / success-soft                 | `#24644c` / `#edf7f1`              | Successful and posted states, always labelled |
| warning / warning-soft                 | `#80561b` / `#fff7e8`              | Draft/review states, always labelled          |
| danger / danger-soft                   | `#a03932` / `#fff2f0`              | Errors and blocked actions, always labelled   |
| sidebar / sidebar-text / sidebar-muted | `#172b35` / `#dce6eb` / `#afc0c8`  | Navigation surface and hierarchy              |
| radius / sidebar-width                 | `8px` / `248px` (`76px` collapsed) | Panel shape and desktop navigation            |

Typography: 14 px/1.5 body, 13 px table/control text, compact 24–28 px page
headings. Main content is capped at 1600 px, padded 28/32 px on desktop and
20/16 px on mobile. Money inputs in scrolling tables have a 7 rem minimum
width; their explicit selector must take precedence over generic form rules.

## Shared patterns

- `PageHeader`: compact title, context, optional description and primary action.
- `Panel`, `TableFrame`: neutral grouped content, independently scrolling tables.
- `Feedback`, `EmptyState`, `LoadingState`: descriptive text and an appropriate
  next action, accessible live feedback, no fabricated financial content.
- `Badge`/`StatusBadge`: Swedish labels, not unexplained server enums.
- `Dialog`: native modal, focus containment, Escape, focus restoration and scroll
  locking; used for mobile navigation and reusable confirmations.
- Buttons, selects and dropdowns retain the existing shadcn/Radix foundation.

Form labels remain visible. Placeholder text is a hint, not the only label.
Typeahead preserves arrow/Enter/Escape/Tab workflows. No CSS can disable
accounting guards or turn POSTED data into editable data. Draft attachments
remain private and are retained after posting.

## Navigation and responsive behaviour

Sidebar gives stable feature groups. The active item resolves canonical and
`/app` aliases, with New voucher distinct from the list. Desktop navigation can
collapse; mobile navigation is a modal drawer. UI preference storage is local,
not an authorization source. Organization and fiscal year remain visible.

Target widths: 1440, 1024, 768 and 390 px. Content children have `min-width: 0`;
wide data tables scroll in their own frame, never by clipping the whole page.
Report filters wrap. Forms stack. Print removes navigation, filters and actions,
retains real report metadata, repeated table headers and exact amounts.

## Audit coverage before editing

| Surface                         | Existing findings                                                      | Design treatment                                                                |
| ------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Shell/navigation                | oversized blue layout, alias-active mismatch, non-modal mobile overlay | compact context, alias-aware active state, accessible drawer                    |
| Dashboard                       | real data but unstructured status/chart/table                          | KPI hierarchy, labelled state, dense monthly data                               |
| Voucher list/editor/detail      | useful keyboard logic, scattered styling, technical microcopy          | work-oriented header/grid/totals/attachments, preserve version/post protections |
| Accounts                        | permanent empty side column, large table rows                          | full-width list, deliberate editor, dense cells                                 |
| Projects/cost centres/templates | plain forms and loose actions                                          | shared header/panel/table/form conventions                                      |
| SIE/archive                     | genuine preview/private downloads, developer-centric text              | explicit review sections, history and safe download affordances                 |
| IB/carry                        | Decimal-safe, fingerprints, explicit confirmation                      | grouped inputs, exact totals and clear review                                   |
| Fiscal years/members/company    | real permissions, mixed patterns                                       | consistent statuses, confirmation and disabled states                           |
| Five reports/voucher report     | manual year UUID, weak table/print hierarchy                           | named year selector, labelled filters, tabular report surfaces                  |
| Audit                           | append-only data with raw IDs/details                                  | compact readable history; technical IDs under details                           |
| Auth/onboarding/invitation      | mixed green/blue/gradient cards                                        | quiet shared entry/form patterns; no auth semantics change                      |
| Public home                     | separate marketing mock preview and decorative mobile icon             | restrained polish and usable mobile login entry; retain preview labelling       |

## Extension checklist

Use tokens, shared patterns and the existing role checks. Do not introduce a new
API request merely to decorate a screen. Keep cancellation/organization keys.
Test keyboard and small-width behaviour, print and actual error states. Money
must stay exact decimal strings or BigInt cents; never `Number`/`parseFloat`.
