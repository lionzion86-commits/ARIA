# Drones: reconciliación del catálogo con el estante (2026-11-02)

#443 c.6583248088. Danny, en el preview de #610: el estante Drones mostraba **246**. Lucifer contó **310** drones en los catálogos (B&H 197, Walmart 63, Best Buy 36, BrandsMart 11, Costco 2, Micro Center 1; más 12 accesorios para drones). Este informe sigue cada dron de los catálogos versionados (origin/main 5af3b82) hasta el estante y da la regla exacta que deja fuera a cualquiera que no llega.

**Qué cuenta como dron.** El nombre del producto lo dice (`isDrone`, scripts/lib/tech-aisle.js) o la tienda le pone el tipo de dron (B&H "Dron", Walmart "Aerial Drones", Best Buy "Drones"). Se sacan duplicados por tienda + URL. Fuentes: los archivos que lee scripts/build-department-slices.mjs, más bestbuy-catalog.json.

## Totales

| Tienda | Drones en el catálogo | En el estante | Fuera de venta | Mismo título | Conteo de Lucifer |
|---|---:|---:|---:|---:|---:|
| B&H Photo | 199 | 196 | 0 | 3 | 197 |
| Walmart | 61 | 60 | 0 | 1 | 63 |
| Best Buy | 37 | 0 | 37 | 0 | 36 |
| BrandsMart USA | 9 | 9 | 0 | 0 | 11 |
| Costco | 3 | 3 | 0 | 0 | 2 |
| Micro Center | 0 | 0 | 0 | 0 | 1 |
| **Total** | **309** | **268** | **37** | **4** | **310** (+12 accesorios) |

268 + 37 + 4 = 309 drones en los catálogos. Accesorios para drones (hélices, baterías, bolsos para un DJI): **0** en los catálogos versionados, así que no hay ninguno que sumar (ver la sección "Diferencias con el conteo de Lucifer").

## De 246 a 268

| | |
|---|---:|
| Estante antes (preview de #610) | 246 |
| menos 7 que no son drones (abajo): una cámara de seguridad de Walmart y 6 productos de Costco de su categoría "cameras-drones" | -7 |
| = drones que ya estaban en el estante | 239 |
| más 28 drones de B&H con tipo "Dron" cuyo nombre es solo el modelo (HOVERAir X1 ×24, ACSL SOTEN ×3, FREEFLY Alta X ×1) | +28 |
| más 1 dron de Costco: HOVERAir X1 PROMAX (estaba en Cámaras) | +1 |
| **Estante ahora** | **268** |

Cuadra: 239 + 28 + 1 = 268.

## Reglas que dejaban drones fuera, y qué cambió

1. **isDrone no reconocía el nombre** (28 de B&H, 1 de Costco). HOVERAir X1 PRO / PROMAX (una cámara voladora: un dron), ACSL SOTEN y FREEFLY Alta X no dicen "drone" en el nombre. B&H les pone el tipo "Dron", pero el pasillo se decidía solo por el nombre, así que terminaban en Accesorios (B&H) o Cámaras (Costco). **Arreglo:** `DRONE_RX` ahora reconoce hoverair / self-flying camera / acsl soten / freefly alta / vcopter; `isDroneProduct(p)` también cree en el tipo de dron que pone la tienda ("Dron", "Drones", "Aerial Drones"); los filtros de merch y de cámaras de seguridad siguen aplicando. El builder (`build-department-slices.mjs`) y `techAisleOf` (`_department-core.js`) usan `isDroneProduct`.
2. **Productos que no son drones en el estante** (7). Walmart "AMGRA Mini Wireless Security Camera ... for Home, Car, **Drone**, Office": la palabra drone describe dónde se puede poner, no lo que es el producto. **Arreglo:** `NOT_DRONE_RX` saca security cam / nanny cam / spy cam / dash cam; ahora va a Casa inteligente. Los 6 de Costco (dos luces de seguridad, dos kits de seguridad Ring, una cámara para auto y cuerpo, film Polaroid) entraban porque su categoría "cameras-drones" tenía la palabra "drone": `techAisle` mandaba a Drones cualquier categoría que incluyera "drone". **Arreglo:** esa pista ahora solo cuenta cuando la categoría es un tipo de dron; "cameras-drones" se lee como cámaras, y las luces y kits de seguridad van a Casa inteligente.
3. **Sin precio, sin foto, stock, reacondicionado, "no se vende", archivo sin leer:** ningún dron de los catálogos queda fuera por estas razones. Todos los del estante tienen precio y foto (lo comprueba la prueba).

## Fuera, con su motivo

### Best Buy: fuera de venta a propósito (37)

Best Buy está fuera de venta (/off-sale.js `isOffSaleRetailer`) y así se queda: ninguno de sus productos llega a ninguna página.

- Snaptain - P40 LITE 3-Axis Gimbal Camera Drone Bundle - Gray (US$499.99)
- Snaptain - P40 LITE 3-Axis Gimbal Camera Drone - Gray (US$389.99)
- Snaptain - K30 Mini 720P HD Camera Drone with Colorful Lighting and Remote Controller - White (US$69.99)
- Antigravity - A1 8K 360 Remote Control Drone - Infinity Bundle - White (US$1599)
- SKYROVER - X1 Fly More Combo 8K Drone with Remote Controller - Gray (US$579)
- SKYROVER - X1 Fly More Combo 8K Drone Bundle with Remote Screen Controller - Gray (US$749)
- Antigravity - A1 8K 360 Remote Control Drone - Standard Bundle - Under 249g - White (US$1199)
- Snaptain - S5C Ultra 1080p Camera Drone with Remote Controller - Gray (US$149.99)
- Antigravity - A1 8K 360 Remote Control Drone - Explorer Bundle - Under 249g - White (US$1519)
- SKYROVER - S1 Fly More Combo 8K Drone with Remote Controller - White (US$359)
- SKYROVER - S1 Fly More Combo 8K Drone Bundle with Remote Screen Controller - White (US$549)
- DJI - Flip Fly More Combo (DJI RC 2) (GL) (US$619)
- DJI - Flip Drone (DJI Remote Control 2) (GL) (US$509)
- DJI - Mini 3 Fly More Combo (DJI RC) (GL) - Gray (US$719.99)
- DJI - Mini 3 (DJI RC) (GL) - Gray (US$549.99)
- Snaptain - S5C Elite 1080p Drone with Remote Controller - Black (US$99.99)
- Contixo - F28 Stratus 2K GPS Drone with Intelligent Flight Modes, 26-Min Flight, Brushless Motors & Carrying Case - Silver (US$159.99)
- Snaptain - P30 Pro 4K Camera GPS Drone and Remote Controller - Gray (US$299.99)
- Contixo - F19 Arvo Foldable Drone with 1080P HD Camera, FPV, Obstacle Avoidance, 2 Batteries, Brushless Motors & LED Lights - Silver (US$59.99)
- Contixo - F33 Vortex 4K GPS Drone with 2-Axis Gimbal, 6KM Range, 40-Min Flight, 5.5" HD Screen & Brushless Motor - Dark Gray (US$799.99)
- Contixo - F28 Stratus Max 4K GPS Drone with Intelligent Flight Modes, 26-Min Flight, Brushless Motors & Carrying Case - Gray (US$279.99)
- Contixo - F29 Altura Max 4K GPS Drone with 3-Axis Gimbal, 5" Screen Remote, 3KM Range, 23-Min Flight, No FAA Needed - Dark Gray (US$499.99)
- DJI - Mini 5 Pro Fly More Combo Plus (DJI RC2) - Black (US$1159)
- HOVERAir - X1 PROMAX Retail Combo - Black (US$779.99)
- HOVERAir - X1 Self-Flying Camera Drone Combo - Black (US$299.99)
- Snaptain - P10 4K Camera Drone with Remote Controller - Gray (US$229.99)
- Vivitar - SkyTrek Drone - Gray (US$99.99)
- Vivitar - SkyHawk Drone - Gray (US$149.99)
- DJI - Neo 2 Fly More Combo (US$429)
- Potensic - ATOM 2 Fly More Combo Drone with Remote Controller PTD 1 - Gray (US$599.99)
- DJI - Neo 2 Drone Motion Fly More Combo (US$599)
- DJI - Air 3S Drone Fly More Combo (DJI RC 2) (US$1599.99)
- DJI - Avata 360 Drone Fly More Combo (DJI RC 2) (US$979)
- VCOPTER - Falcon Mini Fly More Combo - Black (US$449.99)
- Potensic - ATOM Fly More Combo Drone with Remote Controller - Gray (US$349.99)
- HOVERAir - X1 PRO Retail Combo - Black (US$679.99)
- Potensic - ATOM 2 Standard Drone Kit with Remote Controller PTD 1 - Gray (US$479.99)

### Segunda ficha con el mismo título en la misma tienda (4)

La página de producto se identifica por tienda + título (`producto.html?producto=<título>`), así que una segunda ficha con exactamente el mismo título no tiene página propia: su tarjeta abriría la primera. Se muestra la primera ficha y la segunda queda fuera (`loadAllItems`: tienda + título, gana la primera). Son productos distintos según la URL de la tienda; la pregunta para Danny está abajo.

| Tienda | Título (se muestra la primera ficha) | Ficha que queda fuera |
|---|---|---|
| B&H Photo | EMAX Hawk Apex 5" HDZero Ultralight Racing Drone (PNP) | US$429.99, https://www.bhphotovideo.com/c/product/1832946-REG/emax_hapex54spnp_hawk_apex_5_hdzero.html |
| B&H Photo | EMAX Hawk Apex 5" HDZero Ultralight Racing Drone (BNF) | US$439.99, https://www.bhphotovideo.com/c/product/1832945-REG/emax_hapex54sbnf_hawk_apex_5_hdzero.html |
| B&H Photo | DJI Mavic 3 Thermal | US$6799, https://www.bhphotovideo.com/c/product/1959232-REG/dji_cp_en_00000415_07_mavic_3_thermal_universal.html |
| Walmart | SPAN LINK Drone with 4K HD Dual Camera for Adults Kids, RC Quadcopter with 2 Modular 1800mAh Batteries for 30 Mins Long Flight | US$35.99, https://www.walmart.com/ip/SPAN-LINK-Drone-with-4K-HD-Dual-Camera-for-Adults-Kids-RC-Quadcopter-with-2-Modular-1800mAh-Batteries-for-30-Mins-Long-Flight/20890152824 |

### No son drones: salieron del estante (7)

| Tienda | Producto | Ahora en |
|---|---|---|
| Walmart | AMGRA Mini Wireless Security Camera, Full HD 1080P Portable Small HD Nanny Cam ... for Home, Car, Drone, Office and Outdoor Use | Casa inteligente y seguridad |
| Costco | KODA Hardwire Motion Activated LED Security Floodlight | Casa inteligente y seguridad |
| Costco | Lutec Motion Activated Solar Security LED Light | Casa inteligente y seguridad |
| Costco | Ring 9-piece Security Kit | Casa inteligente y seguridad |
| Costco | Ring 14-piece Security Kit | Casa inteligente y seguridad |
| Costco | Type S Mini 4K Dash & Body Cam | Cámaras |
| Costco | Polaroid Go Color Film, 5-pack | Cámaras |

## Diferencias con el conteo de Lucifer

- **B&H 199 contra 197.** Lucifer contó el tipo "Dron" (197). Otros 2 drones de B&H tienen el tipo "Objetivo" pero el nombre dice que son drones: "ANTIGRAVITY A1 8K 360 Drone Standard Bundle with Lens & Propeller Guard Kit" y "DJI Inspire 3 Drone with PROSSD 1TB Storage & 18mm Lens Kit". Los dos ya estaban en el estante.
- **Walmart 61 contra 63.** 60 con tipo "Aerial Drones" más "Aimlovs Mini Drone for Kids" (tipo "Radio Control Helicopters"). Ningún otro producto de Walmart, en ningún archivo (walmart-electronics, department-cache-walmart, juguetes), es un dron por nombre o por tipo. El "dron" número 62 de una lectura por palabras es la cámara de seguridad AMGRA, que no es un dron.
- **Best Buy 37 contra 36.** 35 con tipo "Drones" más 2 con tipo "Cámaras" cuyo nombre dice que son drones (DJI Mini 3 Fly More Combo, DJI Air 3S Drone Fly More Combo). Todos están fuera de venta.
- **BrandsMart 9 contra 11.** Revisé todos los productos de BrandsMart de DJI, Potensic, Vivitar y cualquier marca de drones: hay 9 drones. Los demás de DJI son cámaras Osmo, micrófonos Mic y gimbals.
- **Costco 3 contra 2.** Se suma el HOVERAir X1 PROMAX 8K Self-Flying Camera Bundle: es un dron.
- **Micro Center 0 contra 1.** microcenter-catalog.json no tiene ningún dron, ni por nombre, tipo ni marca, y tampoco aparece en el feed de Ofertas ni en los informes de electronics-drops.
- **Accesorios 0 contra 12.** Ningún catálogo versionado tiene un accesorio para drones (hélices, baterías, bolsos, filtros, protectores "for DJI/Mavic/Mini"). Si Lucifer contó de una descarga más nueva que la de main, hay que versionar esos archivos primero.

## Lista línea por línea (309)

Estado antes = dónde estaba en el preview de #610.

| # | Tienda | Producto | Tipo de la tienda | US$ | Antes | Ahora |
|---:|---|---|---|---:|---|---|
| 1 | B&H Photo | DJI Mavic 4 Pro Drone with Fly More Combo | Dron | 2899 | estante | En el estante |
| 2 | B&H Photo | DJI Air 3S Drone with RC 2 Fly More Combo | Dron | 1599 | estante | En el estante |
| 3 | B&H Photo | DJI Mini 5 Pro Drone with RC2 Fly More Combo Plus | Dron | 1159 | estante | En el estante |
| 4 | B&H Photo | DJI Mini 5 Pro Drone with RC2 Fly More Combo | Dron | 1099 | estante | En el estante |
| 5 | B&H Photo | DJI Mini 5 Pro Camera Drone Bundle with RC2 | Dron | 999 | estante | En el estante |
| 6 | B&H Photo | DJI Mavic 4 Pro Drone with 512GB Creator Combo | Dron | 3999 | estante | En el estante |
| 7 | B&H Photo | DJI Mini 4K Drone | Dron | 299 | estante | En el estante |
| 8 | B&H Photo | DJI Mini 3 Drone with RC-N1 Remote | Dron | 419 | estante | En el estante |
| 9 | B&H Photo | DJI Mavic 4 Pro Drone | Dron | 2199 | estante | En el estante |
| 10 | B&H Photo | DJI Avata 2 FPV Drone with Goggles 3 & 3-Battery Fly More Combo | Dron | 1019 | estante | En el estante |
| 11 | B&H Photo | DJI Neo 2 Drone Fly More Combo | Dron | 429 | estante | En el estante |
| 12 | B&H Photo | DJI Mini 5 Pro Drone with RC-N3 | Dron | 759 | estante | En el estante |
| 13 | B&H Photo | DJI Mini 4 Pro Drone with RC 2 Controller & Charging Hub | Dron | 1179 | estante | En el estante |
| 14 | B&H Photo | DJI Mini 4K Drone Fly More Combo | Dron | 449 | estante | En el estante |
| 15 | B&H Photo | DJI Mini 3 Drone with DJI RC Remote (Fly More Combo) | Dron | 669.49 | estante | En el estante |
| 16 | B&H Photo | DJI Mini 5 Pro Camera Drone Bundle with Hard-Shell Case Kit | Dron | 1118.5 | estante | En el estante |
| 17 | B&H Photo | DJI Neo 2 Fly More Combo (Drone Only) | Dron | 349 | estante | En el estante |
| 18 | B&H Photo | DJI Neo 2 Drone Motion Fly More Combo | Dron | 599 | estante | En el estante |
| 19 | B&H Photo | DJI Mini 3 Drone with DJI RC Remote | Dron | 545 | estante | En el estante |
| 20 | B&H Photo | DJI Avata 360 Motion Fly More Combo | Dron | 979 | estante | En el estante |
| 21 | B&H Photo | DJI Neo 2 (Drone Only) | Dron | 259 | estante | En el estante |
| 22 | B&H Photo | DJI Neo Drone Fly More Combo (RC-N3) | Dron | 295 | estante | En el estante |
| 23 | B&H Photo | DJI Avata 360 Fly More Combo with RC 2 | Dron | 979 | estante | En el estante |
| 24 | B&H Photo | DJI Air 3S Drone with RC-N3 | Dron | 1099 | estante | En el estante |
| 25 | B&H Photo | SKYROVER X1 Drone Fly More Combo with Remote Screen Controller (Yellow) | Dron | 699 | estante | En el estante |
| 26 | B&H Photo | DJI Flip Drone (RC 2 with Fly More Combo) | Dron | 779 | estante | En el estante |
| 27 | B&H Photo | DJI Neo Drone (No Remote) | Dron | 169 | estante | En el estante |
| 28 | B&H Photo | DJI Air 3S Drone with RC-N3 Fly More Combo | Dron | 1399 | estante | En el estante |
| 29 | B&H Photo | DJI Matrice 4T Drone | Dron | 7849 | estante | En el estante |
| 30 | B&H Photo | DJI Inspire 3 Drone Standard Combo | Dron | 8499 | estante | En el estante |
| 31 | B&H Photo | DJI Air 3S Drone with RC 2 Fly More Combo & Nanuk 920 Case Kit | Dron | 1778.95 | estante | En el estante |
| 32 | B&H Photo | DJI Mini 5 Pro Drone with RC-N3 Fly More Combo | Dron | 959 | estante | En el estante |
| 33 | B&H Photo | DJI Flip Drone (RC-N3) | Dron | 439 | estante | En el estante |
| 34 | B&H Photo | DJI Matrice 4E Drone | Dron | 5499 | estante | En el estante |
| 35 | B&H Photo | SKYROVER S1 Drone Combo (White) | Dron | 319 | estante | En el estante |
| 36 | B&H Photo | DJI Mini 4 Pro Drone with RC 2 & Travel Case Kit | Dron | 1399.99 | estante | En el estante |
| 37 | B&H Photo | DJI Flip Drone (Special Bundle) | Dron | 599 | estante | En el estante |
| 38 | B&H Photo | DJI Avata 2 FPV Drone with Goggles N3 & 3-Battery Fly Smart Combo | Dron | 815.2 | estante | En el estante |
| 39 | B&H Photo | SKYROVER X1 Drone Combo (Yellow) | Dron | 449 | estante | En el estante |
| 40 | B&H Photo | DJI Neo Drone Motion Fly More Combo (RC Motion 3) | Dron | 449 | estante | En el estante |
| 41 | B&H Photo | DJI Avata 2 FPV Drone with Goggles N3 & 1-Battery Fly Smart Combo | Dron | 679.2 | estante | En el estante |
| 42 | B&H Photo | DJI Mavic 3 Enterprise | Dron | 5499 | estante | En el estante |
| 43 | B&H Photo | SKYROVER X1 Drone Combo (Gray) | Dron | 449 | estante | En el estante |
| 44 | B&H Photo | SKYROVER S1 Drone Fly More Combo with Remote Screen Controller (White) | Dron | 519 | estante | En el estante |
| 45 | B&H Photo | DJI Flip Drone (RC 2) | Dron | 639 | estante | En el estante |
| 46 | B&H Photo | DJI Avata 2 FPV Drone with Goggles 3 & 1-Battery Fly More Combo | Dron | 849 | estante | En el estante |
| 47 | B&H Photo | ANTIGRAVITY A1 8K 360 Drone Infinity Bundle | Dron | 1999 | estante | En el estante |
| 48 | B&H Photo | EMAX Tinyhawk III FPV Racing Drone with E8 Controller & T2 FPV Goggles (RTF) | Dron | 259.99 | estante | En el estante |
| 49 | B&H Photo | Potensic ATOM 2 Drone (Fly More Combo) | Dron | 439.99 | estante | En el estante |
| 50 | B&H Photo | SKYROVER X1 Drone Fly More Combo with Remote Screen Controller (Gray) | Dron | 699 | estante | En el estante |
| 51 | B&H Photo | DJI Avata 360 with RC 2 | Dron | 719 | estante | En el estante |
| 52 | B&H Photo | DJI Mavic 3M Multispectral Drone | Dron | 5729 | estante | En el estante |
| 53 | B&H Photo | ANTIGRAVITY A1 8K 360 Drone with Protection Kit (Infinity Bundle) | Dron | 2058.98 | estante | En el estante |
| 54 | B&H Photo | SKYROVER S1 Drone (White) | Dron | 236 | estante | En el estante |
| 55 | B&H Photo | DJI Matrice 4TD (RC Plus 2 Enterprise) | Dron | 9751.2 | estante | En el estante |
| 56 | B&H Photo | DJI Mavic 3 Thermal | Dron | 6900 | estante | En el estante |
| 57 | B&H Photo | DJI Neo Drone Power Combo (No Remote) | Dron | 245 | estante | En el estante |
| 58 | B&H Photo | Autel Robotics EVO II DUAL 640T Rugged Bundle V3 | Dron | 4799 | estante | En el estante |
| 59 | B&H Photo | Autel Robotics EVO Max 4T XE Bundle | Dron | 5699 | estante | En el estante |
| 60 | B&H Photo | Contixo F16 Ziro Drone | Dron | 37.99 | estante | En el estante |
| 61 | B&H Photo | Contixo F19 Arvo Drone | Dron | 59.99 | estante | En el estante |
| 62 | B&H Photo | DJI Neo Drone with Battery & Charging Hub Kit | Dron | 288.98 | estante | En el estante |
| 63 | B&H Photo | Potensic ATOM 2 Drone (Standard Kit with PTD 1) | Dron | 419.99 | estante | En el estante |
| 64 | B&H Photo | DJI Mini 3 Drone with RC-N1 Remote (Fly More Combo) | Dron | 589 | estante | En el estante |
| 65 | B&H Photo | HOVERAir X1 PROMAX Retail Combo | Dron | 779.99 | pasillo tech_accesorios | En el estante |
| 66 | B&H Photo | HOVERAir X1 PROMAX Retail Combo with Beacon Kit | Dron | 919.98 | pasillo tech_accesorios | En el estante |
| 67 | B&H Photo | DJI Avata 2 FPV Drone with 2-Battery Fly More Combo Kit | Dron | 947.69 | estante | En el estante |
| 68 | B&H Photo | DJI Air 3S Drone with RC-N3 Fly More Combo & Nanuk 920 Case Kit | Dron | 1578.95 | estante | En el estante |
| 69 | B&H Photo | DJI Matrice 400 Drone | Dron | 10450 | estante | En el estante |
| 70 | B&H Photo | Contixo F15 Astro Drone (Green) | Dron | 59.99 | estante | En el estante |
| 71 | B&H Photo | Contixo F15 Astro Drone (Blue) | Dron | 59.99 | estante | En el estante |
| 72 | B&H Photo | Contixo F15 Astro Drone (Pink) | Dron | 59.99 | estante | En el estante |
| 73 | B&H Photo | EMAX EZ Pilot Beginner Indoor Racing Drone (RTF) | Dron | 109.99 | estante | En el estante |
| 74 | B&H Photo | EMAX Tinyhawk II Indoor FPV Racing Drone (BNF) | Dron | 129.99 | estante | En el estante |
| 75 | B&H Photo | EMAX Tinyhawk III FPV Racing Drone with FrSky Receiver (BNF) | Dron | 152.09 | estante | En el estante |
| 76 | B&H Photo | Ruko U11Mini 4K Camera Drone with 1 Battery & Advanced Remote | Dron | 254.99 | estante | En el estante |
| 77 | B&H Photo | CADDXFPV Protos Mini FPV Drone with RTF Kit | Dron | 359 | estante | En el estante |
| 78 | B&H Photo | SKYROVER X1 Drone (Yellow) | Dron | 413 | estante | En el estante |
| 79 | B&H Photo | SKYROVER X1 Drone (Gray) | Dron | 413 | estante | En el estante |
| 80 | B&H Photo | EMAX Hawk Apex 5" HDZero Ultralight Racing Drone (BNF) | Dron | 439.99 | estante | En el estante |
| 81 | B&H Photo | Potensic ATOM 2 Drone with PTD 1 (Fly More Combo) | Dron | 599.99 | estante | En el estante |
| 82 | B&H Photo | HOVERAir X1 PROMAX | Dron | 699.99 | pasillo tech_accesorios | En el estante |
| 83 | B&H Photo | HOVERAir X1 PRO Retail Combo with Complete Kit | Dron | 1040.27 | pasillo tech_accesorios | En el estante |
| 84 | B&H Photo | HOVERAir X1 PROMAX Retail Combo with Complete Kit | Dron | 1141.26 | pasillo tech_accesorios | En el estante |
| 85 | B&H Photo | SwellPro Fisherman FD1+ Fishing Drone | Dron | 1256 | estante | En el estante |
| 86 | B&H Photo | DJI Air 3S Drone & Nanuk 920 Case Kit | Dron | 1278.95 | estante | En el estante |
| 87 | B&H Photo | Autel Robotics EVO Lite 6K Enterprise Drone (Standard) | Dron | 1579 | estante | En el estante |
| 88 | B&H Photo | ANTIGRAVITY A1 8K 360 Drone Standard Bundle with Lens & Propeller Guard Kit | Objetivo | 1658.98 | estante | En el estante |
| 89 | B&H Photo | ANTIGRAVITY A1 8K 360 Drone Explorer Bundle | Dron | 1899 | estante | En el estante |
| 90 | B&H Photo | SwellPro Fisherman Max Advanced Heavy-Lift Fishing Drone | Dron | 2299 | estante | En el estante |
| 91 | B&H Photo | Xcraft Nano BLACK OPS Thermal Drone | Dron | 3995 | estante | En el estante |
| 92 | B&H Photo | Autel Robotics EVO Lite 640T Enterprise Drone (7.9" Premium) | Dron | 4239 | estante | En el estante |
| 93 | B&H Photo | Autel Robotics EVO II Dual 640T Enterprise Bundle V3 Drone with Thermal Imaging | Dron | 5299 | estante | En el estante |
| 94 | B&H Photo | DJI Inspire 3 Drone with Hard-Shell Case & Accessory Kit | Dron | 17284.95 | estante | En el estante |
| 95 | B&H Photo | FREEFLY Astro Max Drone (NDAA/Blue) | Dron | 28995 | estante | En el estante |
| 96 | B&H Photo | Snaptain SP350 Drone with Remote Controller | Dron | 49.99 | estante | En el estante |
| 97 | B&H Photo | EMAX EZ Pilot Drone (Drone Only) | Dron | 49.99 | estante | En el estante |
| 98 | B&H Photo | CADDXFPV Protos Mini FPV Drone | Dron | 129 | estante | En el estante |
| 99 | B&H Photo | QUADRONE I-Sight Quadcopter (Black) | Dron | 149.99 | estante | En el estante |
| 100 | B&H Photo | Snaptain SP700 Quadcopter Drone | Dron | 169 | estante | En el estante |
| 101 | B&H Photo | EMAX Tinyhawk II Indoor FPV Racing Drone (RTF) | Dron | 208.99 | estante | En el estante |
| 102 | B&H Photo | EMAX EZ Pilot Pro RTF FPV Drone with Goggles & Controller | Dron | 239.99 | estante | En el estante |
| 103 | B&H Photo | Potensic ATOM Drone (Standard Kit) | Dron | 249 | estante | En el estante |
| 104 | B&H Photo | Snaptain P30 GPS Drone with Remote Controller | Dron | 269.99 | estante | En el estante |
| 105 | B&H Photo | Potensic ATOM SE Drone (Fly More Combo) | Dron | 279.99 | estante | En el estante |
| 106 | B&H Photo | HOVERAir X1 Self-Flying Camera Drone (Combo, Black) | Dron | 299 | estante | En el estante |
| 107 | B&H Photo | HOVERAir X1 Self-Flying Camera Drone (Combo, White) | Dron | 299 | estante | En el estante |
| 108 | B&H Photo | Snaptain P30 Pro 4K Drone | Dron | 299.99 | estante | En el estante |
| 109 | B&H Photo | Potensic ATOM 2 Drone (Standard Kit) | Dron | 299.99 | estante | En el estante |
| 110 | B&H Photo | Potensic ATOM Drone (Fly More Combo) | Dron | 319.99 | estante | En el estante |
| 111 | B&H Photo | Ruko U11Mini 4K Camera Drone with 3 Batteries & Advanced Remote | Dron | 339.99 | estante | En el estante |
| 112 | B&H Photo | HOVERAir X1 Self-Flying Camera Drone (Standard, White) | Dron | 349.99 | estante | En el estante |
| 113 | B&H Photo | Potensic ATOM 2 Drone (Expansion Kit) | Dron | 369.99 | estante | En el estante |
| 114 | B&H Photo | CADDXFPV Gofilm 20 FPV Drone | Dron | 399 | estante | En el estante |
| 115 | B&H Photo | EMAX Hawk Apex 3.5" HDZero Ultralight Racing Drone (PNP) | Dron | 419.99 | estante | En el estante |
| 116 | B&H Photo | DJI Phantom Quadcopter (No Transmitter, Charger, or Battery) | Dron | 420 | estante | En el estante |
| 117 | B&H Photo | DJI Phantom with GoPro Mount (without Battery/Charger/Transmitter) | Dron | 420 | estante | En el estante |
| 118 | B&H Photo | Ruko U11Mini 4K Camera Drone with 2 Batteries & Touchscreen Remote | Dron | 424.99 | estante | En el estante |
| 119 | B&H Photo | Ruko F11PRO 2 Plus Drone | Dron | 424.99 | estante | En el estante |
| 120 | B&H Photo | EMAX Hawk Apex 5" HDZero Ultralight Racing Drone (PNP) | Dron | 429.99 | estante | En el estante |
| 121 | B&H Photo | EMAX Hawk Apex 5" HDZero Ultralight Racing Drone (PNP) | Dron | 429.99 | mismo título | Fuera: mismo título que otra ficha de la tienda |
| 122 | B&H Photo | EMAX Hawk Apex 3.5" HDZero Ultralight Racing Drone (BNF) | Dron | 429.99 | estante | En el estante |
| 123 | B&H Photo | EMAX Hawk Apex 5" HDZero Ultralight Racing Drone (BNF) | Dron | 439.99 | mismo título | Fuera: mismo título que otra ficha de la tienda |
| 124 | B&H Photo | Snaptain P40 Lite 3-Axis 4K Camera Drone | Dron | 449.99 | estante | En el estante |
| 125 | B&H Photo | HOVERAir X1 PRO | Dron | 499.99 | pasillo tech_accesorios | En el estante |
| 126 | B&H Photo | EMAX Babyhawk O3 3.5" Micro FPV Drone | Dron | 509 | estante | En el estante |
| 127 | B&H Photo | HOVERAir X1 PRO with Essentials+ Kit | Dron | 633.26 | pasillo tech_accesorios | En el estante |
| 128 | B&H Photo | HOVERAir X1 PRO with Beacon Kit | Dron | 639.98 | pasillo tech_accesorios | En el estante |
| 129 | B&H Photo | HOVERAir X1 PRO Retail Combo | Dron | 679 | pasillo tech_accesorios | En el estante |
| 130 | B&H Photo | HOVERAir X1 PRO Basic Combo | Dron | 679.99 | pasillo tech_accesorios | En el estante |
| 131 | B&H Photo | Contixo F33 Vortex Drone | Dron | 779.99 | estante | En el estante |
| 132 | B&H Photo | HOVERAir X1 PRO with Essentials+ Kit (Basic Combo) | Dron | 798.77 | pasillo tech_accesorios | En el estante |
| 133 | B&H Photo | HOVERAir X1 PRO Retail Combo with Essentials+ Kit | Dron | 812.27 | pasillo tech_accesorios | En el estante |
| 134 | B&H Photo | HOVERAir X1 PRO Retail Combo with Beacon Kit | Dron | 818.99 | pasillo tech_accesorios | En el estante |
| 135 | B&H Photo | HOVERAir X1 PRO with Beacon Kit (Basic Combo) | Dron | 819.98 | pasillo tech_accesorios | En el estante |
| 136 | B&H Photo | DJI Avata Explorer Combo FPV Drone with Goggles Integra | Dron | 829 | estante | En el estante |
| 137 | B&H Photo | HOVERAir X1 PROMAX with Essentials+ Kit | Dron | 833.26 | pasillo tech_accesorios | En el estante |
| 138 | B&H Photo | HOVERAir X1 PROMAX with Beacon Kit | Dron | 839.98 | pasillo tech_accesorios | En el estante |
| 139 | B&H Photo | HOVERAir X1 PRO with Complete Kit | Dron | 861.26 | pasillo tech_accesorios | En el estante |
| 140 | B&H Photo | HOVERAir X1 PROMAX Basic Combo | Dron | 879.99 | pasillo tech_accesorios | En el estante |
| 141 | B&H Photo | HOVERAir X1 PROMAX Retail Combo with Essentials+ Kit | Dron | 913.26 | pasillo tech_accesorios | En el estante |
| 142 | B&H Photo | DJI Mini 5 Pro Drone with RC-N3 & Case/Memory Kit | Dron | 984.95 | estante | En el estante |
| 143 | B&H Photo | DJI Avata 360 with RC 2 & Hard-Shell Case Kit | Dron | 992.5 | estante | En el estante |
| 144 | B&H Photo | HOVERAir X1 PROMAX with Essentials+ Kit (Basic Combo) | Dron | 998.77 | pasillo tech_accesorios | En el estante |
| 145 | B&H Photo | HOVERAir X1 PROMAX with Beacon Kit (Basic Combo) | Dron | 1019.98 | pasillo tech_accesorios | En el estante |
| 146 | B&H Photo | HOVERAir X1 PRO with Complete Kit (Basic Combo) | Dron | 1026.77 | pasillo tech_accesorios | En el estante |
| 147 | B&H Photo | HOVERAir X1 PROMAX with Complete Kit | Dron | 1061.26 | pasillo tech_accesorios | En el estante |
| 148 | B&H Photo | DJI Mini 5 Pro Drone with RC-N3 Fly More Combo & Case/Memory Kit | Dron | 1184.95 | estante | En el estante |
| 149 | B&H Photo | HOVERAir X1 PROMAX with Complete Kit (Basic Combo) | Dron | 1226.77 | pasillo tech_accesorios | En el estante |
| 150 | B&H Photo | DJI Avata 360 Fly More Combo with RC 2 & Hard-Shell Case Kit | Dron | 1249.95 | estante | En el estante |
| 151 | B&H Photo | DJI Avata 360 Motion Fly More Combo & Hard-Shell Case Kit | Dron | 1252.5 | estante | En el estante |
| 152 | B&H Photo | DJI Avata 2 FPV Drone with 3-Battery Fly More Combo & Hard Case Accessory Kit | Dron | 1348.84 | estante | En el estante |
| 153 | B&H Photo | DJI Mini 5 Pro Drone with RC2 Fly More Combo & Case/Memory Kit | Dron | 1352.95 | estante | En el estante |
| 154 | B&H Photo | DJI Mini 5 Pro Drone with RC2 Fly More Combo Plus & Case/Memory Kit | Dron | 1384.95 | estante | En el estante |
| 155 | B&H Photo | DJI Avata Pro View Combo FPV Drone with DJI Goggles 2 | Dron | 1388 | estante | En el estante |
| 156 | B&H Photo | ANTIGRAVITY A1 8K 360 Drone Standard Bundle | Dron | 1599 | estante | En el estante |
| 157 | B&H Photo | DJI Inspire 1 v2.0 Quadcopter with 4K Camera and 3-Axis Gimbal (No Remote/Charger) | Dron | 1699 | estante | En el estante |
| 158 | B&H Photo | SwellPro Fisherman FD3 Advanced Fishing Drone | Dron | 1899 | estante | En el estante |
| 159 | B&H Photo | ANTIGRAVITY A1 8K 360 Drone with Protection Kit (Standard Bundle) | Dron | 1911.9 | estante | En el estante |
| 160 | B&H Photo | ANTIGRAVITY A1 8K 360 Drone with Protection Kit (Explorer Bundle) | Dron | 1958.98 | estante | En el estante |
| 161 | B&H Photo | Autel Robotics EVO Lite 6K Enterprise Drone (Premium) | Dron | 2059 | estante | En el estante |
| 162 | B&H Photo | Autel Robotics EVO II Pro 6K Rugged Bundle V3 | Dron | 2099 | estante | En el estante |
| 163 | B&H Photo | Xpece ONE Fishing Drone | Dron | 2299 | estante | En el estante |
| 164 | B&H Photo | Autel Robotics EVO Lite 6K Enterprise Drone (7.9" Premium) | Dron | 2299 | estante | En el estante |
| 165 | B&H Photo | SwellPro Fisherman Max Fishing Drone | Dron | 2299 | estante | En el estante |
| 166 | B&H Photo | DJI Mavic 4 Pro Drone with Travel Accessory Kit | Dron | 2359.95 | estante | En el estante |
| 167 | B&H Photo | Xpece ONE Fishing Drone with Fly More Combo | Dron | 2899 | estante | En el estante |
| 168 | B&H Photo | SwellPro Fisherman Max Advanced Heavy-Lift Fishing Drone with Battery & Propeller Kit | Dron | 2935 | estante | En el estante |
| 169 | B&H Photo | Autel Robotics EVO II Pro 6K RTK Rugged Bundle V3 | Dron | 2999 | estante | En el estante |
| 170 | B&H Photo | Autel Robotics EVO II Pro 6K Enterprise Bundle V3 | Dron | 3149 | estante | En el estante |
| 171 | B&H Photo | Autel Robotics EVO Lite 640T Enterprise Drone (Standard) | Dron | 3359 | estante | En el estante |
| 172 | B&H Photo | Autel Robotics EVO Lite 640T Enterprise Drone (Premium) | Dron | 3879 | estante | En el estante |
| 173 | B&H Photo | DJI Mavic 4 Pro Drone with 512GB Creator Combo & Hard-Shell Case Kit | Dron | 4149.99 | estante | En el estante |
| 174 | B&H Photo | DJI Inspire 1 v2.0 PRO Black Edition Quadcopter with Zenmuse X5 4K Camera and 3-Axis Gimbal | Dron | 4199 | estante | En el estante |
| 175 | B&H Photo | Autel Robotics EVO II DUAL 640T RTK Rugged Bundle V3 | Dron | 5799 | estante | En el estante |
| 176 | B&H Photo | DJI Mavic 3 Thermal | Dron | 6799 | mismo título | Fuera: mismo título que otra ficha de la tienda |
| 177 | B&H Photo | DJI Matrice 4TD Drone | Dron | 7640 | estante | En el estante |
| 178 | B&H Photo | DJI Matrice 4D Drone (RC Plus 2 Enterprise) | Dron | 7730 | estante | En el estante |
| 179 | B&H Photo | Autel Robotics EVO Max 4N Industrial Drone | Dron | 8899 | estante | En el estante |
| 180 | B&H Photo | YUNEEC GDU S220 Pro Industrial Drone | Dron | 9700 | estante | En el estante |
| 181 | B&H Photo | Autel Robotics EVO Max 4T XE Bundle for EVO Nest | Dron | 10676.29 | estante | En el estante |
| 182 | B&H Photo | DJI Matrice 30T (General) | Dron | 11656 | estante | En el estante |
| 183 | B&H Photo | DJI Matrice 30T Enterprise Drone | Dron | 11656 | estante | En el estante |
| 184 | B&H Photo | ACSL SOTEN Survey Bundle | Dron | 14550 | pasillo tech_accesorios | En el estante |
| 185 | B&H Photo | YUNEEC GDU S220 Pro Industrial Drone with K03 Docking Station | Dron | 14800.5 | estante | En el estante |
| 186 | B&H Photo | ACSL SOTEN Inspection Bundle Plus | Dron | 16940 | pasillo tech_accesorios | En el estante |
| 187 | B&H Photo | ACSL SOTEN Survey RTK Bundle Plus | Dron | 18740 | pasillo tech_accesorios | En el estante |
| 188 | B&H Photo | Autel Robotics Alpha Industrial Drone with 5-in-1 Gimbal | Dron | 19289 | estante | En el estante |
| 189 | B&H Photo | DJI Inspire 3 Drone with PROSSD 1TB Storage & 18mm Lens Kit | Objetivo | 20725 | estante | En el estante |
| 190 | B&H Photo | FREEFLY Astro Max Drone | Dron | 22995 | estante | En el estante |
| 191 | B&H Photo | Inspired Flight IF800 Tomcat Commercial Drone with Blue Herelink Remote | Dron | 23000 | estante | En el estante |
| 192 | B&H Photo | YUNEEC GDU S220 Pro Industrial Drone with K02 Docking Station | Dron | 28646.43 | estante | En el estante |
| 193 | B&H Photo | Inspired Flight IF800 Tomcat Commercial Drone with GS-ONE Remote | Dron | 29500 | estante | En el estante |
| 194 | B&H Photo | FREEFLY Alta X with F9P GPS & Travel Case (Aircraft with Pilot Pro & Remote ID Kit) | Dron | 32495 | pasillo tech_accesorios | En el estante |
| 195 | B&H Photo | Inspired Flight IF1200A Commercial Hexacopter Heavy-Lift Drone with Blue Herelink Remote | Dron | 33500 | estante | En el estante |
| 196 | B&H Photo | FREEFLY Alta X Drone with Pilot Pro (NDAA Compliant) | Dron | 33995 | estante | En el estante |
| 197 | B&H Photo | Inspired Flight IF1200A Commercial Hexacopter Heavy-Lift Drone with GS-ONE Remote | Dron | 39000 | estante | En el estante |
| 198 | B&H Photo | FREEFLY Alta X Gen2 Enterprise Drone | Dron | 39650 | estante | En el estante |
| 199 | B&H Photo | FREEFLY Alta X Gen2 Enterprise Drone (NDAA) | Dron | 45650 | estante | En el estante |
| 200 | Walmart | Vivitar SkyVision 4K Ultra HD GPS Foldable Video Drone with 4.3" Display Controller, Brushless Motors, 1-Axis Gimbal, VR Headset, 17-Minute Flight Time & Travel Carry Case | Aerial Drones | 179 | estante | En el estante |
| 201 | Walmart | Vivitar SkyTrek GPS Foldable Aerial Drone with 1080p Camera, 2.8 in Live Video Controller & Brushless Motor | Aerial Drones | 99 | estante | En el estante |
| 202 | Walmart | Vivitar SkyHawk GPS Foldable Aerial Drone for Adults with 2.7K HD Camera, 16-Minute Flight Time & Wireless Controller | Aerial Drones | 149 | estante | En el estante |
| 203 | Walmart | FPV Drone with Camera 4K for Adults,Big Screen on Remote Controller,2 pcs Batteries and Carrying Case,Gift for Men,Easy Fly Quadcopter for Beginners with Optical Flow Positioning | Aerial Drones | 99.99 | estante | En el estante |
| 204 | Walmart | Gps Drone with 4K Camera for Adults 4.5 inch HD Screen on Remote Controller Follow Me Fpv RC Drones with Auto Return 2 Batteries for Long Flight Time Quadcopter for Beginners | Aerial Drones | 139.99 | estante | En el estante |
| 205 | Walmart | Contixo F26 Volant Drone with 4.3” Screen Controller, Brushless FPV Drone with Optical Flow Stability, 4-Sided Obstacle Avoidance, 480P Camera, One-Key Return & 2000mAh Battery for Beginners Ages 14+ | Aerial Drones | 99.99 | estante | En el estante |
| 206 | Walmart | GPS Drone with 4K Camera,RC Drones with 4.5 inch HD Screen on Controller,Auto Return,2 Batteries for 45 min Flight Time,Long Range Transmission,Circle Fly and Follow Me Mode,Foldable Quadcopter | Aerial Drones | 139.99 | estante | En el estante |
| 207 | Walmart | SNAPTAIN E20 FPV Drone with 2.7k QHD Camera, Brushless Motor with Controller for Adult - Gray | Aerial Drones | 99.99 | estante | En el estante |
| 208 | Walmart | Vivitar SkyHornet Foldable RC Aerial Drone for Adults with 720p HD Camera, WiFi FPV Live Video & 3 Speed Modes | Aerial Drones | 59.88 | estante | En el estante |
| 209 | Walmart | Sharper Image® Stealth Recon Video Drone with Live Streaming Camera, Black | Aerial Drones | 55 | estante | En el estante |
| 210 | Walmart | Vivitar SkyFlow GPS Foldable 4K UHD Aerial Drone for Adults with Live Video Feed & 5" Touchscreen Remote | Aerial Drones | 299 | estante | En el estante |
| 211 | Walmart | Drone with Camera, LCD Screen, 1080P Fpv, 90° Electric Adjustable Camera, Rgb LED Lights, Optical Flow Positioning, SD Card,One‑Key Takeoff/Landing, Under 249g | Aerial Drones | 78.99 | estante | En el estante |
| 212 | Walmart | Wefone H30 Foldable Drone with Camera, Lightweight, User-Friendly, 360° Flips, Altitude Hold, Optical Flow Positioning, 3 Batteries, Black | Aerial Drones | 24.99 | estante | En el estante |
| 213 | Walmart | SUNNYBAY Drone with Camera for Adults 4K, Foldable FPV Quadcopter, Brushless Motor, Under 249 g, Optical Flow LED Night-Light, Smart Selfie Mode | Aerial Drones | 59.99 | estante | En el estante |
| 214 | Walmart | DJI Mini 4K Drone with Remote Control - Gray | Aerial Drones | 356.49 | estante | En el estante |
| 215 | Walmart | BKAXH With 1080P HD Camera for Adults and Kids for Adults and Children FPV RC Quadcopter With LED Lights and Optical Flow Sensor, 2 Batteries, Black | Aerial Drones | 32.99 | estante | En el estante |
| 216 | Walmart | JoyStone RC Drone with 4K Camera for Adults Kids, Brushless Mini Drone with Headless Mode, RC Quadcopter with Colorful LED Light, 2 Batteries for Beginners | Aerial Drones | 39.98 | estante | En el estante |
| 217 | Walmart | SPAN LINK Drone with 4K HD Dual Camera for Adults Kids, RC Quadcopter with 2 Modular 1800mAh Batteries for 30 Mins Long Flight | Aerial Drones | 24.99 | estante | En el estante |
| 218 | Walmart | Holy Stone HS720G 2-Axis Gimbal Drones with 4K EIS Camera,Brushless Motors, GPS Auto Return, Video Transmission, Mini Foldable Drone for Beginners Adults, 1 Battery 26-Min Flight Time | Aerial Drones | 99.99 | estante | En el estante |
| 219 | Walmart | DJI Mini 5 Pro Drone Fly More Combo Plus (DJI RC 2) | Aerial Drones | 1158 | estante | En el estante |
| 220 | Walmart | Wefone M2 Drones with Camera for Kids, One-Key Takeoff and Landing, 360° Flip, Headless Mode, Optical Flow Hover, Brushless Motor, 2 Batteries, Gray | Aerial Drones | 29.99 | estante | En el estante |
| 221 | Walmart | Wefone S101S Foldable Drone with Dual Camera for Beginners, Optical Flow Positioning, 2 Batteries, Gray | Aerial Drones | 39.99 | estante | En el estante |
| 222 | Walmart | Drone for Kids Adults, Wefone WF11 1080P HD Camera Drones with FPV Transmission Mini Foldable RC Quadcopters for Beginners, 2 Batteries, Black | Aerial Drones | 37.89 | estante | En el estante |
| 223 | Walmart | Wefone WF35 GPS Foldable Drone with 4.3" Touchscreen on Remote, 4K Camera for Adults, 4GB Card, Under 249g, Obstacle Avoidance, 2 Batteries, Black | Aerial Drones | 149.99 | estante | En el estante |
| 224 | Walmart | Wefone Camera Drone with Remote Screen, M107 Foldable Quadcopter, Optical Flow, Brushless Motor, Obstacle Avoidance, Under 249g, 2 Batteries, Black | Aerial Drones | 89.99 | estante | En el estante |
| 225 | Walmart | Wefone WF22 Drone with Camera Lightweight Beginner-Friendly Quadcopter Featuring Optical Flow Stabilization, Extended Flight with 2 Batteries, White | Aerial Drones | 44.99 | estante | En el estante |
| 226 | Walmart | Aimlovs Mini Drone for Kids Age 8+ with 4.3" LCD Remote Screen, 720P HD Camera, Optical Flow Hover, Propeller Guards, 2 Batteries, 18 Min Flight Time | Radio Control Helicopters | 99.99 | estante | En el estante |
| 227 | Walmart | GPS Drone with 4.5" Screen Remote, Wefone F208 Foldable 1080P Dual Camera, Obstacle Avoidance, Under 249g, Carry Case, 2 Batteries,Black | Aerial Drones | 129.89 | estante | En el estante |
| 228 | Walmart | SPAN LINK Drone with 4K HD Dual Camera for Adults Kids, RC Quadcopter with 2 Modular 1800mAh Batteries for 30 Mins Long Flight | Aerial Drones | 35.99 | mismo título | Fuera: mismo título que otra ficha de la tienda |
| 229 | Walmart | Wefone L106 GPS Foldable Drone with 4K UHD Camera for Adults Beginners, Brushless Motor, Outdoor Fun, 2 Batteries, White | Aerial Drones | 39.99 | estante | En el estante |
| 230 | Walmart | DJI Mini 4K Camera Drone Combo, Drone with 4K UHD Camera for Adults, Under 249 g, 3-Axis Gimbal Stabilization, 10km Video Transmission, Auto Return, 2 Batteries for 62-Min Max Flight Time, QuickShots | Aerial Drones | 389 | estante | En el estante |
| 231 | Walmart | Drone with 4.3" Screen on Remote, Wefone XJ2 Foldable 4K Camera Drone, Optical Flow, Brushless Motor, Under 249g, 2 Batteries, Gray | Aerial Drones | 79.89 | estante | En el estante |
| 232 | Walmart | Contixo F21 Foldable Drones for Adults with Camera, 1080P Dual Camera Drone with 3-Way Obstacle Avoidance, Gray | Aerial Drones | 53.99 | estante | En el estante |
| 233 | Walmart | Drone with 4.3" Screen on Remote, Foldable Wefone M3, HD Camera, Obstacle Avoidance, Brushless Motor, Optical Flow, Lightweight, 2 Batteries, Gray | Aerial Drones | 79.99 | estante | En el estante |
| 234 | Walmart | Babyltrl Drone with 1080P HD Dual Camera for Adults Kids,Wifi FPV Foldable RC Quadcopter with 2 Batteries for 35 Mins Flight,Brushless Motor,Toys Gifts for Beginner | Aerial Drones | 35.99 | estante | En el estante |
| 235 | Walmart | Wefone M3 Foldable Drone with Camera, Obstacle Avoidance, 2 Batteries 20 Min, Brushless Motor, Optical Flow, Gray | Aerial Drones | 28.99 | estante | En el estante |
| 236 | Walmart | HHD Drone with Camera 4K 5G GPS WIFI Dual Camera 3800ft FPV Transmission W/ 32GB TF | Aerial Drones | 176.56 | estante | En el estante |
| 237 | Walmart | DJI Neo 2 4K Drone Fly More Combo, No Remote | Aerial Drones | 328 | estante | En el estante |
| 238 | Walmart | SPEEDYEAH CS-88 Foldable Drone with Dual Camera, Orange Black RC Quadcopter, Beginner Friendly Outdoor Aerial Photography Drone | Aerial Drones | 19.9 | estante | En el estante |
| 239 | Walmart | WeFone B6 GPS Drone with Camera for Adults 4K, Smart Return, 5G Transmission, 2 Batteries, Gray | Aerial Drones | 75.99 | estante | En el estante |
| 240 | Walmart | Bwine F7MINI 4K(RC3) Drones with Camera for Adults, 8K Photo 4K Video, RC with 1080P Screen, 20000ft Transmission, 64min Flight, 3-Axis Gimbal, 249g FAA-Exempt, GPS Track, Auto Return, Beginner Mode | Aerial Drones | 449.99 | estante | En el estante |
| 241 | Walmart | Drone with HD Camera for Adults Kids, WIFI FPV RC Quadcopter with Colorful LED Lights, Foldable RC Drone with 3 Batteries, Carrying Case | Aerial Drones | 24.99 | estante | En el estante |
| 242 | Walmart | DJI Neo 2 FPV Drone Motion Fly More Combo – Beginner-Friendly 4K FPV Drone with Stable Digital Transmission | Aerial Drones | 599 | estante | En el estante |
| 243 | Walmart | HNZENBW Drone with 4K HD Dual Camera for Kids Adults,RC Foldable FPV Quadcopte with 2 Modular 1800mAh Batteries for 40 Mins, Brushless Motor,Black | Aerial Drones | 63.17 | estante | En el estante |
| 244 | Walmart | OEKE Drone with 4K HD Dual Camera for Adults Kids, RC Quadcopter with 3 Modular 1800mAh Batteries for 30 Mins Long Flight | Aerial Drones | 40.99 | estante | En el estante |
| 245 | Walmart | DJI Neo Drone Mini 4K UHD Video Quadcopter CP.FP.00000184.01 | Aerial Drones | 199 | estante | En el estante |
| 246 | Walmart | Bwine F7GIM Drone with 6K UHD Camera, 3-Axis Brushless Gimbal, 4K/30fps Video, GPS Smart Control for Adults and Beginners, 70Mins, 10000FT FPV Digital Transmission and TOF Safety Support | Aerial Drones | 309.99 | estante | En el estante |
| 247 | Walmart | DJI Neo 2 Drone Fly More Combo 4K Camera | Aerial Drones | 429 | estante | En el estante |
| 248 | Walmart | DJI Mini 3 4K Video Resolution Aerial Drone Bundle with Remote Control | Aerial Drones | 405 | estante | En el estante |
| 249 | Walmart | DJI Avata 2 Fly Smart Combo Aerial Drone Goggles with Goggles N3, Remote, Three Batteries | Aerial Drones | 814 | estante | En el estante |
| 250 | Walmart | Drones with Camera，2 Batteries, One-Key Takeoff and Landing, 360° Flip, Headless Mode, Optical Flow Hover, Brushless Motor, Gray | Aerial Drones | 40.99 | estante | En el estante |
| 251 | Walmart | DJI Mini 3 - Drone | Aerial Drones | 519.99 | estante | En el estante |
| 252 | Walmart | H31 Drone with 4.3" Screen Remote, Wefone 4K Camera Foldable Drone, Optical Flow Hovering, Brushless Motors, Carry Case, 2 Batteries, Black | Aerial Drones | 84.99 | estante | En el estante |
| 253 | Walmart | 4K GPS Drone with 5" Screen Remote for Adults, 3-Axis Gimbal, Optical Flow Hover, Wefone JY021, Under 249g Foldable Design, 2 Batteries, Black | Aerial Drones | 199.99 | estante | En el estante |
| 254 | Walmart | Wefone D12 2-in-1 Racing Car Drone for Kids & Adults with Camera, 6 LED Lights, 2 Adjustable Speeds, Easy to Fly & Crash-Resistant, 2 Batteries, Gray | Aerial Drones | 24.99 | estante | En el estante |
| 255 | Walmart | DJI Air 3 Dual Camera 4K Video Resolution Aerial Drone | Aerial Drones | 999 | estante | En el estante |
| 256 | Walmart | Wefone B3-PRO GPS Foldable Drone with 4K HD Camera for Adults, Brushless Motor, 2 Batteries, Black | Aerial Drones | 59.99 | estante | En el estante |
| 257 | Walmart | Potensic ATOM GPS Drone with 4K 3-Axis Gimbal Camera | Aerial Drones | 269.99 | estante | En el estante |
| 258 | Walmart | DJI Mini 5 Pro Drone More Combo 4 Battery (DJI RC 2) | Aerial Drones | 1066 | estante | En el estante |
| 259 | Walmart | DJI Avata 2 Fly More Combo (3 Batteries) FPV Drove with Camera 4K | Aerial Drones | 1019 | estante | En el estante |
| 260 | Walmart | DJI Mini 5 Pro Drone CA Fly More Combo (RC 2) 1" CMOS Sensor, 4K Video, Obstacle Sensing, 4 Battery Bundle with Deco Essentials CPS Exclusive 26 Month Protection Pack, Software & Accessory Kit | Aerial Drones | 1269 | estante | En el estante |
| 261 | Best Buy | Snaptain - P40 LITE 3-Axis Gimbal Camera Drone Bundle - Gray | Drones | 499.99 | fuera de venta | Fuera: tienda fuera de venta |
| 262 | Best Buy | Snaptain - P40 LITE 3-Axis Gimbal Camera Drone - Gray | Drones | 389.99 | fuera de venta | Fuera: tienda fuera de venta |
| 263 | Best Buy | Snaptain - K30 Mini 720P HD Camera Drone with Colorful Lighting and Remote Controller - White | Drones | 69.99 | fuera de venta | Fuera: tienda fuera de venta |
| 264 | Best Buy | Antigravity - A1 8K 360 Remote Control Drone - Infinity Bundle - White | Drones | 1599 | fuera de venta | Fuera: tienda fuera de venta |
| 265 | Best Buy | SKYROVER - X1 Fly More Combo 8K Drone with Remote Controller - Gray | Drones | 579 | fuera de venta | Fuera: tienda fuera de venta |
| 266 | Best Buy | SKYROVER - X1 Fly More Combo 8K Drone Bundle with Remote Screen Controller - Gray | Drones | 749 | fuera de venta | Fuera: tienda fuera de venta |
| 267 | Best Buy | Antigravity - A1 8K 360 Remote Control Drone - Standard Bundle - Under 249g - White | Drones | 1199 | fuera de venta | Fuera: tienda fuera de venta |
| 268 | Best Buy | Snaptain - S5C Ultra 1080p Camera Drone with Remote Controller - Gray | Drones | 149.99 | fuera de venta | Fuera: tienda fuera de venta |
| 269 | Best Buy | Antigravity - A1 8K 360 Remote Control Drone - Explorer Bundle - Under 249g - White | Drones | 1519 | fuera de venta | Fuera: tienda fuera de venta |
| 270 | Best Buy | SKYROVER - S1 Fly More Combo 8K Drone with Remote Controller - White | Drones | 359 | fuera de venta | Fuera: tienda fuera de venta |
| 271 | Best Buy | SKYROVER - S1 Fly More Combo 8K Drone Bundle with Remote Screen Controller - White | Drones | 549 | fuera de venta | Fuera: tienda fuera de venta |
| 272 | Best Buy | DJI - Flip Fly More Combo (DJI RC 2) (GL) | Drones | 619 | fuera de venta | Fuera: tienda fuera de venta |
| 273 | Best Buy | DJI - Flip Drone (DJI Remote Control 2) (GL) | Drones | 509 | fuera de venta | Fuera: tienda fuera de venta |
| 274 | Best Buy | DJI - Mini 3 Fly More Combo (DJI RC) (GL) - Gray | Cámaras | 719.99 | fuera de venta | Fuera: tienda fuera de venta |
| 275 | Best Buy | DJI - Mini 3 (DJI RC) (GL) - Gray | Drones | 549.99 | fuera de venta | Fuera: tienda fuera de venta |
| 276 | Best Buy | Snaptain - S5C Elite 1080p Drone with Remote Controller - Black | Drones | 99.99 | fuera de venta | Fuera: tienda fuera de venta |
| 277 | Best Buy | Contixo - F28 Stratus 2K GPS Drone with Intelligent Flight Modes, 26-Min Flight, Brushless Motors & Carrying Case - Silver | Drones | 159.99 | fuera de venta | Fuera: tienda fuera de venta |
| 278 | Best Buy | Snaptain - P30 Pro 4K Camera GPS Drone and Remote Controller - Gray | Drones | 299.99 | fuera de venta | Fuera: tienda fuera de venta |
| 279 | Best Buy | Contixo - F19 Arvo Foldable Drone with 1080P HD Camera, FPV, Obstacle Avoidance, 2 Batteries, Brushless Motors & LED Lights - Silver | Drones | 59.99 | fuera de venta | Fuera: tienda fuera de venta |
| 280 | Best Buy | Contixo - F33 Vortex 4K GPS Drone with 2-Axis Gimbal, 6KM Range, 40-Min Flight, 5.5" HD Screen & Brushless Motor - Dark Gray | Drones | 799.99 | fuera de venta | Fuera: tienda fuera de venta |
| 281 | Best Buy | Contixo - F28 Stratus Max 4K GPS Drone with Intelligent Flight Modes, 26-Min Flight, Brushless Motors & Carrying Case - Gray | Drones | 279.99 | fuera de venta | Fuera: tienda fuera de venta |
| 282 | Best Buy | Contixo - F29 Altura Max 4K GPS Drone with 3-Axis Gimbal, 5" Screen Remote, 3KM Range, 23-Min Flight, No FAA Needed - Dark Gray | Drones | 499.99 | fuera de venta | Fuera: tienda fuera de venta |
| 283 | Best Buy | DJI - Mini 5 Pro Fly More Combo Plus (DJI RC2) - Black | Drones | 1159 | fuera de venta | Fuera: tienda fuera de venta |
| 284 | Best Buy | HOVERAir - X1 PROMAX Retail Combo - Black | Drones | 779.99 | fuera de venta | Fuera: tienda fuera de venta |
| 285 | Best Buy | HOVERAir - X1 Self-Flying Camera Drone Combo - Black | Drones | 299.99 | fuera de venta | Fuera: tienda fuera de venta |
| 286 | Best Buy | Snaptain - P10 4K Camera Drone with Remote Controller - Gray | Drones | 229.99 | fuera de venta | Fuera: tienda fuera de venta |
| 287 | Best Buy | Vivitar - SkyTrek Drone - Gray | Drones | 99.99 | fuera de venta | Fuera: tienda fuera de venta |
| 288 | Best Buy | Vivitar - SkyHawk Drone - Gray | Drones | 149.99 | fuera de venta | Fuera: tienda fuera de venta |
| 289 | Best Buy | DJI - Neo 2 Fly More Combo | Drones | 429 | fuera de venta | Fuera: tienda fuera de venta |
| 290 | Best Buy | Potensic - ATOM 2 Fly More Combo Drone with Remote Controller PTD 1 - Gray | Drones | 599.99 | fuera de venta | Fuera: tienda fuera de venta |
| 291 | Best Buy | DJI - Neo 2 Drone Motion Fly More Combo | Drones | 599 | fuera de venta | Fuera: tienda fuera de venta |
| 292 | Best Buy | DJI - Air 3S Drone Fly More Combo (DJI RC 2) | Cámaras | 1599.99 | fuera de venta | Fuera: tienda fuera de venta |
| 293 | Best Buy | DJI - Avata 360 Drone Fly More Combo (DJI RC 2) | Drones | 979 | fuera de venta | Fuera: tienda fuera de venta |
| 294 | Best Buy | VCOPTER - Falcon Mini Fly More Combo - Black | Drones | 449.99 | fuera de venta | Fuera: tienda fuera de venta |
| 295 | Best Buy | Potensic - ATOM Fly More Combo Drone with Remote Controller - Gray | Drones | 349.99 | fuera de venta | Fuera: tienda fuera de venta |
| 296 | Best Buy | HOVERAir - X1 PRO Retail Combo - Black | Drones | 679.99 | fuera de venta | Fuera: tienda fuera de venta |
| 297 | Best Buy | Potensic - ATOM 2 Standard Drone Kit with Remote Controller PTD 1 - Gray | Drones | 479.99 | fuera de venta | Fuera: tienda fuera de venta |
| 298 | BrandsMart USA | Potensic ATOM 2 Drone (Fly More Combo) | tech_camaras | 479.99 | estante | En el estante |
| 299 | BrandsMart USA | Neo 2 Drone Fly More Combo | tech_camaras | 429 | estante | En el estante |
| 300 | BrandsMart USA | Potensic ATOM Drone (Fly More Combo) | tech_camaras | 359.99 | estante | En el estante |
| 301 | BrandsMart USA | Avata 360 with RC 2 | tech_camaras | 719 | estante | En el estante |
| 302 | BrandsMart USA | Avata 360 Motion Fly More Combo | tech_camaras | 979 | estante | En el estante |
| 303 | BrandsMart USA | GPS Drone with 4K 3-Axis Gimbal Camera | tech_camaras | 269.99 | estante | En el estante |
| 304 | BrandsMart USA | F25 Foldable Drone with 1080p FHD Camera, Faa-Exempt, FPV Screen, and GPS | tech_camaras | 129.99 | estante | En el estante |
| 305 | BrandsMart USA | Sky Hornet Drone - Green | tech_camaras | 18.99 | estante | En el estante |
| 306 | BrandsMart USA | Drone Mini Pro Neo 2.4G Flight Model Aerial Camera with Remote Control | tech_camaras | 29.99 | estante | En el estante |
| 307 | Costco | HOVERAir X1 PROMAX 8K Self-Flying Camera Bundle | cameras-drones | 569.99 | pasillo tech_camaras | En el estante |
| 308 | Costco | Potensic ATOM 2 4K Drone Bundle with 128GB MicroSD Card, Remote Lanyard and 2 Spare Propeller Kits. | cameras-drones | 349.99 | estante | En el estante |
| 309 | Costco | Antigravity A1 8K 360 Drone Essential Bundle | cameras-drones | 1249.99 | estante | En el estante |

## Cómo se regenera

`node scripts/build-department-slices.mjs && node scripts/build-search-destinations.mjs`. `scripts/test/not-sold-tests.mjs` fija el estante en 268 = drones del catálogo menos Best Buy menos las segundas fichas con el mismo título, y falla con el nombre de cualquier dron que no llegue.
