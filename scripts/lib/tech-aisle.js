/* ============================================================
   ONE ELECTRONICS AISLE RULE, BY WHAT THE PRODUCT IS (#443 c.6476569113,
   Lucifer's BrandsMart aisle-truth audit: "classify by product type,
   NEVER by source collection -- the Shopify collections are the
   contamination source"). Every electronics store -- BrandsMart,
   Walmart, Costco, Micro Center -- files through this one function, so
   Electrónica's aisles hold the same thing whichever store sold it:

     Celulares        handsets only (a case or a charger is Accesorios)
     Computadoras     laptops, desktops, tablets, Chromebooks, e-readers
     Audífonos        headphones, earbuds, headsets
     Audio            speakers, soundbars, receivers, turntables
     Gaming           consoles and their controllers, gaming gear
     Cámaras          cameras, lenses, drones, action cams (a security
                      camera is Casa inteligente)
     Relojes          smartwatches, fitness trackers
     Casa inteligente security cameras, doorbells, smart plugs/speakers
     Audio para auto  car stereos, car speakers, dash cams
     Componentes      motherboards, CPUs, graphics cards, memory, SSDs
     Accesorios       the accessory sink: cables, chargers, cases,
                      keyboards, mice, batteries, mounts, storage

   The store's own category is only a hint, read last.
   ============================================================ */

export const TECH_AISLE_LABELS = {
  tech_celulares: "Celulares", tech_computadoras: "Computadoras y tablets", tech_audifonos: "Audífonos",
  tech_audio: "Audio y parlantes", tech_gaming: "Gaming", tech_camaras: "Cámaras", tech_relojes: "Relojes inteligentes",
  tech_casa_inteligente: "Casa inteligente y seguridad", tech_auto: "Audio para auto", tech_componentes: "Componentes de PC",
  tech_accesorios: "Accesorios y energía", tech_electro: "Electrodomésticos pequeños",
};
export const TECH_AISLE_ORDER = ["tech_celulares", "tech_computadoras", "tech_audifonos", "tech_audio", "tech_gaming", "tech_camaras",
  "tech_relojes", "tech_casa_inteligente", "tech_auto", "tech_componentes", "tech_accesorios", "tech_electro"];

const ACCESSORY_RX = /\b(cases?|covers?|folio|screen protectors?|tempered glass|chargers?|charging (cable|cord|pad|stand|dock)|cables?|cords?|adapters?|adapter|power banks?|batter(y|ies)|mounts?|stands?|holders?|straps?|bands? for|replacement (band|strap|tips|pads|ear)|ear ?tips|skins?|sleeves?|bags?|backpacks?|stylus|hubs?|docking station|docks?|keyboards?|mouse|mice|mouse ?pads?|webcams?|memory cards?|sd cards?|micro ?sd|flash drives?|usb drives?|external (hard|solid)|hard drives?|portable ssd|surge|power strips?|extension cords?|wall plates?|brackets?|tripods?|selfie sticks?|lens (caps?|cloths?)|cleaning kit|car chargers?|dongles?)\b/i;
const PHONE_RX = /\b(iphone \d+[a-z]?|iphone se|galaxy (s|z|a)\d+|galaxy z (flip|fold)|pixel \d+|moto(rola)? (g|edge|razr)|razr|smartphone|cell ?phone|unlocked phone|phone (unlocked|\d+gb)|\d+gb .*\b(unlocked|smartphone)\b|flip phone|tcl flip|(alcatel|nokia|kyocera|orbic) [\w ]*flip|rugged (smart)?phone|android phone|kyocera dura\w+|jitterbug|lively flip|tcl \d+|blu [a-z]+ \d)\b/i;
const COMPUTER_RX = /\b(laptops?|notebooks?|chromebooks?|macbook( air| pro)?|ultrabook|2-in-1|desktop (pc|computer)|all-in-one|aio\b|mini pc|imac|mac mini|tablets?|ipad( air| pro| mini)?|galaxy tab|fire (hd|max)|kindle|e-?readers?|surface (pro|laptop|go)|vivobook|zenbook|ideapad|thinkpad|copilot\+ pc)\b/i;
const HEADPHONE_RX = /\b(headphones?|earbuds?|earphones?|airpods|headsets?|in-ear|over-ear|on-ear|ear buds)\b/i;
const AUDIO_RX = /\b(speakers?|soundbars?|sound bars?|subwoofers?|receivers?|turntables?|record players?|home theater|amplifiers?|amps?\b|stereo systems?|boombox|radios?|party ?box|jukebox)\b/i;
const GAMING_RX = /\b(playstation|ps5|ps4|xbox|nintendo|switch (oled|lite|2)|steam deck|consoles?|controllers?|gamepads?|joy-?cons?|racing wheels?|vr headsets?|meta quest|quest \d|gaming)\b/i;
const CAMERA_RX = /\b(cameras?|camcorders?|dslr|mirrorless|lens(es)?\b|gopro|action cam|instant camera|instax|drones?|dji)\b/i;
const SECURITY_RX = /\b(security (camera|system|cam)|doorbells?|ring (video|stick|spotlight|floodlight|indoor|outdoor)|wyze|blink|arlo|eufy ?cam|nvr|dvr|surveillance|baby monitors?|smart (plugs?|bulbs?|locks?|lights?|displays?|speakers?)|echo (dot|show|pop)|nest (hub|cam|doorbell)|google home|alexa|smart home|floodlight cam|spotlight cam|ip cam(era)?|wi-?fi (ip |security |indoor |outdoor )?cam(era)?|spotlight|night vision|pan[- ]tilt|pet cam(era)?|indoor cam(era)?|outdoor cam(era)?)\b/i;
const WATCH_RX = /\b(smart ?watch(es)?|apple watch|galaxy watch|fitbit|garmin (forerunner|venu|fenix|vivoactive|instinct)|fitness trackers?|activity trackers?|watch (series|se|ultra))\b/i;
const CAR_RX = /\b(car (stereo|audio|speakers?|amplifier|subwoofer)|dash ?cams?|head units?|marine (speakers?|stereo)|carplay receiver|double din|single din)\b/i;
const COMPONENT_RX = /\b(motherboards?|processors?|cpus?|graphics cards?|gpus?|geforce rtx|radeon rx|video cards?|ram|ddr[45]|memory (kit|module)|ssds?|nvme|solid state drives?|m\.2|power supply|psu|cpu coolers?|aio cooler|pc case|computer case)\b/i;
const MONITOR_RX = /\b(monitors?)\b/i;

/** The aisle for one product, by its name (and the store's own category as a last hint). */
export function techAisle(name, hint = "") {
  const n = String(name || "");
  if (SECURITY_RX.test(n)) return "tech_casa_inteligente";
  if (CAR_RX.test(n)) return "tech_auto";
  /* "Case for iPhone 16", "Charger for Galaxy Watch": the accessory wins
     over the device it names. A device sold WITH an accessory leads with
     the device ("iPhone 15 with charger" is a phone). */
  const acc = ACCESSORY_RX.exec(n), dev = PHONE_RX.exec(n) || COMPUTER_RX.exec(n) || WATCH_RX.exec(n) || GAMING_RX.exec(n);
  /* ...and a name that ENDS on the accessory ("Galaxy A11 Commuter Series
     Lite Case") is the accessory. */
  const tail = n.replace(/\s+[-–(\[|,].*$/, "").trim().split(/\s+/).slice(-3).join(" ");
  const soldWith = acc && /\bwith\b/i.test(n.slice(0, acc.index));
  /* The head noun: the last words before "with" / "for" / a dash
     ("Tablet Keyboard Case with Soccer Design" is a case). */
  const head = n.split(/\s+(?:with|for|compatible|fits)\s+|\s+[-–|,(]\s*/i)[0].trim().split(/\s+/).slice(-2).join(" ");
  const headIsAccessory = ACCESSORY_RX.test(head) && !(dev && new RegExp(dev[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i").test(head));
  const accessoryFirst = acc && (headIsAccessory || (!soldWith && (!dev || acc.index < dev.index || /\b(for|compatible with|fits)\b/i.test(n.slice(0, acc.index + 40)) || ACCESSORY_RX.test(tail))));
  if (accessoryFirst && !HEADPHONE_RX.test(n.slice(0, (acc && acc.index) || 0))) return "tech_accesorios";
  if (WATCH_RX.test(n)) return "tech_relojes";
  /* A device named after "for" is what the product fits, not what it is
     ("VR Glasses for Android Smartphone", "Headset for PC PS5 Laptop"). */
  const forAt = n.search(/\b(for|compatible with)\b/i);
  const before = (m) => m && (forAt < 0 || m.index < forAt);
  if (before(HEADPHONE_RX.exec(n))) return "tech_audifonos";
  /* A tablet says "Cellular" and "Unlocked" too: the computer is read
     before the phone. */
  if (before(COMPUTER_RX.exec(n))) return "tech_computadoras";
  if (forAt >= 0 && (PHONE_RX.test(n.slice(forAt)) || COMPUTER_RX.test(n.slice(forAt))) && !PHONE_RX.test(n.slice(0, forAt))) return "tech_accesorios";
  if (PHONE_RX.test(n)) return "tech_celulares";
  /* "8GB RAM" in a phone's name is a spec, not a part: components only
     once no device matched; an external or portable drive is storage. */
  if (COMPONENT_RX.test(n)) return /(external|portable|thumb)/i.test(n) ? "tech_accesorios" : "tech_componentes";
  if (HEADPHONE_RX.test(n)) return "tech_audifonos";
  if (GAMING_RX.test(n)) return "tech_gaming";
  if (CAMERA_RX.test(n)) return "tech_camaras";
  if (AUDIO_RX.test(n)) return "tech_audio";
  if (MONITOR_RX.test(n)) return "tech_accesorios";
  const h = String(hint || "").toLowerCase();
  if (/phone|celular|cellular/.test(h)) return "tech_accesorios";      /* a phone-aisle item that names no handset */
  if (/headphone|earbud/.test(h)) return "tech_audifonos";
  if (/watch|wearable/.test(h)) return "tech_relojes";
  if (/game|gaming|console/.test(h)) return "tech_gaming";
  if (/camera|drone/.test(h)) return "tech_camaras";
  if (/audio|speaker/.test(h)) return "tech_audio";
  if (/laptop|computer|tablet/.test(h)) return "tech_accesorios";    /* a peripheral, not the computer */
  if (/smart.home|security/.test(h)) return "tech_casa_inteligente";
  if (/motherboard|ssd|component/.test(h)) return "tech_componentes";
  return "tech_accesorios";
}

/* NOT ELECTRONICS: what a store's electronics feed carried that is no
   electronics at all -- fishing bags, staplers, scooter gear (the audit's
   "junk drawer"). It never enters Electrónica; counted for its re-route. */
const TECH_WORD_RX = /\b(usb|bluetooth|wireless|wi-?fi|hdmi|lightning|usb-c|charg\w*|batter\w*|electric\w*|digital|smart|led|lcd|oled|4k|8k|1080p|hd\b|audio|video|stereo|speaker\w*|headphone\w*|earbud\w*|camera\w*|lens|drone|laptop|computer|pc\b|tablet|ipad|phone\w*|watch|tracker|console|gaming|controller|keyboard|mouse|monitor|router|modem|mesh|ssd|nvme|ram|ddr\d|gb\b|tb\b|mah|watts?|volts?|\d+w\b|projector|tv\b|streaming|roku|alexa|echo|nest|ring|power|cable|adapter|remote|mic(rophone)?|radio|gps|dash ?cam|subwoofer|amplifier|turntable|receiver|vr|motherboard|processor|cpu|gpu|graphics|apple|samsung|sony|bose|jbl|logitech|anker|beats)\b/i;
/* Device and brand names that carry no generic word ("iPhone 17 Pro",
   "PlayStation Portal"). */
const DEVICE_NAME_RX = /\b(iphone|ipad|ipod|galaxy|pixel|airpods|airtag|macbook|chromebook|imac|kindle|gopro|insta360|playstation|ps[45]|xbox|nintendo|switch|steam deck|fitbit|garmin|forerunner|sonos|skullcandy|dji|avata|canon|nikon|fujifilm|instax|polaroid|lenovo|asus|acer|msi|dell|hp|lg|tcl|motorola|oneplus|razer|corsair|hyperx|jabra|sennheiser|marshall|kodak|roomba|wyze|eufy|arlo|blink|kasa|meta quest|oculus|soundbar|subwoofer|sub|cams?|indoorcam|drones?|telescope|walkie talkies?|printers?|raspberry pi)\b/i;
/* What an electronics feed carries that is something else: the audit's
   junk drawer -- bags and sleeves, office and school supplies, scooter
   gear, kitchen fittings, movies and music. Re-routed, never shown in
   Electrónica. The store's own collection is only believed for a name
   that is none of these. */
const NOT_TECH_RX = /\b(backpacks?|bags?|sleeves?|slipcase|totes?|pencils?|pens?\b|markers?|paper|index cards?|glue|staplers?|binders?|folders?|notebooks? \(paper\)|sticky notes|organizers?|shredders?|helmets?|elbow|knee pads|scooter|faucets?|fishing|tackle|dvd|blu-?ray|cd\b|vinyl record|greatest hits|season \d|volume \d|the movie|ink cartridges?|toner|paperback|hardcover|audiobook)\b/i;
const TECH_HINT_RX = /\b(phones?|headphones?|cameras?|computers?|laptops?|gaming|audio|speakers?|watches|wearables|tablets?|monitors?|networking|motherboards?|ssd|keyboards?|smart-home|security|electronics|accessories-power|car-audio)\b/i;
export function isTechProduct(name, hint = "") {
  const n = String(name || "");
  if (NOT_TECH_RX.test(n)) return false;
  return TECH_WORD_RX.test(n) || DEVICE_NAME_RX.test(n) || TECH_HINT_RX.test(String(hint || ""));
}
