/* ==================================================================
   THE COMPRADORES SAMPLE BATCH (#443, agent dashboard Phase 1).

   Builds assets/agent/sample-batch.js from the repo's OWN catalogue
   records: every product, title, photo, price, size list and product
   URL in the batch is copied from one record, never typed. The size on
   each sample order is one of that record's own sizes; the colour is set
   only where the record states it (a Crocs title's " - Black", a Revolve
   URL's "-in-navy"), otherwise it is null and the agent matches the photo.

   What IS invented, and labelled so: the customers (fictional, every
   surname "Prueba"), the three agents, the store-account labels and
   their daily caps, and the "DEMO-" retailer order numbers on the
   history rows. No customer email anywhere.

     node scripts/build-agent-sample.mjs
   ================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { ceilingUsd } from "../assets/agent/agent-core.js";

const ROOT = new URL("../", import.meta.url).pathname;

/* Which records: per store, the first N records in catalogue order that
   pass `ok`. `take` go into today's batch, `past` into the agents'
   history. */
const PICKS = [
  { file: "crocs-catalog.json", store: "crocs", take: 4, past: 1, ok: (r) => / - [A-Z]/.test(r.name) && !/backpack/i.test(r.name) },
  { file: "zumiez-catalog.json", store: "zumiez", take: 4, past: 1 },
  { file: "hottopic-catalog.json", store: "hottopic", take: 4, past: 1 },
  { file: "revolve-catalog.json", store: "revolve", take: 4, past: 1, ok: (r) => r.price < 400 },
  { file: "ae-catalog.json", store: "americaneagle", take: 4, past: 1 },
  { file: "boxlunch-catalog.json", store: "boxlunch", take: 4, past: 1 },
  /* The link-health guard's live case: this record's own stored URL is a
     bare relative path, so the guard sends it to Danny as "Link caído". */
  { file: "beauty-catalog.json", store: "victoriassecret", take: 1, past: 0, ok: (r) => r.url === "/us/vs/beauty-catalog/1128680200", allowBadUrl: true },
];

const ACCOUNTS = [
  { id: "crocs-1", store: "crocs", label: "Crocs · cuenta 1", dailyCap: 3 },
  { id: "crocs-2", store: "crocs", label: "Crocs · cuenta 2", dailyCap: 3 },
  { id: "zumiez-1", store: "zumiez", label: "Zumiez · cuenta 1", dailyCap: 6 },
  { id: "hottopic-1", store: "hottopic", label: "Hot Topic · cuenta 1", dailyCap: 2 },
  { id: "hottopic-2", store: "hottopic", label: "Hot Topic · cuenta 2", dailyCap: 2 },
  /* One account, cap 3, four orders: the fourth is HELD by the cap. */
  { id: "revolve-1", store: "revolve", label: "Revolve · cuenta 1", dailyCap: 3 },
  { id: "americaneagle-1", store: "americaneagle", label: "American Eagle · cuenta 1", dailyCap: 2 },
  { id: "americaneagle-2", store: "americaneagle", label: "American Eagle · cuenta 2", dailyCap: 2 },
  { id: "boxlunch-1", store: "boxlunch", label: "BoxLunch · cuenta 1", dailyCap: 5 },
  { id: "victoriassecret-1", store: "victoriassecret", label: "Victoria's Secret · cuenta 1", dailyCap: 4 },
];

/* A catalogue's own label wins; these cover catalogues that carry none. */
const STORE_LABELS = { crocs: "Crocs", zumiez: "Zumiez", hottopic: "Hot Topic", revolve: "Revolve",
  americaneagle: "American Eagle", boxlunch: "BoxLunch", victoriassecret: "Victoria's Secret" };

const AGENTS = [
  { id: "a1", name: "Rosa", demo: true },
  { id: "a2", name: "Carlos", demo: true },
  { id: "a3", name: "Lucía", demo: true },
];

const CUSTOMERS = [
  "Valeria Prueba Quispe", "Diego Prueba Rojas", "Camila Prueba Torres", "Mateo Prueba Huamán",
  "Daniela Prueba Flores", "Sebastián Prueba Vargas", "Lucía Prueba Mendoza", "Joaquín Prueba Castillo",
  "Andrea Prueba Chávez", "Gabriel Prueba Ramos", "Sofía Prueba Gutiérrez", "Nicolás Prueba Espinoza",
  "Mariana Prueba Salazar", "Adrián Prueba Paredes", "Fernanda Prueba Cárdenas", "Rodrigo Prueba Medina",
  "Ximena Prueba Aguilar", "Thiago Prueba Ríos", "Antonella Prueba Soto", "Leonardo Prueba Navarro",
  "Renata Prueba Campos", "Bruno Prueba Silva", "Isabella Prueba Rivera", "Samuel Prueba Ortiz",
  "Paula Prueba León", "Emilio Prueba Vega", "Alessia Prueba Ponce", "Martín Prueba Cruz",
  "Luciana Prueba Herrera", "Gael Prueba Benítez", "Abril Prueba Romero", "Iker Prueba Delgado",
];

function records(file) {
  const d = JSON.parse(readFileSync(ROOT + file, "utf8"));
  const out = [];
  (function walk(o, path) {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) { o.forEach((x) => walk(x, path)); return; }
    if (o.price != null && (o.name || o.title) && ("url" in o || "link" in o)) { out.push({ rec: o, path }); return; }
    for (const k of Object.keys(o)) walk(o[k], path.concat(k));
  })(d, []);
  return { d, out };
}

const sizesOf = (r) => (Array.isArray(r.availableSizes) && r.availableSizes.length ? r.availableSizes : Array.isArray(r.sizes) ? r.sizes : []);
const imageOf = (r) => r.image || r.thumbnail || (Array.isArray(r.images) && r.images[0]) || null;
/* Colour only where the record states it: Crocs titles end " - Black";
   Revolve product URLs end "-in-navy/dp/...". Everywhere else: null. */
const colourOf = (r, store) => {
  if (store === "crocs") { const m = / - ([^-]+)$/.exec(r.name || ""); return m ? m[1].trim() : null; }
  if (store === "revolve") { const m = /-in-((?:(?!-in-)[a-z-])+)\/dp\//.exec(r.url || ""); return m ? m[1].split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ") : null; }
  return null;
};
const productIdOf = (r) => r.sku || null;

const orders = [], history = [];
let n = 0, h = 0;
for (const p of PICKS) {
  const { d, out } = records(p.file);
  let rows = out.filter(({ rec, path }) => {
    const key = path[0] === "retailers" ? path[1] : (rec.retailer || rec.store);
    const storeOk = key === p.store || (p.store === "americaneagle" && (rec.store === "americaneagle" || key === "americaneagle" || key === "ae"));
    return storeOk && (p.allowBadUrl || /^https:\/\//.test(rec.url || "")) && Number(rec.price) > 0 && imageOf(rec) && !rec.photoHeld && !rec.heldImage
      && sizesOf(rec).length > 0 && (!p.ok || p.ok(rec));
  });
  const seen = new Set();
  rows = rows.filter(({ rec }) => { const t = rec.name || rec.title; if (seen.has(t)) return false; seen.add(t); return true; });
  if (rows.length < p.take + p.past) throw new Error(`${p.file}: only ${rows.length} usable records`);
  const label = (d.retailers && d.retailers[p.store] && d.retailers[p.store].label) || null;
  rows.slice(0, p.take + p.past).forEach(({ rec }, i) => {
    const sizes = sizesOf(rec);
    const size = sizes[Math.floor((sizes.length - 1) / 2)];
    const isPast = i >= p.take;
    const idx = isPast ? h++ : n++;
    const base = {
      store: p.store,
      storeLabel: label || STORE_LABELS[p.store],
      title: rec.name || rec.title,
      brand: rec.brand || null,
      image: imageOf(rec),
      url: rec.url || null,
      priceUsd: Number(rec.price),
      qty: 1,
      sizesOnRecord: sizes,
      selectedSize: size,
      color: colourOf(rec, p.store),
      productId: productIdOf(rec),
      ceilingUsd: ceilingUsd(rec.price, 1),
      source: `${p.file}`,
    };
    base.fallbackSearch = [base.brand && !base.title.toLowerCase().includes(String(base.brand).toLowerCase()) ? base.brand : null, base.title, base.productId].filter(Boolean).join(" ");
    if (!isPast) {
      orders.push({
        orderId: `DEMO-20261030-${String(idx + 1).padStart(3, "0")}`,
        createdAt: `2026-10-30T${String(13 + (idx % 10)).padStart(2, "0")}:${String((idx * 7) % 60).padStart(2, "0")}:00.000Z`,
        customerName: CUSTOMERS[idx % CUSTOMERS.length],
        ...base,
      });
    } else {
      const agent = AGENTS[idx % AGENTS.length];
      const day = idx % 2 ? "2026-10-29" : "2026-10-30";
      history.push({
        orderId: `DEMO-${day.replace(/-/g, "")}-H${String(idx + 1).padStart(2, "0")}`,
        customerName: CUSTOMERS[(CUSTOMERS.length - 1 - idx) % CUSTOMERS.length],
        ...base,
        assignedTo: agent.id,
        status: "comprada",
        boughtAt: `${day}T${String(14 + idx).padStart(2, "0")}:15:00.000Z`,
        retailerOrderNumber: `DEMO-${p.store.slice(0, 3).toUpperCase()}-${String(4100 + idx * 37)}`,
        chargedTotalUsd: Number(rec.price),
      });
    }
  });
}


const batch = { date: "2026-10-31", sample: true, agents: AGENTS, accounts: ACCOUNTS, orders, history };
const banner = `/* GENERATED by scripts/build-agent-sample.mjs -- do not edit by hand.
   SAMPLE DATA for the compradores dashboard (Phase 1). Products, photos,
   prices, sizes and URLs are copied from the catalogue records named in
   each order's "source"; customers and agents are fictional. */\n`;
writeFileSync(ROOT + "assets/agent/sample-batch.js", banner + "export const SAMPLE_BATCH = " + JSON.stringify(batch, null, 1) + ";\n");
console.log(`sample batch: ${orders.length} orders, ${history.length} history rows, ${ACCOUNTS.length} accounts, ${AGENTS.length} agents`);
