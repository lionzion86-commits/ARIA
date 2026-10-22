# Brief — Checkout data auto-fills the Amex "Instrucciones de Embarque" sheet
Filed 2026-10-22 by Lucifer for Chad. Danny's ask, verbatim intent: "the information that the customer fills out at checkout automatically gets transferred to that spreadsheet."

## Why
Until Amex/Velozzy's API integration exists, every guía goes out as their Excel
template (`amex-instrucciones-de-embarque-template.xlsx`, filed in the Velozzy
goal files; original from Danny 2026-10-22). Hand-typing customer data into it
per shipment is exactly the kind of mechanical work Aria automates. The
checkout fields and the template columns are nearly 1:1.

## Field map (checkout / order record → template column)
| Template column | Source | Notes |
|---|---|---|
| REMITENTE | constant | `ARIA SHOP LLC` |
| CONSIGNATARIO | checkout consignee full name | Full legal name as on DNI (template note 5). Alternate-recipient section feeds this when the buyer ≠ recipient. |
| DESCRIPCION | order line items | Short faithful description per the retailer's invoice. |
| DIRECCION | checkout delivery address | Lima/province address for last-mile. |
| VALOR TOTAL (US$) | sum of the order's TRUE invoice values | Real US invoice amounts only (FOB basis). NEVER the card/checkout price — Aria's margin must not be inferable from any customs document. |
| DOC. IDENTIDAD | checkout DNI / RUC / CE | Collected at checkout, as on the document. |
| NUMERO DE CELULAR | checkout phone | |
| CORREO ELECTRONICO | checkout email | Per consignee. |
| WR | Miami receiving step | Amex issues the warehouse receipt when the box lands; ops assigns WR → consignee at batching. This is the ONE field not known at checkout. |
| OBSERVACIONES | optional | e.g. perfume flag (max 4/order), delivery instructions. |
| GUIA / CAT / PCS | — | Assigned internally by Amex. Leave blank. |

## Build pieces
1. **Checkout capture gap (site) — CHECKOUT ONLY, no other channel:** the
   sheet needs, per consignee, DNI number AND photos of BOTH SIDES of the
   DNI (template note 8 — attached to the instruction email together with
   the invoice PDFs). Checkout must collect: full legal name, DNI number,
   DNI front photo, DNI back photo, delivery address, cell, email — for the
   RECIPIENT (buyer or alternate recipient). Danny's ruling 2026-10-22:
   everything happens at checkout; Aria is a real store, not a WhatsApp
   mom-and-pop operation. WhatsApp is NEVER a data/document collection
   fallback anywhere in this flow. The customer never sees Amex's process
   (standing boundary, same as GTL).
2. **Generator (script):** given a batch (list of orders + their WRs), produce
   the filled .xlsx from the official template, rows in template order,
   REMITENTE pre-filled, Guía/CAT/PCS blank. Reads order records from the
   order ledger — no re-typing anywhere.
3. **Packet assembly:** the instruction email to
   operaciones@amexcourierperu.com carries the filled sheet + invoice PDFs +
   each consignee's DNI photos. Generator emits the attachment list per batch
   so the ops lane (or the send step) can't miss one.
4. **Batching rule stays human-gated:** which orders share a guía follows the
   2 kg-per-ticket minimum (bundle up to 8 orders; light batches wait). The
   generator fills whatever batch ops confirms — it does not decide batches.

## Upload UX — the DNI photo section (Danny, 2026-10-22 12:13 EDT)
The checkout document step is a dedicated upload section, one slot per side
("Foto de tu DNI — frente" / "— reverso"), and each slot offers BOTH:
- **Take a photo** (opens the phone camera), and
- **Upload from the library** (existing photo).
Mountain Test requirements:
- The photo is resized/compressed ON the phone before upload — a raw
  multi-MB camera photo must never crawl up a slow-3G connection.
- Instant preview of what was captured, with a one-tap **Retake/Replace**.
- Upload progress is visible; a failed upload keeps the rest of the
  checkout intact and retries just the photo.
- One line of guidance under each slot: straight-on, all four corners
  visible, no glare.
- Spanish labels throughout; the section works identically for a member
  registering the pack once and a guest uploading per order.

## Key Club — register once (Danny, 2026-10-22 12:13 EDT)
- A Key Club member uploads the DNI pack (number + both-side photos) ONCE;
  it is registered to their account and reused automatically for every
  later order and every generated sheet. Checkout never asks again — the
  customer just confirms the recipient.
- Saved recipients work the same way: an alternate recipient's pack is
  registered once under the member's account and picked from a list.
- Non-members upload per order; saving the pack is a natural Key Club
  benefit ("upload once, never again").
- The pack can be replaced from account settings (DNI renewal); a missing
  or illegible photo flags at fulfillment — never a silent batch block
  (see Acceptance).

## Storage & retention (Danny, 2026-10-22 12:23 EDT)
Danny's constraints: no heavy pages, no hoarding identity photos.
- **Photos never touch the site or any page.** The upload section is a form
  control; the images go to file storage server-side. No shopper's page
  ever loads another customer's photo — page weight is unaffected,
  Mountain Test intact.
- Every photo is compressed on the phone before upload (see Upload UX), so
  each side lands at a few hundred KB, not multi-MB.
- **Guests (non-Key Club): pass-through only.** Their DNI photos are used
  to build the shipment packet for Amex, then AUTO-DELETED 30 days after
  the order is delivered (covers the 14-day claim window and any customs
  question about that guía). A guest who orders again uploads again —
  that friction is precisely the Key Club contrast.
- **Key Club members: stored on the account** — that storage IS the perk.
  The member can view, replace, or delete their pack from account
  settings at any time; if the account closes, the pack is deleted with it.
- Nothing else keeps a copy: the packet email is the transmission, not an
  archive.

## Acceptance
- A test batch (Ale's Barbie order + dummy rows) produces a sheet that
  matches the template column-for-column, values pulled from the order
  record with zero hand-typed fields except WR.
- VALOR cells equal true invoice sums; no checkout price, margin, or
  margin-derived number appears anywhere in the sheet.
- Missing-DNI-photo orders are flagged and cannot enter a batch silently.
