/* ============================================================
   COMBO DEALS — "Pair it with" / "Combínalo y ahorra" (2026-09-27).

   GENERIC, DATA-DRIVEN UPSELL. This file is the whole catalogue of
   bundle offers; the renderer + cart logic in index.html is fully
   generic over it. To plug a new department in (beauty: mask +
   cleanser, fitness: …), append entries — zero code changes.

   Schema per entry:
     id        — unique string, e.g. "combo-beauty-001"
     label     — short Spanish display label, e.g. "El dúo perfecto"
     department— loose grouping tag (used for analytics/filtering only)
     savingUsd — GENUINE USD reduction off the real sum of the items'
                 card prices. Funded from margin, stated to the shopper
                 ("Ahorras $X"), and applied as a real discount line in
                 the cart — never display-only.
     items     — 2+ real products: { retailer, title } must EXACTLY
                 match the catalogue record (retailer key + title).
                 The module resolves live price/image at render time and
                 FAILS CLOSED (hides) if any item is missing or priceless.

   Honesty rules (enforced by tests):
     - savingUsd > 0 and savingUsd < sum of the items' card prices
     - the bundle price shown is exactly sum − savingUsd
     - the cart discount line reduces only the goods total; the
       dutiable (import-tax) base is untouched

   Book combos below were generated 2026-09-27 from books-catalog.json:
   same retailer + same genre + nearest luxury tier, 10% bundle saving
   (min $5). Deterministic; regenerate with /tmp/gen_combos.py.

   SHARED MODULE. This file is an ES module: index.html loads it through
   a small module bridge that re-publishes COMBO_DEALS on window for the
   classic inline script, and netlify/functions/_combo-validate.js
   imports it directly — so the combos the shopper saw are exactly the
   combos the server validates the discount lines against.
   ============================================================ */
export const COMBO_DEALS = [
 {
  "id": "combo-books-assouline-001",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 372,
  "items": [
   {
    "retailer": "assouline",
    "title": "Basquiat: The World of Jean-Michel"
   },
   {
    "retailer": "assouline",
    "title": "Gold: The Impossible Collection"
   }
  ]
 },
 {
  "id": "combo-books-assouline-002",
  "department": "books",
  "label": "Arquitectura en dos tomos",
  "genre": "Arquitectura",
  "savingUsd": 372,
  "items": [
   {
    "retailer": "assouline",
    "title": "Al'Madinah: The City of the Prophet"
   },
   {
    "retailer": "assouline",
    "title": "Makkah: The Holy City of Islam"
   }
  ]
 },
 {
  "id": "combo-books-assouline-003",
  "department": "books",
  "label": "El par perfecto",
  "genre": "Colección",
  "savingUsd": 372,
  "items": [
   {
    "retailer": "assouline",
    "title": "Rolex: The Impossible Collection (2nd Edition)"
   },
   {
    "retailer": "assouline",
    "title": "Golf: The Impossible Collection"
   }
  ]
 },
 {
  "id": "combo-books-assouline-004",
  "department": "books",
  "label": "De la mesa a la cocina",
  "genre": "Gastronomía",
  "savingUsd": 372,
  "items": [
   {
    "retailer": "assouline",
    "title": "The Impossible Collection of Wine"
   },
   {
    "retailer": "assouline",
    "title": "The Impossible Collection of Champagne"
   }
  ]
 },
 {
  "id": "combo-books-assouline-005",
  "department": "books",
  "label": "Velocidad en dos tomos",
  "genre": "Motores",
  "savingUsd": 372,
  "items": [
   {
    "retailer": "assouline",
    "title": "Formula 1: The Impossible Collection (2nd Edition)"
   },
   {
    "retailer": "assouline",
    "title": "Riva Aquarama"
   }
  ]
 },
 {
  "id": "combo-books-assouline-006",
  "department": "books",
  "label": "El par perfecto",
  "genre": "Colección",
  "savingUsd": 372,
  "items": [
   {
    "retailer": "assouline",
    "title": "Football: The Impossible Collection"
   },
   {
    "retailer": "assouline",
    "title": "Rolex: The Impossible Collection (2nd Edition)"
   }
  ]
 },
 {
  "id": "combo-books-assouline-007",
  "department": "books",
  "label": "El par perfecto",
  "genre": "Colección",
  "savingUsd": 372,
  "items": [
   {
    "retailer": "assouline",
    "title": "Patek Philippe: The Impossible Collection"
   },
   {
    "retailer": "assouline",
    "title": "Rolex: The Impossible Collection (2nd Edition)"
   }
  ]
 },
 {
  "id": "combo-books-assouline-008",
  "department": "books",
  "label": "Cine en tu mesa de centro",
  "genre": "Cine",
  "savingUsd": 265,
  "items": [
   {
    "retailer": "assouline",
    "title": "America's Sweethearts: Dallas Cowboys Cheerleaders (Ultimate)"
   },
   {
    "retailer": "assouline",
    "title": "James Bond Trilogy with Slipcase"
   }
  ]
 },
 {
  "id": "combo-books-assouline-009",
  "department": "books",
  "label": "De la mesa a la cocina",
  "genre": "Gastronomía",
  "savingUsd": 372,
  "items": [
   {
    "retailer": "assouline",
    "title": "The Impossible Collection of Cigars"
   },
   {
    "retailer": "assouline",
    "title": "The Impossible Collection of Wine"
   }
  ]
 },
 {
  "id": "combo-books-assouline-010",
  "department": "books",
  "label": "Velocidad en dos tomos",
  "genre": "Motores",
  "savingUsd": 372,
  "items": [
   {
    "retailer": "assouline",
    "title": "Feadship"
   },
   {
    "retailer": "assouline",
    "title": "Formula 1: The Impossible Collection (2nd Edition)"
   }
  ]
 },
 {
  "id": "combo-books-assouline-011",
  "department": "books",
  "label": "Velocidad en dos tomos",
  "genre": "Motores",
  "savingUsd": 372,
  "items": [
   {
    "retailer": "assouline",
    "title": "Beken of Cowes: the Art of Sailing (2nd Edition)"
   },
   {
    "retailer": "assouline",
    "title": "Formula 1: The Impossible Collection (2nd Edition)"
   }
  ]
 },
 {
  "id": "combo-books-assouline-012",
  "department": "books",
  "label": "Velocidad en dos tomos",
  "genre": "Motores",
  "savingUsd": 372,
  "items": [
   {
    "retailer": "assouline",
    "title": "The Impossible Collection of Motorcycles (2nd Edition)"
   },
   {
    "retailer": "assouline",
    "title": "Formula 1: The Impossible Collection (2nd Edition)"
   }
  ]
 },
 {
  "id": "combo-books-assouline-013",
  "department": "books",
  "label": "Velocidad en dos tomos",
  "genre": "Motores",
  "savingUsd": 372,
  "items": [
   {
    "retailer": "assouline",
    "title": "The Impossible Collection of Cars"
   },
   {
    "retailer": "assouline",
    "title": "Formula 1: The Impossible Collection (2nd Edition)"
   }
  ]
 },
 {
  "id": "combo-books-assouline-014",
  "department": "books",
  "label": "El dúo de moda",
  "genre": "Moda",
  "savingUsd": 318,
  "items": [
   {
    "retailer": "assouline",
    "title": "The Impossible Collection of Fashion"
   },
   {
    "retailer": "assouline",
    "title": "Chanel: The Impossible Collection"
   }
  ]
 },
 {
  "id": "combo-books-assouline-015",
  "department": "books",
  "label": "El dúo de moda",
  "genre": "Moda",
  "savingUsd": 318,
  "items": [
   {
    "retailer": "assouline",
    "title": "Louis Vuitton: Virgil Abloh (Ultimate Edition)"
   },
   {
    "retailer": "assouline",
    "title": "The Impossible Collection of Fashion"
   }
  ]
 },
 {
  "id": "combo-books-assouline-016",
  "department": "books",
  "label": "El dúo de moda",
  "genre": "Moda",
  "savingUsd": 318,
  "items": [
   {
    "retailer": "assouline",
    "title": "Yves Saint-Laurent: The Impossible Collection"
   },
   {
    "retailer": "assouline",
    "title": "The Impossible Collection of Fashion"
   }
  ]
 },
 {
  "id": "combo-books-assouline-017",
  "department": "books",
  "label": "El dúo de moda",
  "genre": "Moda",
  "savingUsd": 318,
  "items": [
   {
    "retailer": "assouline",
    "title": "Costumes of Saudi Arabia, A Heritage of Fashion"
   },
   {
    "retailer": "assouline",
    "title": "The Impossible Collection of Fashion"
   }
  ]
 },
 {
  "id": "combo-books-assouline-018",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 318,
  "items": [
   {
    "retailer": "assouline",
    "title": "Venice: La Serenissima"
   },
   {
    "retailer": "assouline",
    "title": "Andy Warhol: The Impossible Collection"
   }
  ]
 },
 {
  "id": "combo-books-assouline-019",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 318,
  "items": [
   {
    "retailer": "assouline",
    "title": "Pablo Picasso: The Impossible Collection"
   },
   {
    "retailer": "assouline",
    "title": "Venice: La Serenissima"
   }
  ]
 },
 {
  "id": "combo-books-assouline-020",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 318,
  "items": [
   {
    "retailer": "assouline",
    "title": "The Impossible Collection of Art (2nd Edition)"
   },
   {
    "retailer": "assouline",
    "title": "Venice: La Serenissima"
   }
  ]
 },
 {
  "id": "combo-books-assouline-021",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 318,
  "items": [
   {
    "retailer": "assouline",
    "title": "Roy Lichtenstein: The Impossible Collection"
   },
   {
    "retailer": "assouline",
    "title": "Venice: La Serenissima"
   }
  ]
 },
 {
  "id": "combo-books-assouline-022",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 318,
  "items": [
   {
    "retailer": "assouline",
    "title": "Versailles: From Louis XIV to Jeff Koons"
   },
   {
    "retailer": "assouline",
    "title": "Venice: La Serenissima"
   }
  ]
 },
 {
  "id": "combo-books-assouline-023",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 318,
  "items": [
   {
    "retailer": "assouline",
    "title": "Lalanne: A World of Poetry"
   },
   {
    "retailer": "assouline",
    "title": "Venice: La Serenissima"
   }
  ]
 },
 {
  "id": "combo-books-assouline-024",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 318,
  "items": [
   {
    "retailer": "assouline",
    "title": "African Art: The Impossible Collection"
   },
   {
    "retailer": "assouline",
    "title": "Venice: La Serenissima"
   }
  ]
 },
 {
  "id": "combo-books-assouline-025",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 318,
  "items": [
   {
    "retailer": "assouline",
    "title": "Salvador Dalí: The Impossible Collection"
   },
   {
    "retailer": "assouline",
    "title": "Venice: La Serenissima"
   }
  ]
 },
 {
  "id": "combo-books-assouline-026",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 318,
  "items": [
   {
    "retailer": "assouline",
    "title": "Noor Riyadh: A New Visual Culture (Ultimate)"
   },
   {
    "retailer": "assouline",
    "title": "Venice: La Serenissima"
   }
  ]
 },
 {
  "id": "combo-books-assouline-027",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 318,
  "items": [
   {
    "retailer": "assouline",
    "title": "Iran Modern"
   },
   {
    "retailer": "assouline",
    "title": "Venice: La Serenissima"
   }
  ]
 },
 {
  "id": "combo-books-assouline-028",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 318,
  "items": [
   {
    "retailer": "assouline",
    "title": "Chinese Art: The Impossible Collection"
   },
   {
    "retailer": "assouline",
    "title": "Venice: La Serenissima"
   }
  ]
 },
 {
  "id": "combo-books-assouline-029",
  "department": "books",
  "label": "Arquitectura en dos tomos",
  "genre": "Arquitectura",
  "savingUsd": 318,
  "items": [
   {
    "retailer": "assouline",
    "title": "Santiago Calatrava"
   },
   {
    "retailer": "assouline",
    "title": "Oscar Niemeyer"
   }
  ]
 },
 {
  "id": "combo-books-assouline-030",
  "department": "books",
  "label": "Arquitectura en dos tomos",
  "genre": "Arquitectura",
  "savingUsd": 318,
  "items": [
   {
    "retailer": "assouline",
    "title": "AlUla (2nd Edition)"
   },
   {
    "retailer": "assouline",
    "title": "Santiago Calatrava"
   }
  ]
 },
 {
  "id": "combo-books-assouline-031",
  "department": "books",
  "label": "Velocidad en dos tomos",
  "genre": "Motores",
  "savingUsd": 345,
  "items": [
   {
    "retailer": "assouline",
    "title": "Yachts: The Impossible Collection"
   },
   {
    "retailer": "assouline",
    "title": "Formula 1: The Impossible Collection (2nd Edition)"
   }
  ]
 },
 {
  "id": "combo-books-assouline-032",
  "department": "books",
  "label": "De la mesa a la cocina",
  "genre": "Gastronomía",
  "savingUsd": 265,
  "items": [
   {
    "retailer": "assouline",
    "title": "Wine & Travel Complete Gift Set"
   },
   {
    "retailer": "assouline",
    "title": "The Impossible Collection of Wine"
   }
  ]
 },
 {
  "id": "combo-books-assouline-033",
  "department": "books",
  "label": "Cine en tu mesa de centro",
  "genre": "Cine",
  "savingUsd": 145,
  "items": [
   {
    "retailer": "assouline",
    "title": "James Bond Trilogy with Slipcase"
   },
   {
    "retailer": "assouline",
    "title": "Paris by Paris and New York by New York Gift Set"
   }
  ]
 },
 {
  "id": "combo-books-assouline-034",
  "department": "books",
  "label": "Arquitectura en dos tomos",
  "genre": "Arquitectura",
  "savingUsd": 97,
  "items": [
   {
    "retailer": "assouline",
    "title": "Style Series Gift Set"
   },
   {
    "retailer": "assouline",
    "title": "Jean-Michel Frank"
   }
  ]
 },
 {
  "id": "combo-books-assouline-035",
  "department": "books",
  "label": "El dúo de moda",
  "genre": "Moda",
  "savingUsd": 85,
  "items": [
   {
    "retailer": "assouline",
    "title": "Swans & Bals: Gift Set"
   },
   {
    "retailer": "assouline",
    "title": "From Louis to Vuitton"
   }
  ]
 },
 {
  "id": "combo-books-assouline-036",
  "department": "books",
  "label": "Cine en tu mesa de centro",
  "genre": "Cine",
  "savingUsd": 114,
  "items": [
   {
    "retailer": "assouline",
    "title": "James Bond Trilogy"
   },
   {
    "retailer": "assouline",
    "title": "Paris by Paris and New York by New York Gift Set"
   }
  ]
 },
 {
  "id": "combo-books-assouline-037",
  "department": "books",
  "label": "Dos destinos, una repisa",
  "genre": "Viajes",
  "savingUsd": 80,
  "items": [
   {
    "retailer": "assouline",
    "title": "Wine & Travel Europe Gift Set"
   },
   {
    "retailer": "assouline",
    "title": "Morocco Kingdom of Light  - Candle and Book Gift Set"
   }
  ]
 },
 {
  "id": "combo-books-assouline-038",
  "department": "books",
  "label": "El dúo de moda",
  "genre": "Moda",
  "savingUsd": 66,
  "items": [
   {
    "retailer": "assouline",
    "title": "From Louis to Vuitton"
   },
   {
    "retailer": "assouline",
    "title": "Valentino Rosso"
   }
  ]
 },
 {
  "id": "combo-books-assouline-039",
  "department": "books",
  "label": "El dúo de moda",
  "genre": "Moda",
  "savingUsd": 66,
  "items": [
   {
    "retailer": "assouline",
    "title": "Franca: Chaos & Creation"
   },
   {
    "retailer": "assouline",
    "title": "From Louis to Vuitton"
   }
  ]
 },
 {
  "id": "combo-books-assouline-040",
  "department": "books",
  "label": "El dúo de moda",
  "genre": "Moda",
  "savingUsd": 66,
  "items": [
   {
    "retailer": "assouline",
    "title": "Gucci: The Art of Silk"
   },
   {
    "retailer": "assouline",
    "title": "From Louis to Vuitton"
   }
  ]
 },
 {
  "id": "combo-books-assouline-041",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 66,
  "items": [
   {
    "retailer": "assouline",
    "title": "Francis Bacon by Francis Giacobetti"
   },
   {
    "retailer": "assouline",
    "title": "Hajj and the Arts of Pilgrimage"
   }
  ]
 },
 {
  "id": "combo-books-assouline-042",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 66,
  "items": [
   {
    "retailer": "assouline",
    "title": "Golden Opulence: 500 Years of Luxuriant Style"
   },
   {
    "retailer": "assouline",
    "title": "Francis Bacon by Francis Giacobetti"
   }
  ]
 },
 {
  "id": "combo-books-assouline-043",
  "department": "books",
  "label": "Arquitectura en dos tomos",
  "genre": "Arquitectura",
  "savingUsd": 66,
  "items": [
   {
    "retailer": "assouline",
    "title": "Jean-Michel Frank"
   },
   {
    "retailer": "assouline",
    "title": "Moroccan Decorative Arts"
   }
  ]
 },
 {
  "id": "combo-books-assouline-044",
  "department": "books",
  "label": "Cine en tu mesa de centro",
  "genre": "Cine",
  "savingUsd": 66,
  "items": [
   {
    "retailer": "assouline",
    "title": "Paris by Paris"
   },
   {
    "retailer": "assouline",
    "title": "New York by New York"
   }
  ]
 },
 {
  "id": "combo-books-assouline-045",
  "department": "books",
  "label": "Cine en tu mesa de centro",
  "genre": "Cine",
  "savingUsd": 66,
  "items": [
   {
    "retailer": "assouline",
    "title": "Cecil Beaton: The Art of the Scrapbook"
   },
   {
    "retailer": "assouline",
    "title": "Paris by Paris"
   }
  ]
 },
 {
  "id": "combo-books-assouline-046",
  "department": "books",
  "label": "El dúo de moda",
  "genre": "Moda",
  "savingUsd": 65,
  "items": [
   {
    "retailer": "assouline",
    "title": "Fashionphile: The Book of Iconic Bags & Shoes Gift Set"
   },
   {
    "retailer": "assouline",
    "title": "From Louis to Vuitton"
   }
  ]
 },
 {
  "id": "combo-books-assouline-047",
  "department": "books",
  "label": "Arquitectura en dos tomos",
  "genre": "Arquitectura",
  "savingUsd": 65,
  "items": [
   {
    "retailer": "assouline",
    "title": "Chic Series New York and Paris Gift Set"
   },
   {
    "retailer": "assouline",
    "title": "Jean-Michel Frank"
   }
  ]
 },
 {
  "id": "combo-books-assouline-048",
  "department": "books",
  "label": "El par perfecto",
  "genre": "Colección",
  "savingUsd": 48,
  "items": [
   {
    "retailer": "assouline",
    "title": "Chic Dogs & Chic Cats Gift Set"
   },
   {
    "retailer": "assouline",
    "title": "Air Jordan (Classic)"
   }
  ]
 },
 {
  "id": "combo-books-assouline-049",
  "department": "books",
  "label": "Dos destinos, una repisa",
  "genre": "Viajes",
  "savingUsd": 64,
  "items": [
   {
    "retailer": "assouline",
    "title": "Morocco Kingdom of Light  - Candle and Book Gift Set"
   },
   {
    "retailer": "assouline",
    "title": "Wine & Travel France and Italy Gift Set"
   }
  ]
 },
 {
  "id": "combo-books-assouline-050",
  "department": "books",
  "label": "Cine en tu mesa de centro",
  "genre": "Cine",
  "savingUsd": 64,
  "items": [
   {
    "retailer": "assouline",
    "title": "Mother and Child & Father and Child Gift Set"
   },
   {
    "retailer": "assouline",
    "title": "James Bond Destinations and Style Gift Set"
   }
  ]
 },
 {
  "id": "combo-books-assouline-051",
  "department": "books",
  "label": "De la mesa a la cocina",
  "genre": "Gastronomía",
  "savingUsd": 64,
  "items": [
   {
    "retailer": "assouline",
    "title": "Wine & Travel Americas Gift Set"
   },
   {
    "retailer": "assouline",
    "title": "Saudi Coffee and Dates Gift Set"
   }
  ]
 },
 {
  "id": "combo-books-assouline-052",
  "department": "books",
  "label": "Arquitectura en dos tomos",
  "genre": "Arquitectura",
  "savingUsd": 52,
  "items": [
   {
    "retailer": "assouline",
    "title": "Terence Disdale: My Art of Yacht Design"
   },
   {
    "retailer": "assouline",
    "title": "Diriyah Culture: At-Turaif"
   }
  ]
 },
 {
  "id": "combo-books-assouline-053",
  "department": "books",
  "label": "El dúo de moda",
  "genre": "Moda",
  "savingUsd": 52,
  "items": [
   {
    "retailer": "assouline",
    "title": "Dior by Raf Simons"
   },
   {
    "retailer": "assouline",
    "title": "Swans: Legends of the Jet Society"
   }
  ]
 },
 {
  "id": "combo-books-assouline-054",
  "department": "books",
  "label": "El dúo de moda",
  "genre": "Moda",
  "savingUsd": 52,
  "items": [
   {
    "retailer": "assouline",
    "title": "Bals: Legendary Costume Balls of the Twentieth Century"
   },
   {
    "retailer": "assouline",
    "title": "Dior by Raf Simons"
   }
  ]
 },
 {
  "id": "combo-books-assouline-055",
  "department": "books",
  "label": "El dúo de moda",
  "genre": "Moda",
  "savingUsd": 52,
  "items": [
   {
    "retailer": "assouline",
    "title": "Dior by Christian Dior"
   },
   {
    "retailer": "assouline",
    "title": "Dior by Raf Simons"
   }
  ]
 },
 {
  "id": "combo-books-assouline-056",
  "department": "books",
  "label": "El dúo de moda",
  "genre": "Moda",
  "savingUsd": 52,
  "items": [
   {
    "retailer": "assouline",
    "title": "Estée Lauder: A Beautiful Life"
   },
   {
    "retailer": "assouline",
    "title": "Dior by Raf Simons"
   }
  ]
 },
 {
  "id": "combo-books-assouline-057",
  "department": "books",
  "label": "El dúo de moda",
  "genre": "Moda",
  "savingUsd": 52,
  "items": [
   {
    "retailer": "assouline",
    "title": "Burberry"
   },
   {
    "retailer": "assouline",
    "title": "Dior by Raf Simons"
   }
  ]
 },
 {
  "id": "combo-books-assouline-058",
  "department": "books",
  "label": "El dúo de moda",
  "genre": "Moda",
  "savingUsd": 52,
  "items": [
   {
    "retailer": "assouline",
    "title": "Dior By Raf Simons (French Version)"
   },
   {
    "retailer": "assouline",
    "title": "Dior by Raf Simons"
   }
  ]
 },
 {
  "id": "combo-books-assouline-059",
  "department": "books",
  "label": "El dúo de moda",
  "genre": "Moda",
  "savingUsd": 52,
  "items": [
   {
    "retailer": "assouline",
    "title": "Dior by Marc Bohan"
   },
   {
    "retailer": "assouline",
    "title": "Dior by Raf Simons"
   }
  ]
 },
 {
  "id": "combo-books-assouline-060",
  "department": "books",
  "label": "El dúo de moda",
  "genre": "Moda",
  "savingUsd": 52,
  "items": [
   {
    "retailer": "assouline",
    "title": "Frida Kahlo: Fashion as the Art of Being"
   },
   {
    "retailer": "assouline",
    "title": "Dior by Raf Simons"
   }
  ]
 },
 {
  "id": "combo-books-assouline-061",
  "department": "books",
  "label": "El dúo de moda",
  "genre": "Moda",
  "savingUsd": 52,
  "items": [
   {
    "retailer": "assouline",
    "title": "Dior by John Galliano"
   },
   {
    "retailer": "assouline",
    "title": "Dior by Raf Simons"
   }
  ]
 },
 {
  "id": "combo-books-assouline-062",
  "department": "books",
  "label": "El dúo de moda",
  "genre": "Moda",
  "savingUsd": 52,
  "items": [
   {
    "retailer": "assouline",
    "title": "Dior by Gianfranco Ferré"
   },
   {
    "retailer": "assouline",
    "title": "Dior by Raf Simons"
   }
  ]
 },
 {
  "id": "combo-books-assouline-063",
  "department": "books",
  "label": "El dúo de moda",
  "genre": "Moda",
  "savingUsd": 52,
  "items": [
   {
    "retailer": "assouline",
    "title": "Moynat"
   },
   {
    "retailer": "assouline",
    "title": "Dior by Raf Simons"
   }
  ]
 },
 {
  "id": "combo-books-assouline-064",
  "department": "books",
  "label": "El dúo de moda",
  "genre": "Moda",
  "savingUsd": 52,
  "items": [
   {
    "retailer": "assouline",
    "title": "Dior by Yves Saint Laurent"
   },
   {
    "retailer": "assouline",
    "title": "Dior by Raf Simons"
   }
  ]
 },
 {
  "id": "combo-books-assouline-065",
  "department": "books",
  "label": "El dúo de moda",
  "genre": "Moda",
  "savingUsd": 52,
  "items": [
   {
    "retailer": "assouline",
    "title": "Brioni: Tailoring Legends"
   },
   {
    "retailer": "assouline",
    "title": "Dior by Raf Simons"
   }
  ]
 },
 {
  "id": "combo-books-assouline-066",
  "department": "books",
  "label": "Arquitectura en dos tomos",
  "genre": "Arquitectura",
  "savingUsd": 52,
  "items": [
   {
    "retailer": "assouline",
    "title": "Diriyah Culture: At-Turaif"
   },
   {
    "retailer": "assouline",
    "title": "Diriyah Culture: Doors"
   }
  ]
 },
 {
  "id": "combo-books-assouline-067",
  "department": "books",
  "label": "Arquitectura en dos tomos",
  "genre": "Arquitectura",
  "savingUsd": 52,
  "items": [
   {
    "retailer": "assouline",
    "title": "The Heart of the Desert: Transforming Global Healthcare"
   },
   {
    "retailer": "assouline",
    "title": "Diriyah Culture: At-Turaif"
   }
  ]
 },
 {
  "id": "combo-books-assouline-068",
  "department": "books",
  "label": "Arquitectura en dos tomos",
  "genre": "Arquitectura",
  "savingUsd": 52,
  "items": [
   {
    "retailer": "assouline",
    "title": "Catalogue Raisonné du Mobilier: Jeanneret Chandigarh"
   },
   {
    "retailer": "assouline",
    "title": "Diriyah Culture: At-Turaif"
   }
  ]
 },
 {
  "id": "combo-books-assouline-069",
  "department": "books",
  "label": "El dúo de moda",
  "genre": "Moda",
  "savingUsd": 52,
  "items": [
   {
    "retailer": "assouline",
    "title": "Cartier Panthère"
   },
   {
    "retailer": "assouline",
    "title": "Dior by Raf Simons"
   }
  ]
 },
 {
  "id": "combo-books-assouline-070",
  "department": "books",
  "label": "De la mesa a la cocina",
  "genre": "Gastronomía",
  "savingUsd": 52,
  "items": [
   {
    "retailer": "assouline",
    "title": "Le Creuset: A Century of Colorful Cookware"
   },
   {
    "retailer": "assouline",
    "title": "Valentino: At the Emperor's Table"
   }
  ]
 },
 {
  "id": "combo-books-assouline-071",
  "department": "books",
  "label": "Cine en tu mesa de centro",
  "genre": "Cine",
  "savingUsd": 52,
  "items": [
   {
    "retailer": "assouline",
    "title": "The French Riviera in the 1920s"
   },
   {
    "retailer": "assouline",
    "title": "Stranger Things"
   }
  ]
 },
 {
  "id": "combo-books-assouline-072",
  "department": "books",
  "label": "El dúo de moda",
  "genre": "Moda",
  "savingUsd": 52,
  "items": [
   {
    "retailer": "assouline",
    "title": "Jewels of the Renaissance"
   },
   {
    "retailer": "assouline",
    "title": "Dior by Raf Simons"
   }
  ]
 },
 {
  "id": "combo-books-assouline-073",
  "department": "books",
  "label": "Velocidad en dos tomos",
  "genre": "Motores",
  "savingUsd": 52,
  "items": [
   {
    "retailer": "assouline",
    "title": "The Art of Flying"
   },
   {
    "retailer": "assouline",
    "title": "Burgess"
   }
  ]
 },
 {
  "id": "combo-books-assouline-074",
  "department": "books",
  "label": "Dos destinos, una repisa",
  "genre": "Viajes",
  "savingUsd": 58,
  "items": [
   {
    "retailer": "assouline",
    "title": "Geneva: At the Heart of the World"
   },
   {
    "retailer": "assouline",
    "title": "Morocco Kingdom of Light  - Candle and Book Gift Set"
   }
  ]
 },
 {
  "id": "combo-books-assouline-075",
  "department": "books",
  "label": "Cine en tu mesa de centro",
  "genre": "Cine",
  "savingUsd": 52,
  "items": [
   {
    "retailer": "assouline",
    "title": "Undisputed: Usyk vs. Fury (Legend)"
   },
   {
    "retailer": "assouline",
    "title": "The French Riviera in the 1920s"
   }
  ]
 },
 {
  "id": "combo-books-assouline-076",
  "department": "books",
  "label": "Cine en tu mesa de centro",
  "genre": "Cine",
  "savingUsd": 52,
  "items": [
   {
    "retailer": "assouline",
    "title": "Gypset Trilogy"
   },
   {
    "retailer": "assouline",
    "title": "The French Riviera in the 1920s"
   }
  ]
 },
 {
  "id": "combo-books-assouline-077",
  "department": "books",
  "label": "El dúo pop",
  "genre": "Cultura Pop",
  "savingUsd": 38,
  "items": [
   {
    "retailer": "assouline",
    "title": "Tuscany Marvel - Candle and Book Gift Set"
   },
   {
    "retailer": "assouline",
    "title": "Tuscany Marvel"
   }
  ]
 },
 {
  "id": "combo-books-assouline-078",
  "department": "books",
  "label": "Arquitectura en dos tomos",
  "genre": "Arquitectura",
  "savingUsd": 49,
  "items": [
   {
    "retailer": "assouline",
    "title": "Tiffany & Co.: The Landmark"
   },
   {
    "retailer": "assouline",
    "title": "Diriyah Culture: At-Turaif"
   }
  ]
 },
 {
  "id": "combo-books-assouline-079",
  "department": "books",
  "label": "El dúo de moda",
  "genre": "Moda",
  "savingUsd": 41,
  "items": [
   {
    "retailer": "assouline",
    "title": "Carita: 11 FBG Saint Honoré Paris"
   },
   {
    "retailer": "assouline",
    "title": "Radical Renaissance 60"
   }
  ]
 },
 {
  "id": "combo-books-assouline-080",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 41,
  "items": [
   {
    "retailer": "assouline",
    "title": "Uzbekistan: Masterpieces Of the Silk Road"
   },
   {
    "retailer": "assouline",
    "title": "Self Portraits: From 1800 to the Present"
   }
  ]
 },
 {
  "id": "combo-books-assouline-081",
  "department": "books",
  "label": "Cine en tu mesa de centro",
  "genre": "Cine",
  "savingUsd": 47,
  "items": [
   {
    "retailer": "assouline",
    "title": "The Piano Lesson"
   },
   {
    "retailer": "assouline",
    "title": "The French Riviera in the 1920s"
   }
  ]
 },
 {
  "id": "combo-books-assouline-082",
  "department": "books",
  "label": "El dúo de moda",
  "genre": "Moda",
  "savingUsd": 37,
  "items": [
   {
    "retailer": "assouline",
    "title": "Louis Vuitton: Virgil Abloh (Classic Cartoon Cover)"
   },
   {
    "retailer": "assouline",
    "title": "Louis Vuitton: Virgil Abloh (Classic Balloon Cover)"
   }
  ]
 },
 {
  "id": "combo-books-assouline-083",
  "department": "books",
  "label": "El dúo de moda",
  "genre": "Moda",
  "savingUsd": 37,
  "items": [
   {
    "retailer": "assouline",
    "title": "Louis Vuitton Manufactures"
   },
   {
    "retailer": "assouline",
    "title": "Louis Vuitton: Virgil Abloh (Classic Cartoon Cover)"
   }
  ]
 },
 {
  "id": "combo-books-assouline-084",
  "department": "books",
  "label": "El par perfecto",
  "genre": "Colección",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Air Jordan (Classic)"
   },
   {
    "retailer": "assouline",
    "title": "Federer (Classic)"
   }
  ]
 },
 {
  "id": "combo-books-assouline-085",
  "department": "books",
  "label": "El dúo de moda",
  "genre": "Moda",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Fashionphile: The Book of Iconic Shoes"
   },
   {
    "retailer": "assouline",
    "title": "Very Bergdorf"
   }
  ]
 },
 {
  "id": "combo-books-assouline-086",
  "department": "books",
  "label": "El dúo de moda",
  "genre": "Moda",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Kiehl's Since 1851"
   },
   {
    "retailer": "assouline",
    "title": "Fashionphile: The Book of Iconic Shoes"
   }
  ]
 },
 {
  "id": "combo-books-assouline-087",
  "department": "books",
  "label": "El dúo de moda",
  "genre": "Moda",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Fashionphile: The Book of Iconic Bags"
   },
   {
    "retailer": "assouline",
    "title": "Fashionphile: The Book of Iconic Shoes"
   }
  ]
 },
 {
  "id": "combo-books-assouline-088",
  "department": "books",
  "label": "El dúo de moda",
  "genre": "Moda",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Fifth Avenue: 200 Years of Stories and Legends"
   },
   {
    "retailer": "assouline",
    "title": "Fashionphile: The Book of Iconic Shoes"
   }
  ]
 },
 {
  "id": "combo-books-assouline-089",
  "department": "books",
  "label": "El dúo de moda",
  "genre": "Moda",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Chanel: The Legend of an Icon"
   },
   {
    "retailer": "assouline",
    "title": "Fashionphile: The Book of Iconic Shoes"
   }
  ]
 },
 {
  "id": "combo-books-assouline-090",
  "department": "books",
  "label": "El dúo de moda",
  "genre": "Moda",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Jim Thompson: Beyond Silk, Beyond Thailand"
   },
   {
    "retailer": "assouline",
    "title": "Fashionphile: The Book of Iconic Shoes"
   }
  ]
 },
 {
  "id": "combo-books-assouline-091",
  "department": "books",
  "label": "El dúo de moda",
  "genre": "Moda",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "James Bond Style"
   },
   {
    "retailer": "assouline",
    "title": "Fashionphile: The Book of Iconic Shoes"
   }
  ]
 },
 {
  "id": "combo-books-assouline-092",
  "department": "books",
  "label": "El dúo de moda",
  "genre": "Moda",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Emily in Paris: The Fashion Guide"
   },
   {
    "retailer": "assouline",
    "title": "Fashionphile: The Book of Iconic Shoes"
   }
  ]
 },
 {
  "id": "combo-books-assouline-093",
  "department": "books",
  "label": "El dúo de moda",
  "genre": "Moda",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Moscot: New York City, Since 1915"
   },
   {
    "retailer": "assouline",
    "title": "Fashionphile: The Book of Iconic Shoes"
   }
  ]
 },
 {
  "id": "combo-books-assouline-094",
  "department": "books",
  "label": "El dúo de moda",
  "genre": "Moda",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Guerlain: Visionary Since 1828"
   },
   {
    "retailer": "assouline",
    "title": "Fashionphile: The Book of Iconic Shoes"
   }
  ]
 },
 {
  "id": "combo-books-assouline-095",
  "department": "books",
  "label": "El dúo de moda",
  "genre": "Moda",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Uzbekistan Silk & Gold: The Magnificent Art of Costume"
   },
   {
    "retailer": "assouline",
    "title": "Fashionphile: The Book of Iconic Shoes"
   }
  ]
 },
 {
  "id": "combo-books-assouline-096",
  "department": "books",
  "label": "El dúo de moda",
  "genre": "Moda",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Guerlain: An Imperial Icon"
   },
   {
    "retailer": "assouline",
    "title": "Fashionphile: The Book of Iconic Shoes"
   }
  ]
 },
 {
  "id": "combo-books-assouline-097",
  "department": "books",
  "label": "El dúo de moda",
  "genre": "Moda",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Santoni Meraviglia"
   },
   {
    "retailer": "assouline",
    "title": "Fashionphile: The Book of Iconic Shoes"
   }
  ]
 },
 {
  "id": "combo-books-assouline-098",
  "department": "books",
  "label": "El dúo de moda",
  "genre": "Moda",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Seventy: Renzo Rosso"
   },
   {
    "retailer": "assouline",
    "title": "Fashionphile: The Book of Iconic Shoes"
   }
  ]
 },
 {
  "id": "combo-books-assouline-099",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Uzbekistan: The Hidden Collection"
   },
   {
    "retailer": "assouline",
    "title": "Street Art Icons: The Story of Wynwood Walls"
   }
  ]
 },
 {
  "id": "combo-books-assouline-100",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Bahrain Crafts"
   },
   {
    "retailer": "assouline",
    "title": "Uzbekistan: The Hidden Collection"
   }
  ]
 },
 {
  "id": "combo-books-assouline-101",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Living with Chamberlain, Art in Residence"
   },
   {
    "retailer": "assouline",
    "title": "Uzbekistan: The Hidden Collection"
   }
  ]
 },
 {
  "id": "combo-books-assouline-102",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Sorolla: A Vision of Spain"
   },
   {
    "retailer": "assouline",
    "title": "Uzbekistan: The Hidden Collection"
   }
  ]
 },
 {
  "id": "combo-books-assouline-103",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Noor Riyadh: A New Visual Culture (Classic)"
   },
   {
    "retailer": "assouline",
    "title": "Uzbekistan: The Hidden Collection"
   }
  ]
 },
 {
  "id": "combo-books-assouline-104",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Uzbekistan: Russian Avant-Garde"
   },
   {
    "retailer": "assouline",
    "title": "Uzbekistan: The Hidden Collection"
   }
  ]
 },
 {
  "id": "combo-books-assouline-105",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Art House"
   },
   {
    "retailer": "assouline",
    "title": "Uzbekistan: The Hidden Collection"
   }
  ]
 },
 {
  "id": "combo-books-assouline-106",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Batima Zaurbekova: Weaving the Soul of Kazakhstan"
   },
   {
    "retailer": "assouline",
    "title": "Uzbekistan: The Hidden Collection"
   }
  ]
 },
 {
  "id": "combo-books-assouline-107",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Naïve My Love: Ukrainian Folk Art of the 20th Century"
   },
   {
    "retailer": "assouline",
    "title": "Uzbekistan: The Hidden Collection"
   }
  ]
 },
 {
  "id": "combo-books-assouline-108",
  "department": "books",
  "label": "Arquitectura en dos tomos",
  "genre": "Arquitectura",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Michele Bönan: Signature Details"
   },
   {
    "retailer": "assouline",
    "title": "Maximalism by Sig Bergamin"
   }
  ]
 },
 {
  "id": "combo-books-assouline-109",
  "department": "books",
  "label": "Arquitectura en dos tomos",
  "genre": "Arquitectura",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Eclectic by Sig Bergamin"
   },
   {
    "retailer": "assouline",
    "title": "Michele Bönan: Signature Details"
   }
  ]
 },
 {
  "id": "combo-books-assouline-110",
  "department": "books",
  "label": "Arquitectura en dos tomos",
  "genre": "Arquitectura",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "18th Century Style"
   },
   {
    "retailer": "assouline",
    "title": "Michele Bönan: Signature Details"
   }
  ]
 },
 {
  "id": "combo-books-assouline-111",
  "department": "books",
  "label": "Arquitectura en dos tomos",
  "genre": "Arquitectura",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Art Deco Style"
   },
   {
    "retailer": "assouline",
    "title": "Michele Bönan: Signature Details"
   }
  ]
 },
 {
  "id": "combo-books-assouline-112",
  "department": "books",
  "label": "Arquitectura en dos tomos",
  "genre": "Arquitectura",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Bauhaus Style"
   },
   {
    "retailer": "assouline",
    "title": "Michele Bönan: Signature Details"
   }
  ]
 },
 {
  "id": "combo-books-assouline-113",
  "department": "books",
  "label": "Arquitectura en dos tomos",
  "genre": "Arquitectura",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Italian Chic"
   },
   {
    "retailer": "assouline",
    "title": "Michele Bönan: Signature Details"
   }
  ]
 },
 {
  "id": "combo-books-assouline-114",
  "department": "books",
  "label": "Arquitectura en dos tomos",
  "genre": "Arquitectura",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "London Chic"
   },
   {
    "retailer": "assouline",
    "title": "Michele Bönan: Signature Details"
   }
  ]
 },
 {
  "id": "combo-books-assouline-115",
  "department": "books",
  "label": "Arquitectura en dos tomos",
  "genre": "Arquitectura",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Milan Chic"
   },
   {
    "retailer": "assouline",
    "title": "Michele Bönan: Signature Details"
   }
  ]
 },
 {
  "id": "combo-books-assouline-116",
  "department": "books",
  "label": "Arquitectura en dos tomos",
  "genre": "Arquitectura",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "New York Chic"
   },
   {
    "retailer": "assouline",
    "title": "Michele Bönan: Signature Details"
   }
  ]
 },
 {
  "id": "combo-books-assouline-117",
  "department": "books",
  "label": "Arquitectura en dos tomos",
  "genre": "Arquitectura",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Paris Chic"
   },
   {
    "retailer": "assouline",
    "title": "Michele Bönan: Signature Details"
   }
  ]
 },
 {
  "id": "combo-books-assouline-118",
  "department": "books",
  "label": "Arquitectura en dos tomos",
  "genre": "Arquitectura",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Pop Art Style"
   },
   {
    "retailer": "assouline",
    "title": "Michele Bönan: Signature Details"
   }
  ]
 },
 {
  "id": "combo-books-assouline-119",
  "department": "books",
  "label": "Arquitectura en dos tomos",
  "genre": "Arquitectura",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Sharjah: The Capital of Culture"
   },
   {
    "retailer": "assouline",
    "title": "Michele Bönan: Signature Details"
   }
  ]
 },
 {
  "id": "combo-books-assouline-120",
  "department": "books",
  "label": "Arquitectura en dos tomos",
  "genre": "Arquitectura",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "St. Catherine's Monastery: Behind Sacred Doors"
   },
   {
    "retailer": "assouline",
    "title": "Michele Bönan: Signature Details"
   }
  ]
 },
 {
  "id": "combo-books-assouline-121",
  "department": "books",
  "label": "Arquitectura en dos tomos",
  "genre": "Arquitectura",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "The Living Room by the Design Leadership Network"
   },
   {
    "retailer": "assouline",
    "title": "Michele Bönan: Signature Details"
   }
  ]
 },
 {
  "id": "combo-books-assouline-122",
  "department": "books",
  "label": "Arquitectura en dos tomos",
  "genre": "Arquitectura",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Tokyo Chic"
   },
   {
    "retailer": "assouline",
    "title": "Michele Bönan: Signature Details"
   }
  ]
 },
 {
  "id": "combo-books-assouline-123",
  "department": "books",
  "label": "Arquitectura en dos tomos",
  "genre": "Arquitectura",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Ken Fulk: The Movie in my Mind"
   },
   {
    "retailer": "assouline",
    "title": "Michele Bönan: Signature Details"
   }
  ]
 },
 {
  "id": "combo-books-assouline-124",
  "department": "books",
  "label": "Arquitectura en dos tomos",
  "genre": "Arquitectura",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Uzbekistan Living Treasures: Celebration of Craftsmanship"
   },
   {
    "retailer": "assouline",
    "title": "Michele Bönan: Signature Details"
   }
  ]
 },
 {
  "id": "combo-books-assouline-125",
  "department": "books",
  "label": "Arquitectura en dos tomos",
  "genre": "Arquitectura",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Venetian Chic"
   },
   {
    "retailer": "assouline",
    "title": "Michele Bönan: Signature Details"
   }
  ]
 },
 {
  "id": "combo-books-assouline-126",
  "department": "books",
  "label": "Arquitectura en dos tomos",
  "genre": "Arquitectura",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Yves Saint Laurent at Home"
   },
   {
    "retailer": "assouline",
    "title": "Michele Bönan: Signature Details"
   }
  ]
 },
 {
  "id": "combo-books-assouline-127",
  "department": "books",
  "label": "Arquitectura en dos tomos",
  "genre": "Arquitectura",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Relaxed Luxury"
   },
   {
    "retailer": "assouline",
    "title": "Michele Bönan: Signature Details"
   }
  ]
 },
 {
  "id": "combo-books-assouline-128",
  "department": "books",
  "label": "Arquitectura en dos tomos",
  "genre": "Arquitectura",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Achille"
   },
   {
    "retailer": "assouline",
    "title": "Michele Bönan: Signature Details"
   }
  ]
 },
 {
  "id": "combo-books-assouline-129",
  "department": "books",
  "label": "Arquitectura en dos tomos",
  "genre": "Arquitectura",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Art Life by Sig Bergamin"
   },
   {
    "retailer": "assouline",
    "title": "Michele Bönan: Signature Details"
   }
  ]
 },
 {
  "id": "combo-books-assouline-130",
  "department": "books",
  "label": "Arquitectura en dos tomos",
  "genre": "Arquitectura",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "AlUla Old Town: An Oasis of Heritage"
   },
   {
    "retailer": "assouline",
    "title": "Michele Bönan: Signature Details"
   }
  ]
 },
 {
  "id": "combo-books-assouline-131",
  "department": "books",
  "label": "Arquitectura en dos tomos",
  "genre": "Arquitectura",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Mleiha: Ancient Treasures of the UAE"
   },
   {
    "retailer": "assouline",
    "title": "Michele Bönan: Signature Details"
   }
  ]
 },
 {
  "id": "combo-books-assouline-132",
  "department": "books",
  "label": "Arquitectura en dos tomos",
  "genre": "Arquitectura",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "ALIPH: Heritage Reborn"
   },
   {
    "retailer": "assouline",
    "title": "Michele Bönan: Signature Details"
   }
  ]
 },
 {
  "id": "combo-books-assouline-133",
  "department": "books",
  "label": "El par perfecto",
  "genre": "Colección",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Federer (Classic)"
   },
   {
    "retailer": "assouline",
    "title": "Chic Dogs"
   }
  ]
 },
 {
  "id": "combo-books-assouline-134",
  "department": "books",
  "label": "Cine en tu mesa de centro",
  "genre": "Cine",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "James Bond Destinations"
   },
   {
    "retailer": "assouline",
    "title": "Barbie"
   }
  ]
 },
 {
  "id": "combo-books-assouline-135",
  "department": "books",
  "label": "El par perfecto",
  "genre": "Colección",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Watches: A Guide by Hodinkee"
   },
   {
    "retailer": "assouline",
    "title": "Federer (Classic)"
   }
  ]
 },
 {
  "id": "combo-books-assouline-136",
  "department": "books",
  "label": "Cine en tu mesa de centro",
  "genre": "Cine",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Mother and Child"
   },
   {
    "retailer": "assouline",
    "title": "James Bond Destinations"
   }
  ]
 },
 {
  "id": "combo-books-assouline-137",
  "department": "books",
  "label": "Dos destinos, una repisa",
  "genre": "Viajes",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "African Adventures: The Greatest Safari on Earth"
   },
   {
    "retailer": "assouline",
    "title": "The Connaught"
   }
  ]
 },
 {
  "id": "combo-books-assouline-138",
  "department": "books",
  "label": "El par perfecto",
  "genre": "Colección",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Chic Stays"
   },
   {
    "retailer": "assouline",
    "title": "Federer (Classic)"
   }
  ]
 },
 {
  "id": "combo-books-assouline-139",
  "department": "books",
  "label": "Arquitectura en dos tomos",
  "genre": "Arquitectura",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Travel by Design"
   },
   {
    "retailer": "assouline",
    "title": "Michele Bönan: Signature Details"
   }
  ]
 },
 {
  "id": "combo-books-assouline-140",
  "department": "books",
  "label": "Velocidad en dos tomos",
  "genre": "Motores",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "The Carlyle"
   },
   {
    "retailer": "assouline",
    "title": "Vespa"
   }
  ]
 },
 {
  "id": "combo-books-assouline-141",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Flowers: Art & Bouquets"
   },
   {
    "retailer": "assouline",
    "title": "Uzbekistan: The Hidden Collection"
   }
  ]
 },
 {
  "id": "combo-books-assouline-142",
  "department": "books",
  "label": "De la mesa a la cocina",
  "genre": "Gastronomía",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Veuve Clicquot"
   },
   {
    "retailer": "assouline",
    "title": "Wine & Travel Italy"
   }
  ]
 },
 {
  "id": "combo-books-assouline-143",
  "department": "books",
  "label": "Cine en tu mesa de centro",
  "genre": "Cine",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "James Bond Cars"
   },
   {
    "retailer": "assouline",
    "title": "James Bond Destinations"
   }
  ]
 },
 {
  "id": "combo-books-assouline-144",
  "department": "books",
  "label": "El par perfecto",
  "genre": "Colección",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Cheval Blanc"
   },
   {
    "retailer": "assouline",
    "title": "Federer (Classic)"
   }
  ]
 },
 {
  "id": "combo-books-assouline-145",
  "department": "books",
  "label": "Cine en tu mesa de centro",
  "genre": "Cine",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "America: The Imagination of a Nation"
   },
   {
    "retailer": "assouline",
    "title": "James Bond Destinations"
   }
  ]
 },
 {
  "id": "combo-books-assouline-146",
  "department": "books",
  "label": "El par perfecto",
  "genre": "Colección",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Passalacqua: A Love Letter to Lake Como"
   },
   {
    "retailer": "assouline",
    "title": "Federer (Classic)"
   }
  ]
 },
 {
  "id": "combo-books-assouline-147",
  "department": "books",
  "label": "De la mesa a la cocina",
  "genre": "Gastronomía",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "The Art of Tequila: Spirit of Mexico"
   },
   {
    "retailer": "assouline",
    "title": "Veuve Clicquot"
   }
  ]
 },
 {
  "id": "combo-books-assouline-148",
  "department": "books",
  "label": "Dos destinos, una repisa",
  "genre": "Viajes",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "La Mamounia Marrakech"
   },
   {
    "retailer": "assouline",
    "title": "African Adventures: The Greatest Safari on Earth"
   }
  ]
 },
 {
  "id": "combo-books-assouline-149",
  "department": "books",
  "label": "Dos destinos, una repisa",
  "genre": "Viajes",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Morocco: Kingdom of Light"
   },
   {
    "retailer": "assouline",
    "title": "African Adventures: The Greatest Safari on Earth"
   }
  ]
 },
 {
  "id": "combo-books-assouline-150",
  "department": "books",
  "label": "Dos destinos, una repisa",
  "genre": "Viajes",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Morocco: Kingdom of Golf"
   },
   {
    "retailer": "assouline",
    "title": "African Adventures: The Greatest Safari on Earth"
   }
  ]
 },
 {
  "id": "combo-books-assouline-151",
  "department": "books",
  "label": "Dos destinos, una repisa",
  "genre": "Viajes",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Londolozi: The Safari that Changed Everything"
   },
   {
    "retailer": "assouline",
    "title": "African Adventures: The Greatest Safari on Earth"
   }
  ]
 },
 {
  "id": "combo-books-assouline-152",
  "department": "books",
  "label": "Dos destinos, una repisa",
  "genre": "Viajes",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Zanzibar"
   },
   {
    "retailer": "assouline",
    "title": "African Adventures: The Greatest Safari on Earth"
   }
  ]
 },
 {
  "id": "combo-books-assouline-153",
  "department": "books",
  "label": "Dos destinos, una repisa",
  "genre": "Viajes",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Baur Au Lac: A Legacy by the Lake"
   },
   {
    "retailer": "assouline",
    "title": "African Adventures: The Greatest Safari on Earth"
   }
  ]
 },
 {
  "id": "combo-books-assouline-154",
  "department": "books",
  "label": "Dos destinos, una repisa",
  "genre": "Viajes",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Quinta Da Comporta"
   },
   {
    "retailer": "assouline",
    "title": "African Adventures: The Greatest Safari on Earth"
   }
  ]
 },
 {
  "id": "combo-books-assouline-155",
  "department": "books",
  "label": "Dos destinos, una repisa",
  "genre": "Viajes",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Malhadinha: The Soul of Alentejo"
   },
   {
    "retailer": "assouline",
    "title": "African Adventures: The Greatest Safari on Earth"
   }
  ]
 },
 {
  "id": "combo-books-assouline-156",
  "department": "books",
  "label": "Cine en tu mesa de centro",
  "genre": "Cine",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "The Book of HOV: A Tribute to Jay-Z (Classic)"
   },
   {
    "retailer": "assouline",
    "title": "James Bond Destinations"
   }
  ]
 },
 {
  "id": "combo-books-assouline-157",
  "department": "books",
  "label": "Cine en tu mesa de centro",
  "genre": "Cine",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Dolce Vita"
   },
   {
    "retailer": "assouline",
    "title": "James Bond Destinations"
   }
  ]
 },
 {
  "id": "combo-books-assouline-158",
  "department": "books",
  "label": "Cine en tu mesa de centro",
  "genre": "Cine",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "America's Sweethearts: Dallas Cowboys Cheerleaders (Classic)"
   },
   {
    "retailer": "assouline",
    "title": "James Bond Destinations"
   }
  ]
 },
 {
  "id": "combo-books-assouline-159",
  "department": "books",
  "label": "Cine en tu mesa de centro",
  "genre": "Cine",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Columbia Pictures: 100 Years of Cinema"
   },
   {
    "retailer": "assouline",
    "title": "James Bond Destinations"
   }
  ]
 },
 {
  "id": "combo-books-assouline-160",
  "department": "books",
  "label": "Cine en tu mesa de centro",
  "genre": "Cine",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Father and Child"
   },
   {
    "retailer": "assouline",
    "title": "James Bond Destinations"
   }
  ]
 },
 {
  "id": "combo-books-assouline-161",
  "department": "books",
  "label": "Cine en tu mesa de centro",
  "genre": "Cine",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Brigitte Bardot: Intimate"
   },
   {
    "retailer": "assouline",
    "title": "James Bond Destinations"
   }
  ]
 },
 {
  "id": "combo-books-assouline-162",
  "department": "books",
  "label": "Cine en tu mesa de centro",
  "genre": "Cine",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Saudi Arabia: Flower Men"
   },
   {
    "retailer": "assouline",
    "title": "James Bond Destinations"
   }
  ]
 },
 {
  "id": "combo-books-assouline-163",
  "department": "books",
  "label": "Cine en tu mesa de centro",
  "genre": "Cine",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Hunt"
   },
   {
    "retailer": "assouline",
    "title": "James Bond Destinations"
   }
  ]
 },
 {
  "id": "combo-books-assouline-164",
  "department": "books",
  "label": "Cine en tu mesa de centro",
  "genre": "Cine",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Jay Kelly"
   },
   {
    "retailer": "assouline",
    "title": "James Bond Destinations"
   }
  ]
 },
 {
  "id": "combo-books-assouline-165",
  "department": "books",
  "label": "Cine en tu mesa de centro",
  "genre": "Cine",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Undisputed: Usyk vs. Fury (Classic)"
   },
   {
    "retailer": "assouline",
    "title": "James Bond Destinations"
   }
  ]
 },
 {
  "id": "combo-books-assouline-166",
  "department": "books",
  "label": "De la mesa a la cocina",
  "genre": "Gastronomía",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Wine & Travel Latin America"
   },
   {
    "retailer": "assouline",
    "title": "Veuve Clicquot"
   }
  ]
 },
 {
  "id": "combo-books-assouline-167",
  "department": "books",
  "label": "De la mesa a la cocina",
  "genre": "Gastronomía",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Wine & Travel France"
   },
   {
    "retailer": "assouline",
    "title": "Veuve Clicquot"
   }
  ]
 },
 {
  "id": "combo-books-assouline-168",
  "department": "books",
  "label": "De la mesa a la cocina",
  "genre": "Gastronomía",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Wine & Travel United States of America"
   },
   {
    "retailer": "assouline",
    "title": "Veuve Clicquot"
   }
  ]
 },
 {
  "id": "combo-books-assouline-169",
  "department": "books",
  "label": "De la mesa a la cocina",
  "genre": "Gastronomía",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Wine & Travel Mediterranean Islands"
   },
   {
    "retailer": "assouline",
    "title": "Veuve Clicquot"
   }
  ]
 },
 {
  "id": "combo-books-assouline-170",
  "department": "books",
  "label": "De la mesa a la cocina",
  "genre": "Gastronomía",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Ron Zacapa from Guatemala"
   },
   {
    "retailer": "assouline",
    "title": "Veuve Clicquot"
   }
  ]
 },
 {
  "id": "combo-books-assouline-171",
  "department": "books",
  "label": "De la mesa a la cocina",
  "genre": "Gastronomía",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Oak, Wine & Spirits: A Tale of Alchemy"
   },
   {
    "retailer": "assouline",
    "title": "Veuve Clicquot"
   }
  ]
 },
 {
  "id": "combo-books-assouline-172",
  "department": "books",
  "label": "De la mesa a la cocina",
  "genre": "Gastronomía",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Sushi Shokunin: Japan's Culinary Masters"
   },
   {
    "retailer": "assouline",
    "title": "Veuve Clicquot"
   }
  ]
 },
 {
  "id": "combo-books-assouline-173",
  "department": "books",
  "label": "De la mesa a la cocina",
  "genre": "Gastronomía",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Saudi Coffee: The Culture of Hospitality"
   },
   {
    "retailer": "assouline",
    "title": "Veuve Clicquot"
   }
  ]
 },
 {
  "id": "combo-books-assouline-174",
  "department": "books",
  "label": "De la mesa a la cocina",
  "genre": "Gastronomía",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Carbone"
   },
   {
    "retailer": "assouline",
    "title": "Veuve Clicquot"
   }
  ]
 },
 {
  "id": "combo-books-assouline-175",
  "department": "books",
  "label": "De la mesa a la cocina",
  "genre": "Gastronomía",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Nutella"
   },
   {
    "retailer": "assouline",
    "title": "Veuve Clicquot"
   }
  ]
 },
 {
  "id": "combo-books-assouline-176",
  "department": "books",
  "label": "De la mesa a la cocina",
  "genre": "Gastronomía",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Lapérouse: A Parisian Icon Since 1766"
   },
   {
    "retailer": "assouline",
    "title": "Veuve Clicquot"
   }
  ]
 },
 {
  "id": "combo-books-assouline-177",
  "department": "books",
  "label": "De la mesa a la cocina",
  "genre": "Gastronomía",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "The Art of Manufacture: Alain Ducasse"
   },
   {
    "retailer": "assouline",
    "title": "Veuve Clicquot"
   }
  ]
 },
 {
  "id": "combo-books-assouline-178",
  "department": "books",
  "label": "De la mesa a la cocina",
  "genre": "Gastronomía",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Saudi Dates: A Portrait of the Sacred Fruit"
   },
   {
    "retailer": "assouline",
    "title": "Veuve Clicquot"
   }
  ]
 },
 {
  "id": "combo-books-assouline-179",
  "department": "books",
  "label": "De la mesa a la cocina",
  "genre": "Gastronomía",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Mystic Mist: The Rituals of HuqqA"
   },
   {
    "retailer": "assouline",
    "title": "Veuve Clicquot"
   }
  ]
 },
 {
  "id": "combo-books-assouline-180",
  "department": "books",
  "label": "De la mesa a la cocina",
  "genre": "Gastronomía",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Château Life"
   },
   {
    "retailer": "assouline",
    "title": "Veuve Clicquot"
   }
  ]
 },
 {
  "id": "combo-books-assouline-181",
  "department": "books",
  "label": "Velocidad en dos tomos",
  "genre": "Motores",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Vintage Cars (2nd Edition)"
   },
   {
    "retailer": "assouline",
    "title": "The Carlyle"
   }
  ]
 },
 {
  "id": "combo-books-assouline-182",
  "department": "books",
  "label": "Velocidad en dos tomos",
  "genre": "Motores",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Delta: 100 Years and Climbing"
   },
   {
    "retailer": "assouline",
    "title": "The Carlyle"
   }
  ]
 },
 {
  "id": "combo-books-assouline-183",
  "department": "books",
  "label": "Velocidad en dos tomos",
  "genre": "Motores",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Saint-Tropez Yachting"
   },
   {
    "retailer": "assouline",
    "title": "The Carlyle"
   }
  ]
 },
 {
  "id": "combo-books-assouline-184",
  "department": "books",
  "label": "Velocidad en dos tomos",
  "genre": "Motores",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Iconic: Art, Design, Advertising, and the Automobile"
   },
   {
    "retailer": "assouline",
    "title": "The Carlyle"
   }
  ]
 },
 {
  "id": "combo-books-assouline-185",
  "department": "books",
  "label": "Velocidad en dos tomos",
  "genre": "Motores",
  "savingUsd": 32,
  "items": [
   {
    "retailer": "assouline",
    "title": "Yacht Club De Monaco"
   },
   {
    "retailer": "assouline",
    "title": "The Carlyle"
   }
  ]
 },
 {
  "id": "combo-books-assouline-186",
  "department": "books",
  "label": "Arquitectura en dos tomos",
  "genre": "Arquitectura",
  "savingUsd": 27,
  "items": [
   {
    "retailer": "assouline",
    "title": "Alula Ever"
   },
   {
    "retailer": "assouline",
    "title": "Samaritaine: Paris Pont-Neuf"
   }
  ]
 },
 {
  "id": "combo-books-assouline-187",
  "department": "books",
  "label": "Dos destinos, una repisa",
  "genre": "Viajes",
  "savingUsd": 28,
  "items": [
   {
    "retailer": "assouline",
    "title": "Capri Dolce Vita"
   },
   {
    "retailer": "assouline",
    "title": "Amalfi Coast"
   }
  ]
 },
 {
  "id": "combo-books-assouline-188",
  "department": "books",
  "label": "Dos destinos, una repisa",
  "genre": "Viajes",
  "savingUsd": 28,
  "items": [
   {
    "retailer": "assouline",
    "title": "Palm Beach"
   },
   {
    "retailer": "assouline",
    "title": "Capri Dolce Vita"
   }
  ]
 },
 {
  "id": "combo-books-assouline-189",
  "department": "books",
  "label": "Dos destinos, una repisa",
  "genre": "Viajes",
  "savingUsd": 28,
  "items": [
   {
    "retailer": "assouline",
    "title": "Miami Beach"
   },
   {
    "retailer": "assouline",
    "title": "Capri Dolce Vita"
   }
  ]
 },
 {
  "id": "combo-books-assouline-190",
  "department": "books",
  "label": "Dos destinos, una repisa",
  "genre": "Viajes",
  "savingUsd": 28,
  "items": [
   {
    "retailer": "assouline",
    "title": "Mykonos Muse"
   },
   {
    "retailer": "assouline",
    "title": "Capri Dolce Vita"
   }
  ]
 },
 {
  "id": "combo-books-assouline-191",
  "department": "books",
  "label": "Dos destinos, una repisa",
  "genre": "Viajes",
  "savingUsd": 28,
  "items": [
   {
    "retailer": "assouline",
    "title": "Ibiza Bohemia"
   },
   {
    "retailer": "assouline",
    "title": "Capri Dolce Vita"
   }
  ]
 },
 {
  "id": "combo-books-assouline-192",
  "department": "books",
  "label": "El dúo de moda",
  "genre": "Moda",
  "savingUsd": 30,
  "items": [
   {
    "retailer": "assouline",
    "title": "Aspen Style"
   },
   {
    "retailer": "assouline",
    "title": "Fashionphile: The Book of Iconic Shoes"
   }
  ]
 },
 {
  "id": "combo-books-assouline-193",
  "department": "books",
  "label": "Dos destinos, una repisa",
  "genre": "Viajes",
  "savingUsd": 28,
  "items": [
   {
    "retailer": "assouline",
    "title": "Tulum Gypset"
   },
   {
    "retailer": "assouline",
    "title": "Capri Dolce Vita"
   }
  ]
 },
 {
  "id": "combo-books-assouline-194",
  "department": "books",
  "label": "Dos destinos, una repisa",
  "genre": "Viajes",
  "savingUsd": 28,
  "items": [
   {
    "retailer": "assouline",
    "title": "Greek Islands"
   },
   {
    "retailer": "assouline",
    "title": "Capri Dolce Vita"
   }
  ]
 },
 {
  "id": "combo-books-assouline-195",
  "department": "books",
  "label": "Dos destinos, una repisa",
  "genre": "Viajes",
  "savingUsd": 28,
  "items": [
   {
    "retailer": "assouline",
    "title": "St. Tropez Soleil"
   },
   {
    "retailer": "assouline",
    "title": "Capri Dolce Vita"
   }
  ]
 },
 {
  "id": "combo-books-assouline-196",
  "department": "books",
  "label": "El par perfecto",
  "genre": "Colección",
  "savingUsd": 28,
  "items": [
   {
    "retailer": "assouline",
    "title": "Sicily Honor"
   },
   {
    "retailer": "assouline",
    "title": "Lake Como Idyll"
   }
  ]
 },
 {
  "id": "combo-books-assouline-197",
  "department": "books",
  "label": "Dos destinos, una repisa",
  "genre": "Viajes",
  "savingUsd": 28,
  "items": [
   {
    "retailer": "assouline",
    "title": "Hamptons Private"
   },
   {
    "retailer": "assouline",
    "title": "Capri Dolce Vita"
   }
  ]
 },
 {
  "id": "combo-books-assouline-198",
  "department": "books",
  "label": "Dos destinos, una repisa",
  "genre": "Viajes",
  "savingUsd": 28,
  "items": [
   {
    "retailer": "assouline",
    "title": "Mexico City"
   },
   {
    "retailer": "assouline",
    "title": "Capri Dolce Vita"
   }
  ]
 },
 {
  "id": "combo-books-assouline-199",
  "department": "books",
  "label": "Dos destinos, una repisa",
  "genre": "Viajes",
  "savingUsd": 28,
  "items": [
   {
    "retailer": "assouline",
    "title": "Marrakech Flair"
   },
   {
    "retailer": "assouline",
    "title": "Capri Dolce Vita"
   }
  ]
 },
 {
  "id": "combo-books-assouline-200",
  "department": "books",
  "label": "El par perfecto",
  "genre": "Colección",
  "savingUsd": 28,
  "items": [
   {
    "retailer": "assouline",
    "title": "Santo Domingo"
   },
   {
    "retailer": "assouline",
    "title": "Sicily Honor"
   }
  ]
 },
 {
  "id": "combo-books-assouline-201",
  "department": "books",
  "label": "El par perfecto",
  "genre": "Colección",
  "savingUsd": 28,
  "items": [
   {
    "retailer": "assouline",
    "title": "Kyoto Serenity"
   },
   {
    "retailer": "assouline",
    "title": "Sicily Honor"
   }
  ]
 },
 {
  "id": "combo-books-assouline-202",
  "department": "books",
  "label": "Dos destinos, una repisa",
  "genre": "Viajes",
  "savingUsd": 28,
  "items": [
   {
    "retailer": "assouline",
    "title": "Mustique Icon"
   },
   {
    "retailer": "assouline",
    "title": "Capri Dolce Vita"
   }
  ]
 },
 {
  "id": "combo-books-assouline-203",
  "department": "books",
  "label": "El par perfecto",
  "genre": "Colección",
  "savingUsd": 28,
  "items": [
   {
    "retailer": "assouline",
    "title": "Palm Springs"
   },
   {
    "retailer": "assouline",
    "title": "Sicily Honor"
   }
  ]
 },
 {
  "id": "combo-books-assouline-204",
  "department": "books",
  "label": "Dos destinos, una repisa",
  "genre": "Viajes",
  "savingUsd": 28,
  "items": [
   {
    "retailer": "assouline",
    "title": "Rio De Janeiro"
   },
   {
    "retailer": "assouline",
    "title": "Capri Dolce Vita"
   }
  ]
 },
 {
  "id": "combo-books-assouline-205",
  "department": "books",
  "label": "Dos destinos, una repisa",
  "genre": "Viajes",
  "savingUsd": 28,
  "items": [
   {
    "retailer": "assouline",
    "title": "Roma Eterna"
   },
   {
    "retailer": "assouline",
    "title": "Capri Dolce Vita"
   }
  ]
 },
 {
  "id": "combo-books-assouline-206",
  "department": "books",
  "label": "Dos destinos, una repisa",
  "genre": "Viajes",
  "savingUsd": 28,
  "items": [
   {
    "retailer": "assouline",
    "title": "Costa Rica Vida"
   },
   {
    "retailer": "assouline",
    "title": "Capri Dolce Vita"
   }
  ]
 },
 {
  "id": "combo-books-assouline-207",
  "department": "books",
  "label": "Dos destinos, una repisa",
  "genre": "Viajes",
  "savingUsd": 28,
  "items": [
   {
    "retailer": "assouline",
    "title": "Tangier Tangerine"
   },
   {
    "retailer": "assouline",
    "title": "Capri Dolce Vita"
   }
  ]
 },
 {
  "id": "combo-books-assouline-208",
  "department": "books",
  "label": "Dos destinos, una repisa",
  "genre": "Viajes",
  "savingUsd": 28,
  "items": [
   {
    "retailer": "assouline",
    "title": "Cairo Eternal"
   },
   {
    "retailer": "assouline",
    "title": "Capri Dolce Vita"
   }
  ]
 },
 {
  "id": "combo-books-assouline-209",
  "department": "books",
  "label": "Dos destinos, una repisa",
  "genre": "Viajes",
  "savingUsd": 28,
  "items": [
   {
    "retailer": "assouline",
    "title": "Knokke Le Zoute"
   },
   {
    "retailer": "assouline",
    "title": "Capri Dolce Vita"
   }
  ]
 },
 {
  "id": "combo-books-assouline-210",
  "department": "books",
  "label": "Dos destinos, una repisa",
  "genre": "Viajes",
  "savingUsd": 28,
  "items": [
   {
    "retailer": "assouline",
    "title": "St. Moritz Chic"
   },
   {
    "retailer": "assouline",
    "title": "Capri Dolce Vita"
   }
  ]
 },
 {
  "id": "combo-books-assouline-211",
  "department": "books",
  "label": "Dos destinos, una repisa",
  "genre": "Viajes",
  "savingUsd": 28,
  "items": [
   {
    "retailer": "assouline",
    "title": "Monte Carlo"
   },
   {
    "retailer": "assouline",
    "title": "Capri Dolce Vita"
   }
  ]
 },
 {
  "id": "combo-books-assouline-212",
  "department": "books",
  "label": "Dos destinos, una repisa",
  "genre": "Viajes",
  "savingUsd": 28,
  "items": [
   {
    "retailer": "assouline",
    "title": "Malta Heritage"
   },
   {
    "retailer": "assouline",
    "title": "Capri Dolce Vita"
   }
  ]
 },
 {
  "id": "combo-books-assouline-213",
  "department": "books",
  "label": "Dos destinos, una repisa",
  "genre": "Viajes",
  "savingUsd": 28,
  "items": [
   {
    "retailer": "assouline",
    "title": "Comporta Bliss"
   },
   {
    "retailer": "assouline",
    "title": "Capri Dolce Vita"
   }
  ]
 },
 {
  "id": "combo-books-assouline-214",
  "department": "books",
  "label": "Dos destinos, una repisa",
  "genre": "Viajes",
  "savingUsd": 28,
  "items": [
   {
    "retailer": "assouline",
    "title": "Gstaad Glam"
   },
   {
    "retailer": "assouline",
    "title": "Capri Dolce Vita"
   }
  ]
 },
 {
  "id": "combo-books-assouline-215",
  "department": "books",
  "label": "Dos destinos, una repisa",
  "genre": "Viajes",
  "savingUsd": 28,
  "items": [
   {
    "retailer": "assouline",
    "title": "Lisboa Luz"
   },
   {
    "retailer": "assouline",
    "title": "Capri Dolce Vita"
   }
  ]
 },
 {
  "id": "combo-books-assouline-216",
  "department": "books",
  "label": "Dos destinos, una repisa",
  "genre": "Viajes",
  "savingUsd": 28,
  "items": [
   {
    "retailer": "assouline",
    "title": "Iceland Epic"
   },
   {
    "retailer": "assouline",
    "title": "Capri Dolce Vita"
   }
  ]
 },
 {
  "id": "combo-books-assouline-217",
  "department": "books",
  "label": "Dos destinos, una repisa",
  "genre": "Viajes",
  "savingUsd": 28,
  "items": [
   {
    "retailer": "assouline",
    "title": "Forte Dei Marmi"
   },
   {
    "retailer": "assouline",
    "title": "Capri Dolce Vita"
   }
  ]
 },
 {
  "id": "combo-books-assouline-218",
  "department": "books",
  "label": "Dos destinos, una repisa",
  "genre": "Viajes",
  "savingUsd": 28,
  "items": [
   {
    "retailer": "assouline",
    "title": "Marbella Sol"
   },
   {
    "retailer": "assouline",
    "title": "Capri Dolce Vita"
   }
  ]
 },
 {
  "id": "combo-books-assouline-219",
  "department": "books",
  "label": "Dos destinos, una repisa",
  "genre": "Viajes",
  "savingUsd": 28,
  "items": [
   {
    "retailer": "assouline",
    "title": "Biarritz Basque"
   },
   {
    "retailer": "assouline",
    "title": "Capri Dolce Vita"
   }
  ]
 },
 {
  "id": "combo-books-assouline-220",
  "department": "books",
  "label": "Dos destinos, una repisa",
  "genre": "Viajes",
  "savingUsd": 28,
  "items": [
   {
    "retailer": "assouline",
    "title": "Turquoise Coast"
   },
   {
    "retailer": "assouline",
    "title": "Capri Dolce Vita"
   }
  ]
 },
 {
  "id": "combo-books-assouline-221",
  "department": "books",
  "label": "Dos destinos, una repisa",
  "genre": "Viajes",
  "savingUsd": 28,
  "items": [
   {
    "retailer": "assouline",
    "title": "Ocean Wanderlust"
   },
   {
    "retailer": "assouline",
    "title": "Capri Dolce Vita"
   }
  ]
 },
 {
  "id": "combo-books-assouline-222",
  "department": "books",
  "label": "Dos destinos, una repisa",
  "genre": "Viajes",
  "savingUsd": 28,
  "items": [
   {
    "retailer": "assouline",
    "title": "St. Barths Freedom"
   },
   {
    "retailer": "assouline",
    "title": "Capri Dolce Vita"
   }
  ]
 },
 {
  "id": "combo-books-assouline-223",
  "department": "books",
  "label": "Dos destinos, una repisa",
  "genre": "Viajes",
  "savingUsd": 28,
  "items": [
   {
    "retailer": "assouline",
    "title": "Jamaica Vibes"
   },
   {
    "retailer": "assouline",
    "title": "Capri Dolce Vita"
   }
  ]
 },
 {
  "id": "combo-books-assouline-224",
  "department": "books",
  "label": "Dos destinos, una repisa",
  "genre": "Viajes",
  "savingUsd": 28,
  "items": [
   {
    "retailer": "assouline",
    "title": "Cartagena Grace"
   },
   {
    "retailer": "assouline",
    "title": "Capri Dolce Vita"
   }
  ]
 },
 {
  "id": "combo-books-assouline-225",
  "department": "books",
  "label": "Dos destinos, una repisa",
  "genre": "Viajes",
  "savingUsd": 28,
  "items": [
   {
    "retailer": "assouline",
    "title": "Pacific Islands: James Cook Voyages"
   },
   {
    "retailer": "assouline",
    "title": "Capri Dolce Vita"
   }
  ]
 },
 {
  "id": "combo-books-assouline-226",
  "department": "books",
  "label": "El dúo de moda",
  "genre": "Moda",
  "savingUsd": 26,
  "items": [
   {
    "retailer": "assouline",
    "title": "Chanel 3-Book Slipcase (New Edition)"
   },
   {
    "retailer": "assouline",
    "title": "Aspen Style"
   }
  ]
 },
 {
  "id": "combo-books-assouline-227",
  "department": "books",
  "label": "De la mesa a la cocina",
  "genre": "Gastronomía",
  "savingUsd": 27,
  "items": [
   {
    "retailer": "assouline",
    "title": "The 100 Burgundy: Exceptional Wines to Build a Dream Cellar"
   },
   {
    "retailer": "assouline",
    "title": "Veuve Clicquot"
   }
  ]
 },
 {
  "id": "combo-books-assouline-228",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 18,
  "items": [
   {
    "retailer": "assouline",
    "title": "Heart & Love"
   },
   {
    "retailer": "assouline",
    "title": "Smiley: 50 Years of Good News"
   }
  ]
 },
 {
  "id": "combo-books-assouline-229",
  "department": "books",
  "label": "Cine en tu mesa de centro",
  "genre": "Cine",
  "savingUsd": 18,
  "items": [
   {
    "retailer": "assouline",
    "title": "Psychedelic Now"
   },
   {
    "retailer": "assouline",
    "title": "Cocaïn: History & Culture"
   }
  ]
 },
 {
  "id": "combo-books-assouline-230",
  "department": "books",
  "label": "De la mesa a la cocina",
  "genre": "Gastronomía",
  "savingUsd": 16,
  "items": [
   {
    "retailer": "assouline",
    "title": "The Missoni Family Cookbook"
   },
   {
    "retailer": "assouline",
    "title": "Cocktail Chameleon"
   }
  ]
 },
 {
  "id": "combo-books-assouline-231",
  "department": "books",
  "label": "De la mesa a la cocina",
  "genre": "Gastronomía",
  "savingUsd": 12,
  "items": [
   {
    "retailer": "assouline",
    "title": "Swans Bar"
   },
   {
    "retailer": "assouline",
    "title": "The Missoni Family Cookbook"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-232",
  "department": "books",
  "label": "El par perfecto",
  "genre": "Colección",
  "savingUsd": 53,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Silver. Skate. Seventies. (Limited Edition)"
   },
   {
    "retailer": "chronicle",
    "title": "Playboy: The Complete Centerfolds, 1953-2016"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-233",
  "department": "books",
  "label": "El dúo pop",
  "genre": "Cultura Pop",
  "savingUsd": 20,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Playboy: The Complete Centerfolds, 1953-2016"
   },
   {
    "retailer": "chronicle",
    "title": "Disney/Pixar The Art of Coco"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-234",
  "department": "books",
  "label": "El dúo de diseño",
  "genre": "Diseño",
  "savingUsd": 18,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Art and Fashion"
   },
   {
    "retailer": "chronicle",
    "title": "Livable Luxe"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-235",
  "department": "books",
  "label": "El par perfecto",
  "genre": "Colección",
  "savingUsd": 18,
  "items": [
   {
    "retailer": "chronicle",
    "title": "The Sea Ranch, Revised"
   },
   {
    "retailer": "chronicle",
    "title": "Last Days of Summer"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-236",
  "department": "books",
  "label": "El par fotográfico",
  "genre": "Fotografía",
  "savingUsd": 15,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Alex Prager: Silver Lake Drive"
   },
   {
    "retailer": "chronicle",
    "title": "Jim Marshall: Show Me the Picture"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-237",
  "department": "books",
  "label": "El par perfecto",
  "genre": "Colección",
  "savingUsd": 16,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Last Days of Summer"
   },
   {
    "retailer": "chronicle",
    "title": "Russel and Mary Wright"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-238",
  "department": "books",
  "label": "El par perfecto",
  "genre": "Colección",
  "savingUsd": 16,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Immortal Axes"
   },
   {
    "retailer": "chronicle",
    "title": "Last Days of Summer"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-239",
  "department": "books",
  "label": "El par perfecto",
  "genre": "Colección",
  "savingUsd": 16,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Flamingo Estate: The Guide to Becoming Alive"
   },
   {
    "retailer": "chronicle",
    "title": "Last Days of Summer"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-240",
  "department": "books",
  "label": "Arquitectura en dos tomos",
  "genre": "Arquitectura",
  "savingUsd": 15,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Designing Aspen"
   },
   {
    "retailer": "chronicle",
    "title": "The Women Who Changed Architecture"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-241",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 15,
  "items": [
   {
    "retailer": "chronicle",
    "title": "African Art Now"
   },
   {
    "retailer": "chronicle",
    "title": "Radical Softness"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-242",
  "department": "books",
  "label": "El par fotográfico",
  "genre": "Fotografía",
  "savingUsd": 15,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Jim Marshall: Show Me the Picture"
   },
   {
    "retailer": "chronicle",
    "title": "Musik"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-243",
  "department": "books",
  "label": "El dúo pop",
  "genre": "Cultura Pop",
  "savingUsd": 13,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Disney/Pixar The Art of Coco"
   },
   {
    "retailer": "chronicle",
    "title": "Disney The Art of Zootopia"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-244",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 13,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Disney They Drew as They Pleased Vol. 1"
   },
   {
    "retailer": "chronicle",
    "title": "This Book Is a Planetarium"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-245",
  "department": "books",
  "label": "El dúo pop",
  "genre": "Cultura Pop",
  "savingUsd": 13,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Disney/Pixar The Art of Pixar: 25th Anniv Hc"
   },
   {
    "retailer": "chronicle",
    "title": "Disney/Pixar The Art of Coco"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-246",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 13,
  "items": [
   {
    "retailer": "chronicle",
    "title": "The Printmaking Bible, Revised Edition"
   },
   {
    "retailer": "chronicle",
    "title": "Disney They Drew as They Pleased Vol. 1"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-247",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 13,
  "items": [
   {
    "retailer": "chronicle",
    "title": "The Theatrical Adventures of Edward Gorey"
   },
   {
    "retailer": "chronicle",
    "title": "Disney They Drew as They Pleased Vol. 1"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-248",
  "department": "books",
  "label": "El dúo pop",
  "genre": "Cultura Pop",
  "savingUsd": 13,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Why Drag?"
   },
   {
    "retailer": "chronicle",
    "title": "Disney/Pixar The Art of Coco"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-249",
  "department": "books",
  "label": "El par fotográfico",
  "genre": "Fotografía",
  "savingUsd": 14,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Shall We Dance"
   },
   {
    "retailer": "chronicle",
    "title": "Jim Marshall: Show Me the Picture"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-250",
  "department": "books",
  "label": "Arquitectura en dos tomos",
  "genre": "Arquitectura",
  "savingUsd": 13,
  "items": [
   {
    "retailer": "chronicle",
    "title": "The Women Who Changed Architecture"
   },
   {
    "retailer": "chronicle",
    "title": "Olle Lundberg"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-251",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 13,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Stone"
   },
   {
    "retailer": "chronicle",
    "title": "Disney They Drew as They Pleased Vol. 1"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-252",
  "department": "books",
  "label": "El dúo de diseño",
  "genre": "Diseño",
  "savingUsd": 13,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Livable Luxe"
   },
   {
    "retailer": "chronicle",
    "title": "The Architect and Designer Birthday Book"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-253",
  "department": "books",
  "label": "Arquitectura en dos tomos",
  "genre": "Arquitectura",
  "savingUsd": 13,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Weekend Utopia Revised and Expanded Edition"
   },
   {
    "retailer": "chronicle",
    "title": "The Women Who Changed Architecture"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-254",
  "department": "books",
  "label": "Arquitectura en dos tomos",
  "genre": "Arquitectura",
  "savingUsd": 13,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Folger Shakespeare Library"
   },
   {
    "retailer": "chronicle",
    "title": "The Women Who Changed Architecture"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-255",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 12,
  "items": [
   {
    "retailer": "chronicle",
    "title": "The Ceramics Bible Revised Edition"
   },
   {
    "retailer": "chronicle",
    "title": "The Art of Feminism"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-256",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 12,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Rothko"
   },
   {
    "retailer": "chronicle",
    "title": "The Ceramics Bible Revised Edition"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-257",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 12,
  "items": [
   {
    "retailer": "chronicle",
    "title": "The Art of Beatrix Potter"
   },
   {
    "retailer": "chronicle",
    "title": "The Ceramics Bible Revised Edition"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-258",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 12,
  "items": [
   {
    "retailer": "chronicle",
    "title": "The Journey Is the Destination, Revised Edition"
   },
   {
    "retailer": "chronicle",
    "title": "The Ceramics Bible Revised Edition"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-259",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 12,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Hatch Show Print"
   },
   {
    "retailer": "chronicle",
    "title": "The Ceramics Bible Revised Edition"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-260",
  "department": "books",
  "label": "El dúo pop",
  "genre": "Cultura Pop",
  "savingUsd": 12,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Disney/Pixar The Art of Up"
   },
   {
    "retailer": "chronicle",
    "title": "Disney/Pixar The Art of Ratatouille"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-261",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 12,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Music for a City Music for the World"
   },
   {
    "retailer": "chronicle",
    "title": "The Ceramics Bible Revised Edition"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-262",
  "department": "books",
  "label": "El dúo musical",
  "genre": "Música",
  "savingUsd": 11,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Negatives"
   },
   {
    "retailer": "chronicle",
    "title": "The Beatles by Jim Marshall"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-263",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 12,
  "items": [
   {
    "retailer": "chronicle",
    "title": "The Ghost Army of World War II"
   },
   {
    "retailer": "chronicle",
    "title": "The Ceramics Bible Revised Edition"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-264",
  "department": "books",
  "label": "Arquitectura en dos tomos",
  "genre": "Arquitectura",
  "savingUsd": 13,
  "items": [
   {
    "retailer": "chronicle",
    "title": "This Oak House"
   },
   {
    "retailer": "chronicle",
    "title": "The Women Who Changed Architecture"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-265",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 12,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Pride and Prejudice"
   },
   {
    "retailer": "chronicle",
    "title": "The Ceramics Bible Revised Edition"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-266",
  "department": "books",
  "label": "El dúo pop",
  "genre": "Cultura Pop",
  "savingUsd": 11,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Disney/Pixar The Art of Ratatouille"
   },
   {
    "retailer": "chronicle",
    "title": "Disney The Art of Tangled"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-267",
  "department": "books",
  "label": "El dúo pop",
  "genre": "Cultura Pop",
  "savingUsd": 11,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Disney The Art of Frozen"
   },
   {
    "retailer": "chronicle",
    "title": "Disney/Pixar The Art of Ratatouille"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-268",
  "department": "books",
  "label": "El par fotográfico",
  "genre": "Fotografía",
  "savingUsd": 11,
  "items": [
   {
    "retailer": "chronicle",
    "title": "The Planets"
   },
   {
    "retailer": "chronicle",
    "title": "History as They Saw It"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-269",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 11,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Get Your Sh*t Together"
   },
   {
    "retailer": "chronicle",
    "title": "JR: The Chronicles of San Francisco"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-270",
  "department": "books",
  "label": "El dúo pop",
  "genre": "Cultura Pop",
  "savingUsd": 11,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Disney/Pixar The Art of The Good Dinosaur"
   },
   {
    "retailer": "chronicle",
    "title": "Disney/Pixar The Art of Cars 3"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-271",
  "department": "books",
  "label": "El par perfecto",
  "genre": "Colección",
  "savingUsd": 11,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Explorers' Sketchbooks"
   },
   {
    "retailer": "chronicle",
    "title": "The Ceramics Bible"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-272",
  "department": "books",
  "label": "El dúo pop",
  "genre": "Cultura Pop",
  "savingUsd": 11,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Disney/Pixar The Art of Finding Dory"
   },
   {
    "retailer": "chronicle",
    "title": "Disney/Pixar The Art of The Good Dinosaur"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-273",
  "department": "books",
  "label": "El dúo de diseño",
  "genre": "Diseño",
  "savingUsd": 11,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Boundless Books"
   },
   {
    "retailer": "chronicle",
    "title": "What It Means to Be a Designer Today"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-274",
  "department": "books",
  "label": "El dúo pop",
  "genre": "Cultura Pop",
  "savingUsd": 11,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Disney/Pixar The Art of Inside Out"
   },
   {
    "retailer": "chronicle",
    "title": "Disney/Pixar The Art of The Good Dinosaur"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-275",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 11,
  "items": [
   {
    "retailer": "chronicle",
    "title": "The Thing The Book"
   },
   {
    "retailer": "chronicle",
    "title": "Get Your Sh*t Together"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-276",
  "department": "books",
  "label": "El dúo pop",
  "genre": "Cultura Pop",
  "savingUsd": 11,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Disney The Art of Planes"
   },
   {
    "retailer": "chronicle",
    "title": "Disney/Pixar The Art of The Good Dinosaur"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-277",
  "department": "books",
  "label": "El dúo pop",
  "genre": "Cultura Pop",
  "savingUsd": 11,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Sketchtravel"
   },
   {
    "retailer": "chronicle",
    "title": "Disney/Pixar The Art of The Good Dinosaur"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-278",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 11,
  "items": [
   {
    "retailer": "chronicle",
    "title": "At Large"
   },
   {
    "retailer": "chronicle",
    "title": "Get Your Sh*t Together"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-279",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 11,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Pantone: The Twentieth Century in Color"
   },
   {
    "retailer": "chronicle",
    "title": "Get Your Sh*t Together"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-280",
  "department": "books",
  "label": "El par fotográfico",
  "genre": "Fotografía",
  "savingUsd": 11,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Camo"
   },
   {
    "retailer": "chronicle",
    "title": "The Rolling Stones 1972 50th Anniversary Edition"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-281",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 11,
  "items": [
   {
    "retailer": "chronicle",
    "title": "The New Black West"
   },
   {
    "retailer": "chronicle",
    "title": "Get Your Sh*t Together"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-282",
  "department": "books",
  "label": "El dúo pop",
  "genre": "Cultura Pop",
  "savingUsd": 11,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Rainbow Revolution"
   },
   {
    "retailer": "chronicle",
    "title": "Disney/Pixar The Art of The Good Dinosaur"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-283",
  "department": "books",
  "label": "El par fotográfico",
  "genre": "Fotografía",
  "savingUsd": 11,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Typewriters"
   },
   {
    "retailer": "chronicle",
    "title": "Camo"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-284",
  "department": "books",
  "label": "El par fotográfico",
  "genre": "Fotografía",
  "savingUsd": 11,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Earth and Space"
   },
   {
    "retailer": "chronicle",
    "title": "Camo"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-285",
  "department": "books",
  "label": "El par fotográfico",
  "genre": "Fotografía",
  "savingUsd": 11,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Love Hotels"
   },
   {
    "retailer": "chronicle",
    "title": "Camo"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-286",
  "department": "books",
  "label": "Arquitectura en dos tomos",
  "genre": "Arquitectura",
  "savingUsd": 10,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Sky-High"
   },
   {
    "retailer": "chronicle",
    "title": "How Design Makes Us Think PB"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-287",
  "department": "books",
  "label": "El par perfecto",
  "genre": "Colección",
  "savingUsd": 11,
  "items": [
   {
    "retailer": "chronicle",
    "title": "What the Bees See"
   },
   {
    "retailer": "chronicle",
    "title": "Explorers' Sketchbooks"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-288",
  "department": "books",
  "label": "El par perfecto",
  "genre": "Colección",
  "savingUsd": 11,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Good Energy"
   },
   {
    "retailer": "chronicle",
    "title": "Explorers' Sketchbooks"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-289",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 11,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Frank S. Matsura"
   },
   {
    "retailer": "chronicle",
    "title": "Get Your Sh*t Together"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-290",
  "department": "books",
  "label": "Interiores que inspiran",
  "genre": "Interiores",
  "savingUsd": 9,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Making Space"
   },
   {
    "retailer": "chronicle",
    "title": "Sage Living"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-291",
  "department": "books",
  "label": "El dúo de diseño",
  "genre": "Diseño",
  "savingUsd": 11,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Living Bright"
   },
   {
    "retailer": "chronicle",
    "title": "Boundless Books"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-292",
  "department": "books",
  "label": "El par perfecto",
  "genre": "Colección",
  "savingUsd": 11,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Grit to Grind"
   },
   {
    "retailer": "chronicle",
    "title": "Explorers' Sketchbooks"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-293",
  "department": "books",
  "label": "El par perfecto",
  "genre": "Colección",
  "savingUsd": 10,
  "items": [
   {
    "retailer": "chronicle",
    "title": "The Egyptian Book of the Dead"
   },
   {
    "retailer": "chronicle",
    "title": "Grit to Grind"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-294",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 9,
  "items": [
   {
    "retailer": "chronicle",
    "title": "She Votes"
   },
   {
    "retailer": "chronicle",
    "title": "I Will Never Forget You"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-295",
  "department": "books",
  "label": "El par perfecto",
  "genre": "Colección",
  "savingUsd": 9,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Illustrators Annual 2015"
   },
   {
    "retailer": "chronicle",
    "title": "Allure"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-296",
  "department": "books",
  "label": "El par perfecto",
  "genre": "Colección",
  "savingUsd": 9,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Ramayana"
   },
   {
    "retailer": "chronicle",
    "title": "Illustrators Annual 2015"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-297",
  "department": "books",
  "label": "El dúo de diseño",
  "genre": "Diseño",
  "savingUsd": 10,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Manufractured"
   },
   {
    "retailer": "chronicle",
    "title": "Boundless Books"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-298",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 9,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Heath Ceramics"
   },
   {
    "retailer": "chronicle",
    "title": "She Votes"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-299",
  "department": "books",
  "label": "El par perfecto",
  "genre": "Colección",
  "savingUsd": 9,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Creature"
   },
   {
    "retailer": "chronicle",
    "title": "Illustrators Annual 2015"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-300",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 9,
  "items": [
   {
    "retailer": "chronicle",
    "title": "The Madman's GalleryThe Strangest Paintings, Sculptures and Other Curiosities from the History of Art"
   },
   {
    "retailer": "chronicle",
    "title": "She Votes"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-301",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 9,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Trailblazing Women Printmakers"
   },
   {
    "retailer": "chronicle",
    "title": "She Votes"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-302",
  "department": "books",
  "label": "El par perfecto",
  "genre": "Colección",
  "savingUsd": 9,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Black, Queer, and Untold"
   },
   {
    "retailer": "chronicle",
    "title": "Illustrators Annual 2015"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-303",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 9,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Art Is Art"
   },
   {
    "retailer": "chronicle",
    "title": "She Votes"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-304",
  "department": "books",
  "label": "El par perfecto",
  "genre": "Colección",
  "savingUsd": 9,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Odyssey"
   },
   {
    "retailer": "chronicle",
    "title": "Illustrators Annual 2015"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-305",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 9,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Woodcut"
   },
   {
    "retailer": "chronicle",
    "title": "She Votes"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-306",
  "department": "books",
  "label": "El dúo pop",
  "genre": "Cultura Pop",
  "savingUsd": 9,
  "items": [
   {
    "retailer": "chronicle",
    "title": "LEGO The Art of the Minifigure"
   },
   {
    "retailer": "chronicle",
    "title": "Green: A Field Guide to Marijuana"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-307",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 9,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Activist"
   },
   {
    "retailer": "chronicle",
    "title": "She Votes"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-308",
  "department": "books",
  "label": "El par fotográfico",
  "genre": "Fotografía",
  "savingUsd": 9,
  "items": [
   {
    "retailer": "chronicle",
    "title": "The Black Leopard"
   },
   {
    "retailer": "chronicle",
    "title": "Polaroid Now"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-309",
  "department": "books",
  "label": "El par perfecto",
  "genre": "Colección",
  "savingUsd": 9,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Edward Weston"
   },
   {
    "retailer": "chronicle",
    "title": "Illustrators Annual 2015"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-310",
  "department": "books",
  "label": "El dúo animal",
  "genre": "Mascotas",
  "savingUsd": 8,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Year of the Dogs"
   },
   {
    "retailer": "chronicle",
    "title": "Girls and Their Cats"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-311",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 9,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Stargazing"
   },
   {
    "retailer": "chronicle",
    "title": "She Votes"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-312",
  "department": "books",
  "label": "El dúo musical",
  "genre": "Música",
  "savingUsd": 10,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Beck"
   },
   {
    "retailer": "chronicle",
    "title": "The Beatles by Jim Marshall"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-313",
  "department": "books",
  "label": "El par perfecto",
  "genre": "Colección",
  "savingUsd": 9,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Building Culture"
   },
   {
    "retailer": "chronicle",
    "title": "Illustrators Annual 2015"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-314",
  "department": "books",
  "label": "El par fotográfico",
  "genre": "Fotografía",
  "savingUsd": 9,
  "items": [
   {
    "retailer": "chronicle",
    "title": "A Fearless Eye: The Photography of Barbara Ramos"
   },
   {
    "retailer": "chronicle",
    "title": "The Black Leopard"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-315",
  "department": "books",
  "label": "El par perfecto",
  "genre": "Colección",
  "savingUsd": 9,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Gorgeous Gatherings"
   },
   {
    "retailer": "chronicle",
    "title": "She Votes"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-316",
  "department": "books",
  "label": "Arquitectura en dos tomos",
  "genre": "Arquitectura",
  "savingUsd": 10,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Margin and Text"
   },
   {
    "retailer": "chronicle",
    "title": "How Design Makes Us Think PB"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-317",
  "department": "books",
  "label": "El dúo de moda",
  "genre": "Moda",
  "savingUsd": 9,
  "items": [
   {
    "retailer": "chronicle",
    "title": "How to Wear Everything"
   },
   {
    "retailer": "chronicle",
    "title": "Vintage Wedding Style"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-318",
  "department": "books",
  "label": "El dúo pop",
  "genre": "Cultura Pop",
  "savingUsd": 9,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Threads of Triumph"
   },
   {
    "retailer": "chronicle",
    "title": "LEGO The Art of the Minifigure"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-319",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 9,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Bibliophile Ceramic Vase: A Compendium of Flowers"
   },
   {
    "retailer": "chronicle",
    "title": "She Votes"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-320",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 9,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Guerrilla Girls: The Art of Behaving Badly"
   },
   {
    "retailer": "chronicle",
    "title": "Transcendence"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-321",
  "department": "books",
  "label": "El dúo pop",
  "genre": "Cultura Pop",
  "savingUsd": 9,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Disney/Pixar The Color of Pixar"
   },
   {
    "retailer": "chronicle",
    "title": "LEGO The Art of the Minifigure"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-322",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 9,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Julia Morgan: An Intimate Biography of the Trailblazing Architec,"
   },
   {
    "retailer": "chronicle",
    "title": "Guerrilla Girls: The Art of Behaving Badly"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-323",
  "department": "books",
  "label": "El par fotográfico",
  "genre": "Fotografía",
  "savingUsd": 9,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Forest"
   },
   {
    "retailer": "chronicle",
    "title": "Cut in Half"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-324",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 8,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Pride Atlas"
   },
   {
    "retailer": "chronicle",
    "title": "The Secret Garden"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-325",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 8,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Color Curious"
   },
   {
    "retailer": "chronicle",
    "title": "Pride Atlas"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-326",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 8,
  "items": [
   {
    "retailer": "chronicle",
    "title": "#1960Now"
   },
   {
    "retailer": "chronicle",
    "title": "Pride Atlas"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-327",
  "department": "books",
  "label": "El dúo pop",
  "genre": "Cultura Pop",
  "savingUsd": 8,
  "items": [
   {
    "retailer": "chronicle",
    "title": "LEGO In Focus"
   },
   {
    "retailer": "chronicle",
    "title": "Pop Trash"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-328",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 8,
  "items": [
   {
    "retailer": "chronicle",
    "title": "The Rainbow Atlas"
   },
   {
    "retailer": "chronicle",
    "title": "Pride Atlas"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-329",
  "department": "books",
  "label": "El par fotográfico",
  "genre": "Fotografía",
  "savingUsd": 8,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Dream Baby Dream"
   },
   {
    "retailer": "chronicle",
    "title": "The Rainbow Home"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-330",
  "department": "books",
  "label": "Interiores que inspiran",
  "genre": "Interiores",
  "savingUsd": 8,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Sage Living"
   },
   {
    "retailer": "chronicle",
    "title": "The Novogratz Chronicles"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-331",
  "department": "books",
  "label": "El par perfecto",
  "genre": "Colección",
  "savingUsd": 8,
  "items": [
   {
    "retailer": "chronicle",
    "title": "The Witch's Door"
   },
   {
    "retailer": "chronicle",
    "title": "The Pandemic Effect"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-332",
  "department": "books",
  "label": "El dúo de moda",
  "genre": "Moda",
  "savingUsd": 8,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Vintage Wedding Style"
   },
   {
    "retailer": "chronicle",
    "title": "Bobbi Brown Pretty Powerful"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-333",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 8,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Dream in Color: 30 Posters of Power by 30 Black Creatives"
   },
   {
    "retailer": "chronicle",
    "title": "Everything She Touched"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-334",
  "department": "books",
  "label": "El par perfecto",
  "genre": "Colección",
  "savingUsd": 8,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Lulu"
   },
   {
    "retailer": "chronicle",
    "title": "Bright Ideas Double-Ended Colored Brush Pens"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-335",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 8,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Bibliophile"
   },
   {
    "retailer": "chronicle",
    "title": "Dream in Color: 30 Posters of Power by 30 Black Creatives"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-336",
  "department": "books",
  "label": "El dúo pop",
  "genre": "Cultura Pop",
  "savingUsd": 8,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Pop Trash"
   },
   {
    "retailer": "chronicle",
    "title": "Queer Power Couples"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-337",
  "department": "books",
  "label": "El par perfecto",
  "genre": "Colección",
  "savingUsd": 8,
  "items": [
   {
    "retailer": "chronicle",
    "title": "An Atlas of Countries That Don't Exist"
   },
   {
    "retailer": "chronicle",
    "title": "Dream in Color: 30 Posters of Power by 30 Black Creatives"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-338",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 8,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Portrait of a Woman"
   },
   {
    "retailer": "chronicle",
    "title": "Dream in Color: 30 Posters of Power by 30 Black Creatives"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-339",
  "department": "books",
  "label": "El par fotográfico",
  "genre": "Fotografía",
  "savingUsd": 8,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Film Camera Zen"
   },
   {
    "retailer": "chronicle",
    "title": "Sante D?Orazio: Polaroids"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-340",
  "department": "books",
  "label": "El dúo de diseño",
  "genre": "Diseño",
  "savingUsd": 8,
  "items": [
   {
    "retailer": "chronicle",
    "title": "The Ohno Book"
   },
   {
    "retailer": "chronicle",
    "title": "Thinking with Type"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-341",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 8,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Bending the Rules"
   },
   {
    "retailer": "chronicle",
    "title": "Dream in Color: 30 Posters of Power by 30 Black Creatives"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-342",
  "department": "books",
  "label": "Arquitectura en dos tomos",
  "genre": "Arquitectura",
  "savingUsd": 8,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Design Dreams"
   },
   {
    "retailer": "chronicle",
    "title": "Extraordinary Pools"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-343",
  "department": "books",
  "label": "El par fotográfico",
  "genre": "Fotografía",
  "savingUsd": 8,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Still Life"
   },
   {
    "retailer": "chronicle",
    "title": "Film Camera Zen"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-344",
  "department": "books",
  "label": "El par fotográfico",
  "genre": "Fotografía",
  "savingUsd": 8,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Locals Only: 30 Posters"
   },
   {
    "retailer": "chronicle",
    "title": "Film Camera Zen"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-345",
  "department": "books",
  "label": "El par perfecto",
  "genre": "Colección",
  "savingUsd": 8,
  "items": [
   {
    "retailer": "chronicle",
    "title": "The Rules We Break"
   },
   {
    "retailer": "chronicle",
    "title": "Lulu"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-346",
  "department": "books",
  "label": "El par perfecto",
  "genre": "Colección",
  "savingUsd": 8,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Holding Space"
   },
   {
    "retailer": "chronicle",
    "title": "Lulu"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-347",
  "department": "books",
  "label": "El dúo de diseño",
  "genre": "Diseño",
  "savingUsd": 8,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Big Data  Big Design"
   },
   {
    "retailer": "chronicle",
    "title": "The Ohno Book"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-348",
  "department": "books",
  "label": "El dúo de diseño",
  "genre": "Diseño",
  "savingUsd": 8,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Extra Bold"
   },
   {
    "retailer": "chronicle",
    "title": "The Ohno Book"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-349",
  "department": "books",
  "label": "El par perfecto",
  "genre": "Colección",
  "savingUsd": 8,
  "items": [
   {
    "retailer": "chronicle",
    "title": "The Wild Horse Effect"
   },
   {
    "retailer": "chronicle",
    "title": "Lulu"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-350",
  "department": "books",
  "label": "El dúo de diseño",
  "genre": "Diseño",
  "savingUsd": 8,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Palace Costume"
   },
   {
    "retailer": "chronicle",
    "title": "The Ohno Book"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-351",
  "department": "books",
  "label": "Arquitectura en dos tomos",
  "genre": "Arquitectura",
  "savingUsd": 8,
  "items": [
   {
    "retailer": "chronicle",
    "title": "The Greening of America's Building Codes"
   },
   {
    "retailer": "chronicle",
    "title": "Design Dreams"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-352",
  "department": "books",
  "label": "Interiores que inspiran",
  "genre": "Interiores",
  "savingUsd": 8,
  "items": [
   {
    "retailer": "chronicle",
    "title": "The Novogratz Chronicles"
   },
   {
    "retailer": "chronicle",
    "title": "Furniture Makes the Room"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-353",
  "department": "books",
  "label": "El par perfecto",
  "genre": "Colección",
  "savingUsd": 7,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Heirloomist"
   },
   {
    "retailer": "chronicle",
    "title": "Dressing the Resistance"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-354",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 7,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Footnotes from the Most Fascinating Museums"
   },
   {
    "retailer": "chronicle",
    "title": "Sense of Shifting"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-355",
  "department": "books",
  "label": "El dúo de diseño",
  "genre": "Diseño",
  "savingUsd": 7,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Centered"
   },
   {
    "retailer": "chronicle",
    "title": "HERE"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-356",
  "department": "books",
  "label": "El par perfecto",
  "genre": "Colección",
  "savingUsd": 7,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Baseline Shift"
   },
   {
    "retailer": "chronicle",
    "title": "Heirloomist"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-357",
  "department": "books",
  "label": "El par perfecto",
  "genre": "Colección",
  "savingUsd": 7,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Sweet Pea School"
   },
   {
    "retailer": "chronicle",
    "title": "Footnotes from the Most Fascinating Museums"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-358",
  "department": "books",
  "label": "El dúo pop",
  "genre": "Cultura Pop",
  "savingUsd": 7,
  "items": [
   {
    "retailer": "chronicle",
    "title": "A Cloud a Day"
   },
   {
    "retailer": "chronicle",
    "title": "Every Person in New York"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-359",
  "department": "books",
  "label": "El par perfecto",
  "genre": "Colección",
  "savingUsd": 7,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Griffin and Sabine 25th Anniversary Edition"
   },
   {
    "retailer": "chronicle",
    "title": "Bright Ideas Deluxe Colored Pencil Set"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-360",
  "department": "books",
  "label": "Interiores que inspiran",
  "genre": "Interiores",
  "savingUsd": 7,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Book Nooks"
   },
   {
    "retailer": "chronicle",
    "title": "Furniture Makes the Room"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-361",
  "department": "books",
  "label": "El par creativo",
  "genre": "Manualidades",
  "savingUsd": 7,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Tuft the World"
   },
   {
    "retailer": "chronicle",
    "title": "Well Worn"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-362",
  "department": "books",
  "label": "El par perfecto",
  "genre": "Colección",
  "savingUsd": 7,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Wear It Well"
   },
   {
    "retailer": "chronicle",
    "title": "Griffin and Sabine 25th Anniversary Edition"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-363",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 7,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Get Your Sh*t Together"
   },
   {
    "retailer": "chronicle",
    "title": "Things to Look Forward To"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-364",
  "department": "books",
  "label": "El par fotográfico",
  "genre": "Fotografía",
  "savingUsd": 7,
  "items": [
   {
    "retailer": "chronicle",
    "title": "200 Women"
   },
   {
    "retailer": "chronicle",
    "title": "Caption This"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-365",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 7,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Things to Look Forward To"
   },
   {
    "retailer": "chronicle",
    "title": "Arte Popular"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-366",
  "department": "books",
  "label": "El par perfecto",
  "genre": "Colección",
  "savingUsd": 7,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Birds & Words"
   },
   {
    "retailer": "chronicle",
    "title": "A Tree a Day"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-367",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 7,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Mid-Century Modern Women in the Visual Arts"
   },
   {
    "retailer": "chronicle",
    "title": "Things to Look Forward To"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-368",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 7,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Ai Weiwei: Yours Truly"
   },
   {
    "retailer": "chronicle",
    "title": "Things to Look Forward To"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-369",
  "department": "books",
  "label": "El dúo pop",
  "genre": "Cultura Pop",
  "savingUsd": 7,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Disney/Pixar The Art of Sanjay's Super Team"
   },
   {
    "retailer": "chronicle",
    "title": "Behind the Screens"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-370",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 7,
  "items": [
   {
    "retailer": "chronicle",
    "title": "China Days"
   },
   {
    "retailer": "chronicle",
    "title": "Things to Look Forward To"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-371",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 7,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Remake"
   },
   {
    "retailer": "chronicle",
    "title": "Things to Look Forward To"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-372",
  "department": "books",
  "label": "El dúo de diseño",
  "genre": "Diseño",
  "savingUsd": 7,
  "items": [
   {
    "retailer": "chronicle",
    "title": "See for Yourself"
   },
   {
    "retailer": "chronicle",
    "title": "Design Against Racism"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-373",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 7,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Young Queer America"
   },
   {
    "retailer": "chronicle",
    "title": "Things to Look Forward To"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-374",
  "department": "books",
  "label": "El par fotográfico",
  "genre": "Fotografía",
  "savingUsd": 7,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Caption This"
   },
   {
    "retailer": "chronicle",
    "title": "Beautiful Bugs"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-375",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 7,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Hell"
   },
   {
    "retailer": "chronicle",
    "title": "Things to Look Forward To"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-376",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 7,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Tarot for Creativity"
   },
   {
    "retailer": "chronicle",
    "title": "Things to Look Forward To"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-377",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 7,
  "items": [
   {
    "retailer": "chronicle",
    "title": "A Short History of Black Craft in Ten Objects"
   },
   {
    "retailer": "chronicle",
    "title": "Things to Look Forward To"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-378",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 7,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Everything She Touched"
   },
   {
    "retailer": "chronicle",
    "title": "Things to Look Forward To"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-379",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 7,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Creative Collage"
   },
   {
    "retailer": "chronicle",
    "title": "Things to Look Forward To"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-380",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 7,
  "items": [
   {
    "retailer": "chronicle",
    "title": "The Collage Compendium"
   },
   {
    "retailer": "chronicle",
    "title": "Things to Look Forward To"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-381",
  "department": "books",
  "label": "El par fotográfico",
  "genre": "Fotografía",
  "savingUsd": 7,
  "items": [
   {
    "retailer": "chronicle",
    "title": "You Are Here: Hikes"
   },
   {
    "retailer": "chronicle",
    "title": "Caption This"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-382",
  "department": "books",
  "label": "El dúo de moda",
  "genre": "Moda",
  "savingUsd": 7,
  "items": [
   {
    "retailer": "chronicle",
    "title": "My Beautiful Black Hair"
   },
   {
    "retailer": "chronicle",
    "title": "Bobbi Brown Pretty Powerful"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-383",
  "department": "books",
  "label": "El par fotográfico",
  "genre": "Fotografía",
  "savingUsd": 7,
  "items": [
   {
    "retailer": "chronicle",
    "title": "The Stahl House: Case Study House u22"
   },
   {
    "retailer": "chronicle",
    "title": "Caption This"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-384",
  "department": "books",
  "label": "El par perfecto",
  "genre": "Colección",
  "savingUsd": 7,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Distant Shores"
   },
   {
    "retailer": "chronicle",
    "title": "Birds & Words"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-385",
  "department": "books",
  "label": "El par perfecto",
  "genre": "Colección",
  "savingUsd": 7,
  "items": [
   {
    "retailer": "chronicle",
    "title": "In Wildness"
   },
   {
    "retailer": "chronicle",
    "title": "Birds & Words"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-386",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 7,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Chinatown Pretty"
   },
   {
    "retailer": "chronicle",
    "title": "Things to Look Forward To"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-387",
  "department": "books",
  "label": "El par fotográfico",
  "genre": "Fotografía",
  "savingUsd": 7,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Wild Babies"
   },
   {
    "retailer": "chronicle",
    "title": "Caption This"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-388",
  "department": "books",
  "label": "El par fotográfico",
  "genre": "Fotografía",
  "savingUsd": 7,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Seeing Beyond Sight"
   },
   {
    "retailer": "chronicle",
    "title": "Caption This"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-389",
  "department": "books",
  "label": "Interiores que inspiran",
  "genre": "Interiores",
  "savingUsd": 7,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Home Style by City"
   },
   {
    "retailer": "chronicle",
    "title": "Book Nooks"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-390",
  "department": "books",
  "label": "Arquitectura en dos tomos",
  "genre": "Arquitectura",
  "savingUsd": 7,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Black, Brown + Latinx Design Educators"
   },
   {
    "retailer": "chronicle",
    "title": "An Architect's Pencil Set"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-391",
  "department": "books",
  "label": "El par perfecto",
  "genre": "Colección",
  "savingUsd": 7,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Shopkeeping"
   },
   {
    "retailer": "chronicle",
    "title": "Birds & Words"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-392",
  "department": "books",
  "label": "El par creativo",
  "genre": "Manualidades",
  "savingUsd": 7,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Knitting by Design"
   },
   {
    "retailer": "chronicle",
    "title": "Crafting for Your Cat"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-393",
  "department": "books",
  "label": "Dos clásicos del arte",
  "genre": "Arte",
  "savingUsd": 7,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Style Legends, Rebels, and Visionaries"
   },
   {
    "retailer": "chronicle",
    "title": "Things to Look Forward To"
   }
  ]
 },
 {
  "id": "combo-books-chronicle-394",
  "department": "books",
  "label": "El par perfecto",
  "genre": "Colección",
  "savingUsd": 7,
  "items": [
   {
    "retailer": "chronicle",
    "title": "Fry's Ties"
   },
   {
    "retailer": "chronicle",
    "title": "Birds & Words"
   }
  ]
 }
];
