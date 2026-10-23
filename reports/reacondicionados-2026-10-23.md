# Reacondicionados — the department, the rail everywhere, the disclosure (#443 c.6373874319)

## One rule

`/condition.js` (browser) and `scripts/lib/condition.js` (its ESM re-export) hold the one condition rule:

- **Reacondicionado:** refurbished, renewed, remanufactured, reconditioned, certified pre-owned
- **Usado:** pre-owned
- **Caja abierta:** open box

The rule reads the store's own title. It never upgrades a condition.

Never sold as used (item 28):

- clothing and footwear (Ley 28514)
- auto parts
- phones tied to a carrier (only unlocked phones are sold)

**Grade:** the store's words, verbatim, such as "Target Certified Refurbished", "Manufacturer Refurbished", "Grade A" or "[Damaged Package]". When the title has no grade the page says "La tienda no indica un grado."

## Where it lands

| Surface | What shows |
|---|---|
| `departamento.html?dept=reacondicionados` | The department, with rails by product type |
| Every other department with 3+ such products | A "Reacondicionados" rail, second after Ofertas (Juguetes 36, Mama's Fashion 6) |
| Department cards | A label at the start of the brand row (`k` on the card). It sits outside the photo box, so a failed photo can't remove it. |
| Homepage | A "Reacondicionados" pill, third after Mama's Fashion. Its shelf is the department head's own cards. |
| Product page | "Estado: … Grado según la tienda: … No es un producto nuevo." above the price |
| Cart line and checkout | The condition label on the line |
| Order record | `orders-create` sets `line.condition` from the title on the server, never from the browser |
| Confirmation email | `[Caja abierta]` after the title |
| Mi cuenta | The condition in the order line's meta |

## Stock today: 51 products

- Walmart toys: 23 used, 20 open-box
- Walmart Bebé strollers: 6 open-box
- B&H Photo: 1 refurbished
- one more (Walmart beauty, used)

The refurbished electronics are **not** here yet:

- **Target:** 104 refurbished JBL, Beats and Anker products, but Target is on the off-sale list (`/off-sale.js`), so they stay out.
- **Walmart:** Lucifer's density pull (`walmart-density-catalog.json`) is not committed yet. When it lands, its `condition` field (#483) and these titles fill the department with no further change.

## Screenshots, 390px (`reports/shots-reacondicionados/`)

Product photos and soles show as placeholders here because the sandbox can't reach the retailers' image hosts or the FX function. The preview has both.
