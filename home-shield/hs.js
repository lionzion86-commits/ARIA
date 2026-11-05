/* Aria Home Shield: the homeowner pages (index.html and caso.html).
   No framework, no shop bundle. One i18n object holds every word in
   English and Spanish. One <audio> element and one speech channel carry
   Aria's voice (hs-tts); the mic goes to hs-stt; turns go to hs-chat. */
(function () {
  "use strict";
  var FN = "/.netlify/functions/";
  var doc = document, root = doc.documentElement;

  /* ================================================================
     COPY. Every visible word, both languages.
     ================================================================ */
  var I18N = {
    en: {
      "a11y.skip": "Skip to content",
      "nav.pros": "For pros",
      "nav.mycase": "My case",
      "lang.toggle": "Español",
      "lang.aria": "Ver en español",
      "hero.eyebrow": "Free for Florida homeowners",
      "hero.title": "Your home. Your claim. Someone finally on your side.",
      "hero.sub": "Aria knows insurance the way a lawyer, a public adjuster, a roofer and an agent do, all at once. She explains your options in plain words, builds your case, and connects you only with the licensed local pros you choose.",
      "hero.cta": "Talk to Aria — free",
      "hero.cta2": "Upload my policy for a free review",
      "hero.trust1": "Free for homeowners",
      "hero.trust2": "You choose who contacts you",
      "hero.trust3": "Never sold or shared without your approval",
      "star.aria": "Tap Aria to talk with her",
      "state.idle": "Tap Aria to talk",
      "state.starting": "One moment…",
      "state.listening": "I'm listening. Just talk.",
      "state.hearing": "Listening…",
      "state.thinking": "Thinking…",
      "state.speaking": "Speaking. Talk anytime to interrupt.",
      "intro.line1": "Hey, I'm Aria. I'm in your corner and I'm always in your corner. I'm your lawyer, your public adjuster, your roofer, all into one.",
      "intro.line2": "Upload your policy — I can dissect it: strong points, weak points, a better option if one exists, and my best recommendation.",
      "listen": "Listen",
      "stop": "Stop",
      "doors.title": "Where would you like to start?",
      "doors.sub": "Pick a door. Aria takes it from there, one question at a time.",
      "door1.tag": "Start here",
      "door1.title": "Review my policy",
      "door1.body": "No damage needed. Upload your policy and Aria tells you what's strong, what's weak, where it can improve, and how it compares to local options.",
      "door1.cta": "Upload my policy",
      "door2.title": "Claim denied",
      "door2.body": "Denied or underpaid? Learn what you can do: get the decision in writing, dispute it, reopen or supplement the claim, appraisal or mediation, and who can fight it with you.",
      "door2.cta": "Talk about my claim",
      "door3.title": "Home damage",
      "door3.body": "Roof damage, a leak or water damage, or you need an inspection. If water is coming in right now, Aria starts with what to do this minute.",
      "chip.roof": "Roof damage",
      "chip.leak": "Leak or water damage",
      "chip.inspect": "Inspection",
      "pros.title": "Pro enrollment",
      "pros.body": "Licensed public adjusters, attorneys, roofers, insurance agents and inspectors in Florida: join the open platform. You see an anonymous case, homeowners see your license, and they choose.",
      "pros.cta": "Enroll as a pro",
      "team.title": "Who Aria can connect you with",
      "team.pa": "Licensed to work your claim for you, not for the insurer.",
      "team.attorney": "For coverage disputes, denials and lawsuits.",
      "team.roofer": "Inspections, estimates, repairs and temporary protection.",
      "team.agent": "To shop for a stronger policy.",
      "team.inspector": "Independent inspections and reports.",
      "how.title": "How it works",
      "how.1t": "Tell Aria what happened.",
      "how.1b": "Talk or type. She asks one question at a time, and if water is coming in, she starts with what to do right now.",
      "how.2t": "She builds your case and tells you who you need.",
      "how.2b": "A clear, private summary of your situation, your options in plain words, and the kind of licensed pro that fits.",
      "how.3t": "Licensed local pros request your case. You pick.",
      "how.3b": "They see an anonymous summary only. You review their license and their message, and you choose. Only then do they get your contact.",
      "rights.title": "Your rights, in plain language",
      "rights.sub": "Florida first. General information, not legal advice: your policy and a licensed professional have the final word.",
      "rights.1t": "You can dispute a decision.",
      "rights.1b": "If you disagree with a denial or with the amount, you can tell your insurer in writing and send your evidence: photos, estimates, receipts.",
      "rights.2t": "You can ask for it in writing.",
      "rights.2b": "Ask the insurer to explain the denial or the payment in writing, including the policy language it relied on. You can also ask for a complete copy of your policy.",
      "rights.3t": "You can get a public adjuster.",
      "rights.3b": "A licensed public adjuster works for you, not for the insurer. You can check a license with the Florida Department of Financial Services before you sign anything.",
      "rights.4t": "You can ask about mediation.",
      "rights.4b": "The Florida Department of Financial Services runs a mediation program for many residential property claims. Ask whether yours qualifies.",
      "rights.5t": "You may have more options.",
      "rights.5b": "Many policies have an appraisal clause for disagreements about the amount, and a claim can sometimes be reopened or supplemented when new damage appears.",
      "rights.6t": "Deadlines matter.",
      "rights.6b": "Reporting a claim, supplementing it and filing a lawsuit all have time limits, and Florida has changed some of them in recent years. Verify yours in your policy and with a licensed professional.",
      "privacy.title": "Our privacy promise",
      "privacy.1t": "Your case stays anonymous.",
      "privacy.1b": "Pros see the issue, your ZIP area and an anonymous summary. Never your name, phone, email, address or policy number.",
      "privacy.2t": "You approve every connection.",
      "privacy.2b": "Your contact goes only to the pro you pick, and only after you pick them.",
      "privacy.3t": "Never sold. No spam calls.",
      "privacy.3b": "We never sell your information. Nobody calls you unless you chose them.",
      "privacy.4t": "Your documents are private.",
      "privacy.4b": "Your policy is stored privately, and you can delete your case and documents at any time.",
      "faq.title": "Questions",
      "faq.q1": "Is it really free?",
      "faq.a1": "Yes. Aria Home Shield is free for homeowners. If you hire a professional, their fees are between you and them, and they should explain them before you sign anything.",
      "faq.q2": "Who is Aria?",
      "faq.a2": "Aria is an AI guide. She knows how claims, policies and repairs work and explains them in plain words. She is not a licensed attorney, public adjuster, insurance agent or contractor; she connects you with licensed professionals.",
      "faq.q3": "Will my phone start ringing?",
      "faq.a3": "No. Nobody gets your contact until you approve a specific pro, and only that pro can reach you.",
      "faq.q4": "What happens to my policy when I upload it?",
      "faq.a4": "It is stored privately and used to review it for you. A pro sees it only if you connect with them. You can delete it at any time from your case page.",
      "faq.q5": "Do I need damage to start?",
      "faq.a5": "No. Many people start with a policy review, before hurricane season, to find out whether their coverage is weak.",
      "faq.q6": "Where do you work?",
      "faq.a6": "We are starting in Florida. Anywhere in the US, Aria can explain your options, and we connect you as licensed pros join in your area.",
      "footer.disclaimer": "Aria provides general information, not legal advice. Aria is not a licensed attorney, public adjuster, insurance agent or contractor; she connects you with licensed professionals.",
      "footer.emergency": "If anyone is in danger, call 911.",
      "chat.placeholder": "Type your message",
      "chat.send": "Send",
      "chat.mic": "Talk to Aria",
      "chat.micStop": "Stop talking with Aria",
      "chat.mute": "Mute Aria",
      "chat.unmute": "Unmute Aria",
      "chat.close": "Close",
      "chat.upload": "Upload my policy",
      "chat.disclaimer": "General information, not legal advice. Aria is not a licensed attorney, public adjuster, insurance agent or contractor; she connects you with licensed professionals.",
      "starter.denied": "My insurance claim was denied or underpaid.",
      "starter.roof": "My roof is damaged.",
      "starter.leak": "I have a leak or water damage.",
      "starter.inspect": "I need an inspection.",
      "err.voice": "Aria's voice isn't available right now ({e}). Her words stay here on screen.",
      "err.mic": "I couldn't use the microphone ({e}). You can type instead.",
      "err.chat": "Something went wrong ({e}). Please try again.",
      "err.stt": "I couldn't hear that clearly ({e}). Please try again or type.",
      "issue.denied_claim": "Denied claim",
      "issue.underpaid_claim": "Underpaid claim",
      "issue.roof": "Roof damage",
      "issue.leak_water": "Leak or water damage",
      "issue.policy_review": "Policy review",
      "issue.inspection": "Inspection",
      "issue.other": "Something else",
      "trade.public_adjuster": "Public adjuster",
      "trade.attorney": "Attorney",
      "trade.roofer": "Roofer",
      "trade.insurance_agent": "Insurance agent",
      "trade.inspector": "Inspector",
      "urg.emergency": "Emergency, happening now",
      "urg.soon": "Soon",
      "urg.planning": "Planning ahead",
      "case.title": "Your case",
      "case.sub": "Review it and change anything. Pros see only this anonymous summary until you approve one of them.",
      "case.fileTitle": "Your private file",
      "case.fileSub": "Your policy is kept privately with your file. Nobody sees your contact until you approve a pro.",
      "case.issue": "What it's about",
      "case.trades": "Who you need",
      "case.zip": "ZIP code of the home",
      "case.urgency": "How urgent",
      "case.summary": "Anonymous summary",
      "case.summaryHint": "Keep names, phone numbers, addresses and policy numbers out of the summary.",
      "case.contact": "How the pro you approve can reach you",
      "case.name": "Name",
      "case.phone": "Phone",
      "case.email": "Email",
      "case.pref": "Preferred contact",
      "pref.phone": "Call",
      "pref.text": "Text",
      "pref.email": "Email",
      "case.consent": "I agree to be contacted only by professionals I approve. Aria Home Shield never sells my information.",
      "case.send": "Send my case",
      "case.sendFile": "Create my file and upload",
      "case.sending": "Sending…",
      "case.needContact": "Add your name and a phone number or email.",
      "case.needZip": "Add the 5-digit ZIP code of the home.",
      "case.needConsent": "Check the box to agree before sending.",
      "case.sentTitle": "Your case is in.",
      "case.sentBody": "Licensed local pros can now request your anonymous case. You decide who gets your contact. Here is your private link:",
      "case.save": "Save this link. It is the only way back to your case, and anyone with it can see your case.",
      "case.open": "Open my case page",
      "case.copy": "Copy link",
      "case.copied": "Copied",
      "policy.fileTitle": "Your policy is ready to upload. First, your private file:",
      "policy.uploading": "Uploading your policy privately…",
      "policy.reviewing": "Reading your policy…",
      "policy.found": "What I found",
      "policy.strong": "What's strong",
      "policy.weak": "What's weak",
      "policy.improve": "Where it can improve",
      "policy.better": "Find me a better policy",
      "policy.betterDone": "Done. Licensed insurance agents near you can now request your case to quote a better policy. You still choose who contacts you.",
      "policy.betterLater": "I added an insurance agent to your case. When you send it, licensed agents near you can offer to quote a better policy. You still choose who contacts you.",
      "policy.err": "I couldn't review the policy ({e}).",
      "policy.size": "That file is over 10 MB. Please upload a smaller file or a PDF.",
      "policy.type": "Please upload a PDF, JPG, PNG or HEIC file.",
      "policy.summary": "Homeowner wants a review of their homeowners insurance policy: strengths, weaknesses and whether a better option exists.",
      "caso.title": "Your case",
      "caso.sub": "Private to you. This page checks for news every 15 seconds.",
      "caso.loading": "Loading your case…",
      "caso.bad": "This link isn't valid, or the case was deleted.",
      "caso.s1": "Received",
      "caso.s2": "Pros reviewing",
      "caso.s3": "Offers",
      "caso.s4": "Connected",
      "caso.summary": "Your anonymous summary",
      "caso.offers": "Pros who want to help",
      "caso.none": "No offers yet. Licensed pros in your area are reviewing your anonymous case. You'll see their offers here.",
      "caso.license": "License",
            "caso.decline": "Decline",
      "caso.declined": "Declined",
      "caso.connected": "You're connected",
      "caso.connectedBody": "{name} now has your contact, and here is theirs. You stay in control: talk with them before you sign anything.",
      "caso.talkFirst": "Talk first through Aria Home Shield",
      "caso.talkFirstNote": "Talking first keeps your contact private. You message here, and share your contact only if and when you decide.",
      "caso.share": "Share my contact",
      "caso.talking": "You're talking privately. Your contact is not shared.",
      "caso.sharedNote": "You shared your contact with this professional.",
      "caso.thread": "Private messages with {name}",
      "caso.threadEmpty": "No messages yet. Ask anything: how they would handle your case, their fees, their availability.",
      "caso.threadPh": "Write a message",
      "caso.threadPrivate": "Phone numbers, emails and addresses are removed from your messages until you choose to share your contact.",
      "caso.scrubbed": "We removed contact details from that message to keep you private.",
      "caso.verified": "verified",
      "lic.public_adjuster": "Public adjuster",
      "lic.attorney": "Attorney",
      "lic.roofing_contractor": "Roofing contractor",
      "lic.general_contractor": "General contractor",
      "lic.insurance_agent": "Insurance agent",
      "lic.home_inspector": "Home inspector",
      "lic.other": "License",
      "caso.delete": "Delete my case and documents",
      "caso.deleteConfirm": "Yes, delete everything",
      "caso.deleteAsk": "This deletes your case and every document you uploaded. It can't be undone.",
      "caso.deleted": "Your case and documents were deleted.",
      "caso.back": "Back to Aria Home Shield",
      "caso.err": "That didn't work ({e}). Please try again."
    },
    es: {
      "a11y.skip": "Ir al contenido",
      "nav.pros": "Para profesionales",
      "nav.mycase": "Mi caso",
      "lang.toggle": "English",
      "lang.aria": "View in English",
      "hero.eyebrow": "Gratis para dueños de casa en Florida",
      "hero.title": "Tu casa. Tu reclamo. Por fin alguien de tu lado.",
      "hero.sub": "Aria conoce los seguros como un abogado, un ajustador público, un techador y un agente, todo a la vez. Te explica tus opciones en palabras sencillas, arma tu caso y te conecta solo con los profesionales locales con licencia que tú elijas.",
      "hero.cta": "Habla con Aria — gratis",
      "hero.cta2": "Sube tu póliza para una revisión gratis",
      "hero.trust1": "Gratis para dueños de casa",
      "hero.trust2": "Tú eliges quién te contacta",
      "hero.trust3": "Nunca vendemos ni compartimos tus datos sin tu permiso",
      "star.aria": "Toca a Aria para hablar con ella",
      "state.idle": "Toca a Aria para hablar",
      "state.starting": "Un momento…",
      "state.listening": "Te escucho. Habla con confianza.",
      "state.hearing": "Escuchando…",
      "state.thinking": "Pensando…",
      "state.speaking": "Hablando. Interrúmpeme cuando quieras.",
      "intro.line1": "Hola, soy Aria. Estoy de tu lado, y siempre voy a estar de tu lado. Soy tu abogada, tu ajustadora pública y tu techadora, todo en una.",
      "intro.line2": "Sube tu póliza y la desmenuzo: sus puntos fuertes, sus puntos débiles, una mejor opción si existe, y mi mejor recomendación.",
      "listen": "Escuchar",
      "stop": "Detener",
      "doors.title": "¿Por dónde quieres empezar?",
      "doors.sub": "Elige una puerta. Aria te guía desde ahí, una pregunta a la vez.",
      "door1.tag": "Empieza aquí",
      "door1.title": "Revisar mi póliza",
      "door1.body": "No necesitas tener daños. Sube tu póliza y Aria te dice qué está fuerte, qué está débil, dónde puede mejorar y cómo se compara con las opciones de tu zona.",
      "door1.cta": "Subir mi póliza",
      "door2.title": "Reclamo negado",
      "door2.body": "¿Te lo negaron o te pagaron de menos? Conoce lo que puedes hacer: pedir la decisión por escrito, disputarla, reabrir o complementar el reclamo, tasación o mediación, y quién puede pelearlo contigo.",
      "door2.cta": "Hablar de mi reclamo",
      "door3.title": "Daños en la casa",
      "door3.body": "Daños en el techo, una filtración o daños por agua, o necesitas una inspección. Si está entrando agua ahora mismo, Aria empieza por lo que debes hacer en este momento.",
      "chip.roof": "Daños en el techo",
      "chip.leak": "Filtración o daños por agua",
      "chip.inspect": "Inspección",
      "pros.title": "Registro de profesionales",
      "pros.body": "Ajustadores públicos, abogados, techadores, agentes de seguros e inspectores con licencia en Florida: únanse a la plataforma abierta. Ustedes ven un caso anónimo, el dueño de casa ve su licencia, y él decide.",
      "pros.cta": "Registrarme como profesional",
      "team.title": "Con quién te puede conectar Aria",
      "team.pa": "Con licencia para trabajar tu reclamo por ti, no por la aseguradora.",
      "team.attorney": "Para disputas de cobertura, reclamos negados y demandas.",
      "team.roofer": "Inspecciones, presupuestos, reparaciones y protección temporal.",
      "team.agent": "Para buscar una póliza más fuerte.",
      "team.inspector": "Inspecciones e informes independientes.",
      "how.title": "Cómo funciona",
      "how.1t": "Cuéntale a Aria qué pasó.",
      "how.1b": "Habla o escribe. Te hace una pregunta a la vez, y si está entrando agua, empieza por lo que debes hacer ahora mismo.",
      "how.2t": "Arma tu caso y te dice a quién necesitas.",
      "how.2b": "Un resumen claro y privado de tu situación, tus opciones en palabras sencillas y el tipo de profesional con licencia que te conviene.",
      "how.3t": "Profesionales locales con licencia piden tu caso. Tú eliges.",
      "how.3b": "Solo ven un resumen anónimo. Tú revisas su licencia y su mensaje, y tú decides. Solo entonces reciben tus datos de contacto.",
      "rights.title": "Tus derechos, en palabras sencillas",
      "rights.sub": "Empezamos por Florida. Información general, no asesoría legal: tu póliza y un profesional con licencia tienen la última palabra.",
      "rights.1t": "Puedes disputar una decisión.",
      "rights.1b": "Si no estás de acuerdo con una negación o con el monto, puedes decírselo a tu aseguradora por escrito y enviar tus pruebas: fotos, presupuestos, recibos.",
      "rights.2t": "Puedes pedirlo por escrito.",
      "rights.2b": "Pide a la aseguradora que te explique por escrito la negación o el pago, incluido el texto de la póliza en el que se basó. También puedes pedir una copia completa de tu póliza.",
      "rights.3t": "Puedes contratar a un ajustador público.",
      "rights.3b": "Un ajustador público con licencia trabaja para ti, no para la aseguradora. Puedes verificar su licencia con el Departamento de Servicios Financieros de Florida antes de firmar nada.",
      "rights.4t": "Puedes preguntar por la mediación.",
      "rights.4b": "El Departamento de Servicios Financieros de Florida tiene un programa de mediación para muchos reclamos de propiedad residencial. Pregunta si el tuyo califica.",
      "rights.5t": "Puede que tengas más opciones.",
      "rights.5b": "Muchas pólizas tienen una cláusula de tasación para desacuerdos sobre el monto, y a veces un reclamo se puede reabrir o complementar cuando aparecen daños nuevos.",
      "rights.6t": "Los plazos importan.",
      "rights.6b": "Reportar un reclamo, complementarlo y presentar una demanda tienen plazos, y Florida ha cambiado algunos en los últimos años. Verifica los tuyos en tu póliza y con un profesional con licencia.",
      "privacy.title": "Nuestra promesa de privacidad",
      "privacy.1t": "Tu caso es anónimo.",
      "privacy.1b": "Los profesionales ven el tipo de problema, tu zona por código postal y un resumen anónimo. Nunca tu nombre, teléfono, correo, dirección ni número de póliza.",
      "privacy.2t": "Tú apruebas cada conexión.",
      "privacy.2b": "Tus datos de contacto van solo al profesional que tú elijas, y solo después de que lo elijas.",
      "privacy.3t": "Nunca los vendemos. Cero llamadas no deseadas.",
      "privacy.3b": "Nunca vendemos tu información. Nadie te llama a menos que tú lo hayas elegido.",
      "privacy.4t": "Tus documentos son privados.",
      "privacy.4b": "Tu póliza se guarda en privado, y puedes borrar tu caso y tus documentos cuando quieras.",
      "faq.title": "Preguntas",
      "faq.q1": "¿De verdad es gratis?",
      "faq.a1": "Sí. Aria Home Shield es gratis para los dueños de casa. Si contratas a un profesional, sus honorarios son entre tú y él, y te los debe explicar antes de que firmes nada.",
      "faq.q2": "¿Quién es Aria?",
      "faq.a2": "Aria es una guía de inteligencia artificial. Sabe cómo funcionan los reclamos, las pólizas y las reparaciones, y te lo explica en palabras sencillas. No es abogada, ajustadora pública, agente de seguros ni contratista con licencia; te conecta con profesionales con licencia.",
      "faq.q3": "¿Me van a empezar a llamar?",
      "faq.a3": "No. Nadie recibe tus datos hasta que tú apruebes a un profesional específico, y solo ese profesional te puede contactar.",
      "faq.q4": "¿Qué pasa con mi póliza cuando la subo?",
      "faq.a4": "Se guarda en privado y se usa para revisarla para ti. Un profesional la ve solo si te conectas con él. Puedes borrarla cuando quieras desde la página de tu caso.",
      "faq.q5": "¿Necesito tener daños para empezar?",
      "faq.a5": "No. Mucha gente empieza con una revisión de su póliza, antes de la temporada de huracanes, para saber si su cobertura está débil.",
      "faq.q6": "¿Dónde trabajan?",
      "faq.a6": "Empezamos en Florida. En cualquier parte de Estados Unidos Aria te puede explicar tus opciones, y te conectamos a medida que se suman profesionales con licencia en tu zona.",
      "footer.disclaimer": "Aria ofrece información general, no asesoría legal. Aria no es abogada, ajustadora pública, agente de seguros ni contratista con licencia; te conecta con profesionales con licencia.",
      "footer.emergency": "Si alguien está en peligro, llama al 911.",
      "chat.placeholder": "Escribe tu mensaje",
      "chat.send": "Enviar",
      "chat.mic": "Hablar con Aria",
      "chat.micStop": "Dejar de hablar con Aria",
      "chat.mute": "Silenciar a Aria",
      "chat.unmute": "Activar la voz de Aria",
      "chat.close": "Cerrar",
      "chat.upload": "Subir mi póliza",
      "chat.disclaimer": "Información general, no asesoría legal. Aria no es abogada, ajustadora pública, agente de seguros ni contratista con licencia; te conecta con profesionales con licencia.",
      "starter.denied": "Mi aseguradora me negó el reclamo o me pagó de menos.",
      "starter.roof": "Mi techo está dañado.",
      "starter.leak": "Tengo una filtración o daños por agua.",
      "starter.inspect": "Necesito una inspección.",
      "err.voice": "La voz de Aria no está disponible ahora ({e}). Sus palabras quedan aquí en pantalla.",
      "err.mic": "No pude usar el micrófono ({e}). Puedes escribir.",
      "err.chat": "Algo salió mal ({e}). Inténtalo otra vez.",
      "err.stt": "No te escuché bien ({e}). Inténtalo otra vez o escribe.",
      "issue.denied_claim": "Reclamo negado",
      "issue.underpaid_claim": "Reclamo pagado de menos",
      "issue.roof": "Daños en el techo",
      "issue.leak_water": "Filtración o daños por agua",
      "issue.policy_review": "Revisión de póliza",
      "issue.inspection": "Inspección",
      "issue.other": "Otra cosa",
      "trade.public_adjuster": "Ajustador público",
      "trade.attorney": "Abogado",
      "trade.roofer": "Techador",
      "trade.insurance_agent": "Agente de seguros",
      "trade.inspector": "Inspector",
      "urg.emergency": "Emergencia, está pasando ahora",
      "urg.soon": "Pronto",
      "urg.planning": "Con tiempo",
      "case.title": "Tu caso",
      "case.sub": "Revísalo y cambia lo que quieras. Los profesionales solo ven este resumen anónimo hasta que tú apruebes a uno.",
      "case.fileTitle": "Tu archivo privado",
      "case.fileSub": "Tu póliza se guarda en privado con tu archivo. Nadie ve tus datos hasta que apruebes a un profesional.",
      "case.issue": "De qué se trata",
      "case.trades": "A quién necesitas",
      "case.zip": "Código postal de la casa",
      "case.urgency": "Qué tan urgente es",
      "case.summary": "Resumen anónimo",
      "case.summaryHint": "No pongas nombres, teléfonos, direcciones ni números de póliza en el resumen.",
      "case.contact": "Cómo te puede contactar el profesional que apruebes",
      "case.name": "Nombre",
      "case.phone": "Teléfono",
      "case.email": "Correo",
      "case.pref": "Cómo prefieres que te contacten",
      "pref.phone": "Llamada",
      "pref.text": "Mensaje de texto",
      "pref.email": "Correo",
      "case.consent": "Acepto que me contacten solo los profesionales que yo apruebe. Aria Home Shield nunca vende mi información.",
      "case.send": "Enviar mi caso",
      "case.sendFile": "Crear mi archivo y subir",
      "case.sending": "Enviando…",
      "case.needContact": "Agrega tu nombre y un teléfono o correo.",
      "case.needZip": "Agrega el código postal de 5 dígitos de la casa.",
      "case.needConsent": "Marca la casilla para aceptar antes de enviar.",
      "case.sentTitle": "Tu caso está enviado.",
      "case.sentBody": "Los profesionales locales con licencia ya pueden pedir tu caso anónimo. Tú decides quién recibe tus datos. Este es tu enlace privado:",
      "case.save": "Guarda este enlace. Es la única forma de volver a tu caso, y cualquiera que lo tenga puede ver tu caso.",
      "case.open": "Abrir la página de mi caso",
      "case.copy": "Copiar enlace",
      "case.copied": "Copiado",
      "policy.fileTitle": "Tu póliza está lista para subir. Primero, tu archivo privado:",
      "policy.uploading": "Subiendo tu póliza en privado…",
      "policy.reviewing": "Leyendo tu póliza…",
      "policy.found": "Lo que encontré",
      "policy.strong": "Lo que está fuerte",
      "policy.weak": "Lo que está débil",
      "policy.improve": "Dónde puede mejorar",
      "policy.better": "Búscame una mejor póliza",
      "policy.betterDone": "Listo. Los agentes de seguros con licencia de tu zona ya pueden pedir tu caso para cotizarte una mejor póliza. Tú sigues eligiendo quién te contacta.",
      "policy.betterLater": "Agregué un agente de seguros a tu caso. Cuando lo envíes, los agentes con licencia de tu zona podrán ofrecerte una cotización mejor. Tú sigues eligiendo quién te contacta.",
      "policy.err": "No pude revisar la póliza ({e}).",
      "policy.size": "Ese archivo pesa más de 10 MB. Sube uno más liviano o un PDF.",
      "policy.type": "Sube un archivo PDF, JPG, PNG o HEIC.",
      "policy.summary": "El dueño de casa quiere una revisión de su póliza de seguro de vivienda: puntos fuertes, puntos débiles y si existe una mejor opción.",
      "caso.title": "Tu caso",
      "caso.sub": "Privado, solo para ti. Esta página revisa si hay novedades cada 15 segundos.",
      "caso.loading": "Cargando tu caso…",
      "caso.bad": "Este enlace no es válido, o el caso fue borrado.",
      "caso.s1": "Recibido",
      "caso.s2": "Profesionales revisando",
      "caso.s3": "Ofertas",
      "caso.s4": "Conectado",
      "caso.summary": "Tu resumen anónimo",
      "caso.offers": "Profesionales que quieren ayudarte",
      "caso.none": "Todavía no hay ofertas. Los profesionales con licencia de tu zona están revisando tu caso anónimo. Aquí verás sus ofertas.",
      "caso.license": "Licencia",
            "caso.decline": "Rechazar",
      "caso.declined": "Rechazada",
      "caso.connected": "Ya están conectados",
      "caso.connectedBody": "{name} ya tiene tus datos de contacto, y aquí están los suyos. Tú sigues en control: habla con esta persona antes de firmar nada.",
      "caso.talkFirst": "Hablar primero por Aria Home Shield",
      "caso.talkFirstNote": "Hablar primero mantiene tus datos en privado. Se escriben aquí, y compartes tus datos solo si lo decides y cuando lo decidas.",
      "caso.share": "Compartir mis datos",
      "caso.talking": "Están hablando en privado. Tus datos no se han compartido.",
      "caso.sharedNote": "Compartiste tus datos con este profesional.",
      "caso.thread": "Mensajes privados con {name}",
      "caso.threadEmpty": "Todavía no hay mensajes. Pregunta lo que quieras: cómo manejaría tu caso, sus honorarios, su disponibilidad.",
      "caso.threadPh": "Escribe un mensaje",
      "caso.threadPrivate": "Quitamos teléfonos, correos y direcciones de tus mensajes hasta que decidas compartir tus datos.",
      "caso.scrubbed": "Quitamos datos de contacto de ese mensaje para cuidar tu privacidad.",
      "caso.verified": "verificada",
      "lic.public_adjuster": "Ajustador público",
      "lic.attorney": "Abogado",
      "lic.roofing_contractor": "Contratista de techos",
      "lic.general_contractor": "Contratista general",
      "lic.insurance_agent": "Agente de seguros",
      "lic.home_inspector": "Inspector de viviendas",
      "lic.other": "Licencia",
      "caso.delete": "Borrar mi caso y mis documentos",
      "caso.deleteConfirm": "Sí, borrar todo",
      "caso.deleteAsk": "Esto borra tu caso y todos los documentos que subiste. No se puede deshacer.",
      "caso.deleted": "Tu caso y tus documentos fueron borrados.",
      "caso.back": "Volver a Aria Home Shield",
      "caso.err": "No funcionó ({e}). Inténtalo otra vez."
    }
  };
  window.HS_I18N = I18N;

  /* ================================================================
     LANGUAGE
     ================================================================ */
  function store(k, v) {
    try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* private mode */ }
    return null;
  }
  var lang = root.lang === "es" ? "es" : "en";
  function t(key, vars) {
    var s = (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;
    if (vars) s = s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
    return s;
  }
  var langHooks = [];
  function applyLang(next, user) {
    lang = next === "es" ? "es" : "en";
    root.lang = lang;
    var nodes = doc.querySelectorAll("[data-i18n]");
    for (var i = 0; i < nodes.length; i++) nodes[i].textContent = t(nodes[i].getAttribute("data-i18n"));
    nodes = doc.querySelectorAll("[data-i18n-ph]");
    for (i = 0; i < nodes.length; i++) nodes[i].setAttribute("placeholder", t(nodes[i].getAttribute("data-i18n-ph")));
    nodes = doc.querySelectorAll("[data-i18n-aria]");
    for (i = 0; i < nodes.length; i++) { var a = t(nodes[i].getAttribute("data-i18n-aria")); nodes[i].setAttribute("aria-label", a); nodes[i].setAttribute("title", a); }
    var lb = doc.getElementById("hsLang");
    if (lb) lb.setAttribute("lang", lang === "es" ? "en" : "es");
    if (user) {
      store("hs_lang", lang);
      try { var u = new URL(location.href); u.searchParams.set("lang", lang); history.replaceState(null, "", u.pathname + u.search + u.hash); } catch (e) { /* old browser */ }
    }
    for (i = 0; i < langHooks.length; i++) langHooks[i]();
    root.classList.remove("hs-pending");
  }

  /* ================================================================
     ONE VOICE, ONE CHANNEL. Every word Aria says goes through speak():
     one persistent <audio>, unlocked by the first tap; a new speech
     aborts the one in flight (synthesis included) and cancelled audio
     never plays; text is delivered in sentence chunks with real pauses.
     ================================================================ */
  var audio = doc.getElementById("hsAudio");
  var SILENCE = "data:audio/wav;base64,UklGRiwAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQgAAAAAAAAAAAAAAA==";
  var unlocked = false;
  function unlockAudio() {
    if (unlocked || !audio) return;
    unlocked = true;
    try { audio.src = SILENCE; var p = audio.play(); if (p && p.catch) p.catch(function () {}); } catch (e) { /* ignore */ }
  }
  doc.addEventListener("pointerdown", unlockAudio, { capture: true, passive: true });
  doc.addEventListener("keydown", unlockAudio, { capture: true, passive: true });

  var muted = store("hs_muted") === "1";
  var speech = { id: 0, ac: null, owner: null, onStop: null, active: false };
  window.HS_SPEECH = speech;

  function chunkText(text) {
    var s = String(text || "").replace(/\s+/g, " ").trim();
    if (!s) return [];
    var parts = s.match(/[^.!?…]+[.!?…]+["”’)]*\s*|[^.!?…]+$/g) || [s];
    var out = [], cur = "";
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].trim();
      if (!p) continue;
      // First chunk alone (fast start), then sentences grouped up to ~260 chars.
      if (!out.length && !cur) { out.push(p); continue; }
      if ((cur + " " + p).trim().length > 260 && cur) { out.push(cur); cur = p; } else cur = (cur + " " + p).trim();
    }
    if (cur) out.push(cur);
    var fin = [];
    for (i = 0; i < out.length; i++) {
      var c = out[i];
      while (c.length > 800) { var cut = c.lastIndexOf(" ", 780); if (cut < 200) cut = 780; fin.push(c.slice(0, cut)); c = c.slice(cut).trim(); }
      fin.push(c);
    }
    return fin;
  }

  function synth(text, signal) {
    return fetch(FN + "hs-tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text, lang: lang }),
      signal: signal
    }).then(function (r) {
      var ct = r.headers.get("content-type") || "";
      if (r.ok && ct.indexOf("audio") === 0) return r.blob();
      return r.json().catch(function () { return {}; }).then(function (j) {
        var e = new Error((j && j.error) || "voice error " + r.status);
        e.code = j && j.code; e.status = r.status;
        throw e;
      });
    });
  }

  function playBlob(blob, id) {
    return new Promise(function (resolve, reject) {
      if (id !== speech.id) return resolve(false);
      var url = URL.createObjectURL(blob);
      var done = function (ok) {
        audio.removeEventListener("ended", onEnd); audio.removeEventListener("error", onErr); audio.removeEventListener("pause", onPause);
        try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ }
        resolve(ok);
      };
      var onEnd = function () { done(true); };
      var onPause = function () { if (id !== speech.id) done(false); };
      var onErr = function () { done(false); };
      audio.addEventListener("ended", onEnd); audio.addEventListener("error", onErr); audio.addEventListener("pause", onPause);
      speech.cancelPlay = function () { done(false); };
      audio.src = url;
      var p = audio.play();
      if (p && p.catch) p.catch(function (e) { done(false); if (id === speech.id) reject(e); });
    });
  }
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  function stopSpeech() {
    speech.id++;
    if (speech.ac) { try { speech.ac.abort(); } catch (e) { /* ignore */ } }
    speech.ac = null;
    try { audio.pause(); } catch (e) { /* ignore */ }
    if (speech.cancelPlay) { var c = speech.cancelPlay; speech.cancelPlay = null; c(); }
    var cb = speech.onStop; speech.onStop = null; speech.owner = null; speech.active = false;
    setSpeaking(false);
    if (cb) cb();
  }

  /** Speak text in Aria's voice. Resolves { ok, cancelled, error }. */
  function speak(text, opts) {
    opts = opts || {};
    stopSpeech();
    var id = speech.id;
    var chunks = chunkText(text);
    if (muted || !chunks.length || !audio) return Promise.resolve({ ok: true, skipped: true });
    var ac = new AbortController();
    speech.ac = ac; speech.owner = opts.owner || null; speech.onStop = opts.onStop || null; speech.active = true;
    var pending = [];
    var fetchAt = function (i) { if (!pending[i] && i < chunks.length) { pending[i] = synth(chunks[i], ac.signal); pending[i].catch(function () {}); } return pending[i]; };
    var i = 0;
    var step = function () {
      if (id !== speech.id) return Promise.resolve({ cancelled: true });
      if (i >= chunks.length) return Promise.resolve({ ok: true });
      return fetchAt(i).then(function (blob) {
        if (id !== speech.id) return { cancelled: true };
        fetchAt(i + 1);
        if (opts.onStart && i === 0) opts.onStart();
        setSpeaking(true);
        return playBlob(blob, id).then(function (played) {
          setSpeaking(false);
          if (!played || id !== speech.id) return { cancelled: true };
          i++;
          if (i >= chunks.length) return { ok: true };
          return wait(/[.!?…]["”’)]*$/.test(chunks[i - 1]) ? 320 : 180).then(step);
        });
      });
    };
    return step().then(function (r) {
      if (id === speech.id) { speech.active = false; speech.owner = null; speech.onStop = null; }
      return r;
    }, function (err) {
      if (id === speech.id) { speech.active = false; speech.owner = null; speech.onStop = null; setSpeaking(false); }
      if (err && err.name === "AbortError") return { cancelled: true };
      return { error: err };
    });
  }

  /* ================================================================
     ARIA'S STAR: blink and breathe when idle, mouth moves while her
     audio plays, steady glow while the mic is live.
     ================================================================ */
  var stars = [], starState = "idle", blinkT = 0, mouthT = 0, framesLoaded = {};
  function loadFrame(name) {
    if (framesLoaded[name]) return;
    framesLoaded[name] = "loading";
    var imgs = doc.querySelectorAll(".f-" + name), left = imgs.length;
    for (var i = 0; i < imgs.length; i++) {
      (function (im) {
        im.addEventListener("load", function () { if (--left <= 0) framesLoaded[name] = true; }, { once: true });
        im.src = im.getAttribute("data-src");
      })(imgs[i]);
    }
  }
  function setFrame(f) {
    if (f !== "open" && framesLoaded[f] !== true) f = "open";
    for (var i = 0; i < stars.length; i++) stars[i].face.setAttribute("data-frame", f);
  }
  function setStarState(s, labelKey) {
    starState = s;
    for (var i = 0; i < stars.length; i++) stars[i].el.setAttribute("data-state", s);
    var labels = doc.querySelectorAll("[data-star-state]");
    var key = labelKey || "state." + (s === "speaking" ? "speaking" : s === "listening" ? "listening" : s === "thinking" ? "thinking" : "idle");
    for (i = 0; i < labels.length; i++) { labels[i].setAttribute("data-i18n", key); labels[i].textContent = t(key); }
  }
  function setSpeaking(on) {
    clearTimeout(mouthT);
    if (on) {
      if (starState !== "speaking") setStarState("speaking");
      var flip = function (m) { setFrame(m); mouthT = setTimeout(function () { flip(m === "talk1" ? "talk2" : "talk1"); }, 120 + Math.random() * 60); };
      flip("talk1");
    } else {
      setFrame("open");
      if (starState === "speaking") setStarState(convo.active ? convo.uiState() : "idle");
    }
  }
  function blinkLoop() {
    clearTimeout(blinkT);
    blinkT = setTimeout(function () {
      if (starState !== "speaking") { setFrame("blink"); setTimeout(function () { if (starState !== "speaking") setFrame("open"); }, 150); }
      blinkLoop();
    }, 3500 + Math.random() * 1500);
  }
  function initStars() {
    var els = doc.querySelectorAll(".hs-star");
    for (var i = 0; i < els.length; i++) stars.push({ el: els[i], face: els[i].querySelector(".hs-star-face") });
    var later = function () { loadFrame("blink"); loadFrame("talk1"); loadFrame("talk2"); };
    if (doc.readyState === "complete") setTimeout(later, 400); else window.addEventListener("load", function () { setTimeout(later, 400); });
    if (!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) blinkLoop();
  }

  /* ================================================================
     ASSET SLOTS: photography and the badge render only when the build
     stamped the file into the manifest (scripts/build-home-shield-assets.mjs).
     ================================================================ */
  function initAssets() {
    var m = null;
    try { var raw = (doc.getElementById("hs-assets") || {}).textContent || ""; m = JSON.parse(raw.replace(/\/\*HS-ASSETS:(START|END)\*\//g, "")); } catch (e) { m = null; }
    if (!m) return;
    var photos = m.photos || {};
    var slots = doc.querySelectorAll("[data-photo]");
    for (var i = 0; i < slots.length; i++) {
      var p = photos[slots[i].getAttribute("data-photo")];
      if (!p || !p.src) continue;
      var im = doc.createElement("img");
      im.src = p.src; im.alt = (p.alt && (p.alt[lang] || p.alt.en)) || ""; im.loading = slots[i].getAttribute("data-photo") === "hero" ? "eager" : "lazy"; im.decoding = "async";
      if (p.w) { im.width = p.w; im.height = p.h; }
      slots[i].appendChild(im); slots[i].hidden = false;
    }
    if (m.badge) {
      var b = doc.querySelectorAll("[data-badge]");
      for (i = 0; i < b.length; i++) { b[i].style.backgroundImage = "url('" + m.badge + "')"; b[i].hidden = false; }
    }
  }

  /* ================================================================
     LISTEN CONTROLS: each reads its own section in Aria's voice; one
     voice at a time.
     ================================================================ */
  function sectionText(sel) {
    var el = doc.querySelector(sel);
    if (!el) return "";
    var parts = el.querySelectorAll(".hs-say");
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var s = parts[i].textContent.replace(/\s+/g, " ").trim();
      if (s && !/[.!?:;…]$/.test(s)) s += ".";
      if (s) out.push(s);
    }
    return out.join(" ");
  }
  function setListenBtn(btn, st) {
    btn.classList.toggle("is-on", st === "on");
    btn.classList.toggle("is-loading", st === "loading");
    var lbl = btn.querySelector("[data-i18n]");
    if (lbl) { lbl.setAttribute("data-i18n", st ? "stop" : "listen"); lbl.textContent = t(st ? "stop" : "listen"); }
  }
  function onListen(btn) {
    if (speech.owner === btn) { stopSpeech(); return; }
    convo.stop();
    var text = sectionText(btn.getAttribute("data-listen"));
    setListenBtn(btn, "loading");
    var reset = function () { setListenBtn(btn, ""); };
    var errBox = pageError(btn);
    if (errBox) errBox.hidden = true;
    speak(text, { owner: btn, onStop: reset, onStart: function () { setListenBtn(btn, "on"); } }).then(function (r) {
      if (speech.owner !== btn) reset();
      if (r && r.error) showListenError(btn, r.error);
    });
  }
  function pageError(btn) {
    var host = btn.parentNode;
    return host && host.querySelector(".hs-listen-err");
  }
  function showListenError(btn, err) {
    var box = pageError(btn);
    if (!box) { box = doc.createElement("p"); box.className = "hs-listen-err hs-err"; box.setAttribute("role", "alert"); btn.parentNode.appendChild(box); }
    box.textContent = t("err.voice", { e: err.message || String(err) });
    box.hidden = false;
  }

  /* ================================================================
     CONVERSATION STATE (text + voice)
     ================================================================ */
  var chat = { messages: [], draft: null, ready: false, caseId: null, token: null, link: null, busy: false, greeted: false, pendingFile: null, cardMode: null, edited: false };
  window.HS_CHAT = chat;
  var sheet = doc.getElementById("hsSheet");
  var msgs = doc.getElementById("hsMsgs");
  var errEl = doc.getElementById("hsErr");
  var input = doc.getElementById("hsInput");

  function showErr(msg) { if (!errEl) return; errEl.textContent = msg; errEl.hidden = !msg; }
  function scrollDown() { if (msgs) msgs.scrollTop = msgs.scrollHeight; }
  function addMsg(role, text, extra) {
    var b = doc.createElement("div");
    b.className = "hs-msg " + (role === "user" ? "hs-msg-u" : "hs-msg-a");
    b.textContent = text;
    if (extra) b.appendChild(extra);
    msgs.appendChild(b);
    scrollDown();
    return b;
  }
  var typingEl = null;
  function typing(on) {
    if (on && !typingEl) { typingEl = doc.createElement("div"); typingEl.className = "hs-typing"; typingEl.setAttribute("aria-label", t("state.thinking")); typingEl.innerHTML = "<i></i><i></i><i></i>"; msgs.appendChild(typingEl); scrollDown(); }
    if (!on && typingEl) { typingEl.remove(); typingEl = null; }
  }
  function introText() { return t("intro.line1") + " " + t("intro.line2"); }
  function greet() {
    if (chat.greeted) return false;
    chat.greeted = true;
    addMsg("assistant", introText());
    chat.messages.push({ role: "assistant", content: introText() });
    return true;
  }
  var lastFocus = null;
  function openSheet() {
    if (!sheet) return;
    if (sheet.hidden) { lastFocus = doc.activeElement; sheet.hidden = false; doc.body.style.overflow = "hidden"; }
  }
  function closeSheet() {
    convo.stop(); stopSpeech();
    if (!sheet) return;
    sheet.hidden = true; doc.body.style.overflow = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function post(fn, body) {
    return fetch(FN + fn, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error((j && j.error) || "HTTP " + r.status); e.status = r.status; throw e; }
        return j;
      });
    });
  }

  function sendText(text, viaVoice) {
    text = String(text || "").trim();
    if (!text || chat.busy) return Promise.resolve();
    showErr("");
    greetIfNeeded(false);
    addMsg("user", text);
    chat.messages.push({ role: "user", content: text });
    chat.busy = true;
    typing(true);
    if (convo.active) convo.set("thinking");
    else setStarState("thinking");
    return post("hs-chat", { messages: chat.messages, lang: lang, caseDraft: chat.draft, voice: !!viaVoice || convo.active, policy: chat.policy || null })
      .then(function (j) {
        typing(false); chat.busy = false;
        var reply = String(j.reply || "");
        addMsg("assistant", reply);
        chat.messages.push({ role: "assistant", content: reply });
        if (j.caseDraft) { chat.draft = mergeDraft(chat.draft, j.caseDraft); }
        if (j.ready && !chat.caseId) showCaseCard("case");
        else if (chat.cardMode === "case" && !chat.edited) showCaseCard("case");
        return sayReply(reply);
      })
      .catch(function (e) {
        typing(false); chat.busy = false;
        showErr(t("err.chat", { e: e.message }));
        if (convo.active) convo.listen(); else setStarState("idle");
      });
  }
  function greetIfNeeded(speakIt) {
    if (!greet()) return Promise.resolve({ ok: true });
    return speakIt ? sayReply(introText(), true) : Promise.resolve({ ok: true });
  }
  /* Aria's reply in her voice; in a voice conversation, the mic reopens after. */
  function sayReply(text, isGreeting) {
    if (convo.active) convo.set("speaking");
    return speak(text, { owner: "chat" }).then(function (r) {
      if (r && r.error) showErr(t("err.voice", { e: r.error.message }));
      if (r && r.cancelled) return r;
      if (convo.active) convo.listen(); else setStarState("idle");
      return r;
    });
  }
  function mergeDraft(prev, next) {
    var d = {};
    var k, src = prev || {};
    for (k in src) d[k] = src[k];
    for (k in next) if (next[k] !== null && next[k] !== undefined) d[k] = next[k];
    return d;
  }

  /* ================================================================
     VOICE CONVERSATION: tap Aria -> mic on. Simple voice-activity
     endpointing (about 900 ms of silence ends a turn), tap to end a turn
     early, barge-in stops her when the homeowner starts talking.
     ================================================================ */
  var convo = (function () {
    var c = { active: false, state: "off", stream: null, ctx: null, an: null, buf: null, timer: 0, rec: null, chunks: [], mime: "", startedAt: 0, lastVoice: 0, heard: false, loud: 0, floor: 0.01, calib: [], idleRounds: 0 };
    var SILENCE_MS = 900, MAX_UTTER_MS = 30000, NO_SPEECH_MS = 15000, BARGE_MS = 260;
    c.uiState = function () { return c.state === "speaking" ? "speaking" : c.state === "thinking" ? "thinking" : c.state === "listening" ? "listening" : "idle"; };
    c.set = function (s) {
      c.state = s;
      if (s === "listening") setStarState("listening", c.heard ? "state.hearing" : "state.listening");
      else if (s === "thinking") setStarState("thinking");
      else if (s === "speaking") setStarState("speaking");
      else if (s === "starting") setStarState("thinking", "state.starting");
      else setStarState("idle");
      var mic = doc.getElementById("hsMic");
      if (mic) { mic.setAttribute("aria-pressed", c.active ? "true" : "false"); var a = t(c.active ? "chat.micStop" : "chat.mic"); mic.setAttribute("aria-label", a); mic.setAttribute("title", a); mic.setAttribute("data-i18n-aria", c.active ? "chat.micStop" : "chat.mic"); }
    };
    function level() {
      if (!c.an) return 0;
      c.an.getFloatTimeDomainData(c.buf);
      var sum = 0;
      for (var i = 0; i < c.buf.length; i++) sum += c.buf[i] * c.buf[i];
      return Math.sqrt(sum / c.buf.length);
    }
    function pickMime() {
      var opts = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
      for (var i = 0; i < opts.length; i++) if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(opts[i])) return opts[i];
      return "";
    }
    function tick() {
      if (!c.active) return;
      var now = Date.now(), lv = level();
      if (c.calib.length < 8) { c.calib.push(lv); if (c.calib.length === 8) { var s = c.calib.slice().sort(); c.floor = Math.max(0.004, s[4]); } }
      var thr = Math.max(0.018, c.floor * 3), barge = Math.max(0.05, c.floor * 6);
      if (c.state === "listening") {
        if (lv > thr) { if (!c.heard) { c.heard = true; c.set("listening"); } c.lastVoice = now; }
        if (c.heard && now - c.lastVoice > SILENCE_MS) return c.finish();
        if (c.heard && now - c.startedAt > MAX_UTTER_MS) return c.finish();
        if (!c.heard && now - c.startedAt > NO_SPEECH_MS) {
          c.idleRounds++;
          if (c.idleRounds >= 3) return c.stop();
          c.restartRec();
        }
      } else if (c.state === "speaking") {
        if (lv > barge) { c.loud += 50; if (c.loud >= BARGE_MS) { c.loud = 0; stopSpeech(); c.listen(true); } } else c.loud = 0;
      }
    }
    c.restartRec = function () {
      if (c.rec && c.rec.state !== "inactive") { c.rec.ondataavailable = null; c.rec.onstop = null; try { c.rec.stop(); } catch (e) { /* ignore */ } }
      c.startRec();
    };
    c.startRec = function () {
      c.chunks = []; c.startedAt = Date.now(); c.heard = false;
      try { c.rec = c.mime ? new MediaRecorder(c.stream, { mimeType: c.mime }) : new MediaRecorder(c.stream); } catch (e) { c.rec = new MediaRecorder(c.stream); }
      c.rec.ondataavailable = function (ev) { if (ev.data && ev.data.size) c.chunks.push(ev.data); };
      c.rec.start(250);
    };
    c.listen = function (barged) {
      if (!c.active) return;
      c.set("listening");
      c.startRec();
      if (barged) { c.heard = true; c.lastVoice = Date.now(); c.set("listening"); }
    };
    c.finish = function () {
      if (!c.rec || c.state !== "listening") return;
      c.set("thinking");
      c.idleRounds = 0;
      var rec = c.rec;
      rec.onstop = function () {
        var type = (c.mime || rec.mimeType || "audio/webm").split(";")[0];
        var blob = new Blob(c.chunks, { type: type });
        c.chunks = [];
        if (blob.size < 1200) return c.listen();
        blobToB64(blob).then(function (b64) {
          return post("hs-stt", { audio: b64, mime: type, lang: lang });
        }).then(function (j) {
          if (!c.active) return;
          var text = String((j && j.text) || "").trim();
          if (!text) return c.listen();
          return sendText(text, true);
        }).catch(function (e) {
          showErr(t("err.stt", { e: e.message }));
          c.listen();
        });
      };
      try { rec.stop(); } catch (e) { c.listen(); }
    };
    c.start = function () {
      if (c.active) return Promise.resolve();
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
        showErr(t("err.mic", { e: "not supported on this browser" }));
        return Promise.resolve();
      }
      c.active = true; c.idleRounds = 0;
      c.set("starting");
      return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }).then(function (stream) {
        if (!c.active) { stream.getTracks().forEach(function (tr) { tr.stop(); }); return; }
        c.stream = stream;
        var AC = window.AudioContext || window.webkitAudioContext;
        c.ctx = new AC();
        var src = c.ctx.createMediaStreamSource(stream);
        c.an = c.ctx.createAnalyser(); c.an.fftSize = 1024;
        c.buf = new Float32Array(c.an.fftSize);
        src.connect(c.an);
        c.mime = pickMime();
        c.calib = [];
        c.timer = setInterval(tick, 50);
      }).catch(function (e) {
        c.active = false; c.set("off");
        showErr(t("err.mic", { e: (e && (e.message || e.name)) || "blocked" }));
        throw e;
      });
    };
    c.stop = function () {
      if (!c.active && !c.stream) return;
      c.active = false;
      clearInterval(c.timer);
      if (c.rec && c.rec.state !== "inactive") { c.rec.onstop = null; try { c.rec.stop(); } catch (e) { /* ignore */ } }
      if (c.stream) c.stream.getTracks().forEach(function (tr) { tr.stop(); });
      if (c.ctx) { try { c.ctx.close(); } catch (e) { /* ignore */ } }
      c.stream = null; c.ctx = null; c.an = null; c.rec = null;
      if (c.state === "speaking") stopSpeech();
      c.set("off");
    };
    return c;
  })();
  window.HS_CONVO = convo;

  function blobToB64(blob) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(String(r.result).split(",")[1] || ""); };
      r.onerror = function () { rej(r.error); };
      r.readAsDataURL(blob);
    });
  }

  /* Tap Aria: start the spoken conversation; tap again to interrupt her or
     to end your turn early. */
  function onStarTap() {
    openSheet();
    if (convo.active) {
      if (convo.state === "speaking") { stopSpeech(); convo.listen(); return; }
      if (convo.state === "listening" && convo.heard) { convo.finish(); return; }
      return;
    }
    stopSpeech();
    var micReady = convo.start();
    var greeting = greetIfNeeded(false).then(function () {
      if (chat.messages.length === 1) { convo.set("speaking"); return speak(introText(), { owner: "chat" }); }
      return { ok: true };
    });
    Promise.all([micReady.catch(function () { return null; }), greeting]).then(function (r) {
      var g = r[1];
      if (g && g.error) showErr(t("err.voice", { e: g.error.message }));
      if (g && g.cancelled) return;
      if (convo.active && convo.stream) convo.listen();
    });
  }

  /* ================================================================
     "YOUR CASE": editable summary + contact + REQUIRED consent.
     ================================================================ */
  var ISSUES = ["denied_claim", "underpaid_claim", "roof", "leak_water", "policy_review", "inspection", "other"];
  var TRADES = ["public_adjuster", "attorney", "roofer", "insurance_agent", "inspector"];
  var URG = ["emergency", "soon", "planning"];
  var cardEl = null;

  /* Mirror of the server's scrub (_hs-prompt.js scrubPII): the summary is
     what an unapproved pro reads, so what the homeowner types there is
     cleaned before it leaves the page. */
  function scrubPII(s, insurer) {
    var x = String(s || "");
    x = x.replace(/https?:\/\/\S+|www\.\S+/gi, "[link]");
    x = x.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]");
    x = x.replace(/\b\d{1,6}\s+(?:[A-Za-z0-9.'-]+\s+){0,4}(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|court|ct|boulevard|blvd|way|terrace|ter|place|pl|circle|cir|parkway|pkwy|highway|hwy|trail|trl|calle|avenida|camino)\b\.?/gi, "[address]");
    x = x.replace(/(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, "[phone]");
    x = x.replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[id]");
    x = x.replace(/\b(policy|claim|account|p[oó]liza|reclamo|n[uú]mero|number)\s*(?:number|no\.?|#|n[uú]mero|de)?\s*[:#]?\s*[A-Z0-9-]*\d[A-Z0-9-]{3,}/gi, "$1 [number]");
    x = x.replace(/\b(?=[A-Z0-9-]*\d)(?=[A-Z0-9-]*[A-Z])[A-Z0-9-]{7,}\b/gi, "[number]");
    x = x.replace(/\b\d{7,}\b/g, "[number]");
    x = x.replace(/\b(my name is|i'm called|me llamo|mi nombre es)\s+[^\s,.;]+(\s+[A-Z][^\s,.;]*)?/gi, "$1 [name]");
    if (insurer && String(insurer).trim().length >= 3) x = x.split(new RegExp(String(insurer).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")).join("the insurer");
    return x.replace(/\s{2,}/g, " ").trim();
  }
  window.HS_SCRUB = scrubPII;

  function h(tag, attrs, kids) {
    var e = doc.createElement(tag);
    if (attrs) for (var k in attrs) { if (k === "text") e.textContent = attrs[k]; else if (k === "html") e.innerHTML = attrs[k]; else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) e.setAttribute(k, attrs[k] === true ? "" : attrs[k]); }
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === "string" ? doc.createTextNode(c) : c); });
    return e;
  }
  function field(labelKey, control, hintKey) {
    return h("label", { class: "hs-field" }, [h("span", { text: t(labelKey) }), control, hintKey ? h("span", { class: "hs-hint", text: t(hintKey) }) : null]);
  }
  function readCard() {
    if (!cardEl) return null;
    var f = cardEl.querySelector("form");
    var trades = [];
    var tb = f.querySelectorAll("input[name=trade]:checked");
    for (var i = 0; i < tb.length; i++) trades.push(tb[i].value);
    var pref = f.querySelector("input[name=pref]:checked");
    return {
      issue: f.issue.value, trades: trades, zip: f.zip.value.replace(/\D/g, "").slice(0, 5), urgency: f.urgency.value, summary: f.summary.value,
      name: f.cname.value, phone: f.phone.value, email: f.email.value, pref: pref ? pref.value : "phone", consent: f.consent.checked
    };
  }

  function showCaseCard(mode) {
    chat.cardMode = mode;
    var d = chat.draft || {};
    if (mode === "file") d = mergeDraft({ issue: "policy_review", urgency: "planning", trades: ["insurance_agent"], summary: t("policy.summary") }, d.issue ? d : {});
    var keep = readCard();
    var old = cardEl;
    var v = keep || { issue: d.issue || "other", trades: d.trades || [], zip: d.zip || "", urgency: d.urgency || "soon", summary: d.summary || "", name: "", phone: "", email: "", pref: "phone", consent: false };
    if (keep && !chat.edited) { v.issue = d.issue || v.issue; v.trades = d.trades || v.trades; v.zip = d.zip || v.zip; v.urgency = d.urgency || v.urgency; v.summary = d.summary || v.summary; }

    var issueSel = h("select", { name: "issue" }, ISSUES.map(function (k) { return h("option", { value: k, selected: k === v.issue, text: t("issue." + k) }); }));
    var urgSel = h("select", { name: "urgency" }, URG.map(function (k) { return h("option", { value: k, selected: k === v.urgency, text: t("urg." + k) }); }));
    var tradeBox = h("fieldset", { class: "hs-field" }, [h("legend", { text: t("case.trades") }), h("div", { class: "hs-opts" }, TRADES.map(function (k) {
      return h("label", { class: "hs-opt" }, [h("input", { type: "checkbox", name: "trade", value: k, checked: v.trades.indexOf(k) >= 0 }), h("span", { text: t("trade." + k) })]);
    }))]);
    var prefBox = h("fieldset", { class: "hs-field" }, [h("legend", { text: t("case.pref") }), h("div", { class: "hs-opts" }, ["phone", "text", "email"].map(function (k) {
      return h("label", { class: "hs-opt" }, [h("input", { type: "radio", name: "pref", value: k, checked: v.pref === k }), h("span", { text: t("pref." + k) })]);
    }))]);
    var consent = h("input", { type: "checkbox", name: "consent", id: "hsConsent", checked: v.consent });
    var sendBtn = h("button", { class: "hs-btn hs-btn-gold", type: "submit", id: "hsSendCase", disabled: !v.consent, text: t(mode === "file" ? "case.sendFile" : "case.send") });
    var msg = h("p", { class: "hs-form-msg", role: "status" });
    var form = h("form", { novalidate: true }, [
      field("case.issue", issueSel),
      tradeBox,
      h("div", { class: "hs-row2" }, [
        field("case.zip", h("input", { name: "zip", inputmode: "numeric", autocomplete: "postal-code", maxlength: "5", value: v.zip })),
        field("case.urgency", urgSel)
      ]),
      field("case.summary", h("textarea", { name: "summary", maxlength: "600" }, [v.summary]), "case.summaryHint"),
      h("h4", { text: t("case.contact") }),
      field("case.name", h("input", { name: "cname", autocomplete: "name", value: v.name })),
      h("div", { class: "hs-row2" }, [
        field("case.phone", h("input", { name: "phone", type: "tel", autocomplete: "tel", inputmode: "tel", value: v.phone })),
        field("case.email", h("input", { name: "email", type: "email", autocomplete: "email", value: v.email }))
      ]),
      prefBox,
      h("label", { class: "hs-consent", for: "hsConsent" }, [consent, h("span", { text: t("case.consent") })]),
      sendBtn,
      msg
    ]);
    form.querySelector("textarea").value = v.summary;
    form.addEventListener("input", function (e) { if (e.target !== consent) chat.edited = true; });
    consent.addEventListener("change", function () { sendBtn.disabled = !consent.checked; msg.textContent = ""; });
    form.addEventListener("submit", function (e) { e.preventDefault(); submitCase(form, sendBtn, msg, mode); });

    cardEl = h("section", { class: "hs-card", id: "hsCaseCard", "aria-labelledby": "hsCaseTitle" }, [
      mode === "file" ? h("p", { class: "hs-card-sub", text: t("policy.fileTitle") }) : null,
      h("h3", { id: "hsCaseTitle", text: t(mode === "file" ? "case.fileTitle" : "case.title") }),
      h("p", { class: "hs-card-sub", text: t(mode === "file" ? "case.fileSub" : "case.sub") }),
      form
    ]);
    if (old && old.parentNode) old.parentNode.replaceChild(cardEl, old);
    else { msgs.appendChild(cardEl); scrollDown(); }
  }

  function submitCase(form, btn, msg, mode) {
    var v = readCard();
    if (!v.consent) { msg.textContent = t("case.needConsent"); return; }
    var phoneOk = v.phone.replace(/\D/g, "").length >= 10;
    var emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email.trim());
    if (!v.name.trim() || !(phoneOk || emailOk)) { msg.textContent = t("case.needContact"); return; }
    if (!/^\d{5}$/.test(v.zip)) { msg.textContent = t("case.needZip"); return; }
    var d = chat.draft || {};
    var insurer = d.insurer || null;
    var caseDraft = {
      issue: v.issue, trades: v.trades, zip: v.zip, state: d.state || null, urgency: v.urgency,
      summary: scrubPII(v.summary, insurer), insurer: insurer, claimStatus: d.claimStatus || null
    };
    var contact = { name: v.name.trim(), phone: phoneOk ? v.phone.trim() : "", email: emailOk ? v.email.trim() : "", preferred: v.pref };
    btn.disabled = true; btn.textContent = t("case.sending"); msg.textContent = "";
    post("hs-case-create", { caseDraft: caseDraft, contact: contact, consent: true, consentText: t("case.consent"), lang: lang })
      .then(function (j) {
        if (!j.caseId || !j.token) throw new Error("no case id");
        chat.caseId = j.caseId; chat.token = j.token; chat.draft = mergeDraft(chat.draft, caseDraft);
        chat.link = location.origin + (j.statusUrl && j.statusUrl.charAt(0) === "/" ? j.statusUrl : "/home-shield/caso.html?c=" + encodeURIComponent(j.caseId) + "&t=" + encodeURIComponent(j.token));
        store("hs_case", chat.link);
        showMyCase();
        renderSent();
        if (chat.pendingFile) { var f = chat.pendingFile; chat.pendingFile = null; uploadPolicy(f); }
      })
      .catch(function (e) {
        btn.disabled = false; btn.textContent = t(mode === "file" ? "case.sendFile" : "case.send");
        msg.textContent = t("err.chat", { e: e.message });
      });
  }

  function renderSent() {
    var a = h("a", { class: "hs-btn hs-btn-gold", href: chat.link, text: t("case.open") });
    var copy = h("button", { class: "hs-btn hs-btn-line", type: "button", text: t("case.copy") });
    copy.addEventListener("click", function () {
      try { navigator.clipboard.writeText(chat.link).then(function () { copy.textContent = t("case.copied"); }); } catch (e) { /* no clipboard */ }
    });
    var done = h("section", { class: "hs-card hs-done", id: "hsCaseDone" }, [
      h("h3", { text: t("case.sentTitle") }),
      h("p", { class: "hs-card-sub", text: t("case.sentBody") }),
      h("code", { class: "hs-link", id: "hsCaseLink", text: chat.link }),
      h("p", { class: "hs-save", text: t("case.save") }),
      a, copy
    ]);
    if (cardEl && cardEl.parentNode) cardEl.parentNode.replaceChild(done, cardEl);
    else msgs.appendChild(done);
    cardEl = null; chat.cardMode = "sent";
    scrollDown();
  }

  function showMyCase() {
    var l = chat.link || store("hs_case");
    var a = doc.getElementById("hsMyCase");
    if (a && l) { a.href = l; a.hidden = false; }
  }

  /* ================================================================
     POLICY UPLOAD -> hs-doc-upload -> hs-policy-review
     ================================================================ */
  var fileInput = doc.getElementById("hsFile");
  var OK_TYPES = /^(application\/pdf|image\/(jpeg|png|heic|heif))$/;
  function onUploadClick() {
    openSheet();
    greetIfNeeded(false);
    if (fileInput) { fileInput.value = ""; fileInput.click(); }
  }
  function onFilePicked() {
    var f = fileInput.files && fileInput.files[0];
    if (!f) return;
    showErr("");
    var typeOk = OK_TYPES.test(f.type) || /\.(pdf|jpe?g|png|heic|heif)$/i.test(f.name);
    if (!typeOk) { addMsg("assistant", t("policy.type")); return; }
    if (f.size > 10 * 1024 * 1024) { addMsg("assistant", t("policy.size")); return; }
    if (chat.caseId) uploadPolicy(f);
    else { chat.pendingFile = f; showCaseCard("file"); }
  }
  /* Base64 JSON; files over 4 MB go in ~3 MB chunks (Netlify's 6 MB cap). */
  var CHUNK = 3 * 1024 * 1024;
  function sendFile(f) {
    var base = { caseId: chat.caseId, token: chat.token, kind: "policy" };
    var type = f.type || (/\.pdf$/i.test(f.name) ? "application/pdf" : "");
    if (f.size <= 4 * 1024 * 1024) {
      return blobToB64(f).then(function (b64) { return post("hs-doc-upload", Object.assign({}, base, { file: { name: f.name, type: type, size: f.size, data: b64 } })); });
    }
    var total = Math.ceil(f.size / CHUNK), uploadId = null;
    var step = function (i) {
      return blobToB64(f.slice(i * CHUNK, Math.min(f.size, (i + 1) * CHUNK))).then(function (b64) {
        var chunk = { index: i, total: total };
        if (uploadId) chunk.uploadId = uploadId;
        return post("hs-doc-upload", Object.assign({}, base, { file: { name: f.name, type: type, size: f.size, data: b64, chunk: chunk } }));
      }).then(function (j) {
        if (j.docId) return j;
        uploadId = j.uploadId || uploadId;
        return step(i + 1);
      });
    };
    return step(0);
  }
  function list(titleKey, items) {
    if (!items || !items.length) return null;
    return h("div", { class: "hs-review-group" }, [h("p", { class: "hs-review-h", text: t(titleKey) }),
      h("ul", { class: "hs-flags" }, items.map(function (x) { return h("li", { text: typeof x === "string" ? x : (x && (x.label || x.text)) || "" }); }))]);
  }
  function uploadPolicy(f) {
    var status = addMsg("assistant", t("policy.uploading"));
    setStarState("thinking");
    sendFile(f).then(function (j) {
      status.textContent = t("policy.reviewing");
      return post("hs-policy-review", { caseId: chat.caseId, token: chat.token, docId: j.docId, lang: lang });
    }).then(function (r) {
      status.remove();
      var strong = r.strong || [], weak = r.weak || [], improve = r.improve || [];
      var flags = Array.isArray(r.flags) ? r.flags : [];
      chat.policy = { textFound: !!r.textFound, strong: strong, weak: weak, improve: improve, flags: flags, excerpt: String(r.excerpt || "").slice(0, 6000) };
      var box = h("div", { class: "hs-review" }, [
        list("policy.strong", strong), list("policy.weak", weak), list("policy.improve", improve),
        !strong.length && !weak.length && !improve.length ? list("policy.found", flags) : null
      ]);
      if (r.textFound !== false) {
        var better = h("button", { class: "hs-btn hs-btn-gold", type: "button", text: t("policy.better") });
        better.addEventListener("click", function () { findBetterPolicy(better); });
        box.appendChild(better);
      }
      var plain = String(r.plainSummary || "");
      addMsg("assistant", plain, box);
      var lines = [plain];
      if (strong.length) lines.push(t("policy.strong") + ": " + strong.join("; "));
      if (weak.length) lines.push(t("policy.weak") + ": " + weak.join("; "));
      if (improve.length) lines.push(t("policy.improve") + ": " + improve.join("; "));
      chat.messages.push({ role: "assistant", content: lines.join("\n") });
      setStarState("idle");
      return sayReply(plain);
    }).catch(function (e) {
      status.textContent = t("policy.err", { e: e.message });
      setStarState("idle");
    });
  }
  function findBetterPolicy(btn) {
    btn.disabled = true;
    var d = chat.draft = mergeDraft(chat.draft, {});
    var had = (d.trades || []).indexOf("insurance_agent") >= 0;
    d.trades = (d.trades || []).slice();
    if (!had) d.trades.push("insurance_agent");
    if (!d.issue) d.issue = "policy_review";
    if (chat.caseId && had) { addMsg("assistant", t("policy.betterDone")); sayReply(t("policy.betterDone")); }
    else { addMsg("assistant", t("policy.betterLater")); sayReply(t("policy.betterLater")); chat.edited = false; showCaseCard("case"); }
  }

  /* ================================================================
     caso.html: the homeowner's private case page.
     ================================================================ */
  function prettyPhone(p) {
    var d = String(p || "").replace(/\D/g, "");
    if (d.length === 11 && d.charAt(0) === "1") d = d.slice(1);
    return d.length === 10 ? "(" + d.slice(0, 3) + ") " + d.slice(3, 6) + "-" + d.slice(6) : String(p);
  }
  function initCaso() {
    var q = new URLSearchParams(location.search);
    var c = q.get("c"), tok = q.get("t");
    var box = doc.getElementById("casoBody");
    var poll = 0, data = null, deleted = false, busy = false, threads = {}, drafts = {};
    if (c && tok) store("hs_case", location.href.split("#")[0]);
    function getJ(url) {
      return fetch(url, { headers: { Accept: "application/json" } }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || "HTTP " + r.status); e.status = r.status; e.code = j.code; throw e; } return j; });
      });
    }
    function get() {
      if (!c || !tok) return Promise.reject(Object.assign(new Error("bad link"), { status: 404 }));
      return getJ(FN + "hs-case-status?c=" + encodeURIComponent(c) + "&t=" + encodeURIComponent(tok));
    }
    function norm(j) {
      var cs = j.case || {};
      var offers = (j.offers || []).map(function (o) {
        var p = o.pro || {};
        return { id: o.id, proId: p.id || o.proId || "", status: o.status || "pending", message: o.message || "",
          name: p.name || "", company: p.company || "", trades: p.trades || [], licenseType: p.licenseType || "",
          licenseNumber: p.licenseNumber || "", licenseState: p.licenseState || "", verified: !!p.verified,
          phone: p.phone || "", email: p.email || "" };
      });
      var conn = null;
      if (cs.status === "connected") conn = offers.filter(function (o) { return o.status === "accepted"; })[0] || null;
      return { status: cs.status || "open", summary: cs.summary || "", issue: cs.issue, trades: cs.trades || [],
        area: (cs.area && (cs.area.label || cs.area.zip3)) || cs.zip || "", offers: offers, conn: conn };
    }
    function loadThread(o) {
      if (!o.proId) return Promise.resolve();
      return getJ(FN + "hs-case-messages?c=" + encodeURIComponent(c) + "&t=" + encodeURIComponent(tok) + "&p=" + encodeURIComponent(o.proId))
        .then(function (j) { threads[o.proId] = j.messages || []; }).catch(function () { /* keep what we had */ });
    }
    function threadEl(o) {
      var msgsList = threads[o.proId] || [];
      var list = h("div", { class: "hs-thread-msgs" }, msgsList.length ? msgsList.map(function (m) {
        return h("p", { class: "hs-tmsg " + (m.from === "homeowner" ? "is-me" : "is-pro"), text: m.text });
      }) : [h("p", { class: "hs-meta", text: t("caso.threadEmpty") })]);
      var inp = h("input", { type: "text", maxlength: "2000", "data-thread-input": o.proId, placeholder: t("caso.threadPh"), "aria-label": t("caso.threadPh") });
      inp.value = drafts[o.proId] || "";
      inp.addEventListener("input", function () { drafts[o.proId] = inp.value; });
      var form = h("form", { class: "hs-thread-form", "data-thread": o.proId }, [inp, h("button", { class: "hs-btn hs-btn-line", type: "submit", text: t("chat.send") })]);
      return h("div", { class: "hs-thread" }, [h("p", { class: "hs-review-h", text: t("caso.thread", { name: o.name || o.company }) }), list, form,
        o.status === "accepted_talk_first" ? h("p", { class: "hs-meta", text: t("caso.threadPrivate") }) : null]);
    }
    function render() {
      if (deleted) { box.innerHTML = ""; box.appendChild(h("div", { class: "hs-panel" }, [h("p", { class: "hs-ok", text: t("caso.deleted") }), h("a", { href: "/home-shield/", text: t("caso.back") })])); return; }
      if (!data) return;
      var d = data;
      var stepN = d.status === "connected" ? 4 : d.offers.length ? 3 : 2;
      var tl = h("ol", { class: "hs-timeline", id: "casoTimeline", "aria-label": t("caso.title") }, ["caso.s1", "caso.s2", "caso.s3", "caso.s4"].map(function (k, i) {
        var n = i + 1;
        return h("li", { class: n < stepN || (n === 4 && stepN === 4) ? "is-done" : n === stepN ? "is-now" : "", "aria-current": n === stepN ? "step" : null, text: t(k) });
      }));
      var parts = [tl];
      if (d.conn) {
        var cn = d.conn;
        parts.push(h("section", { class: "hs-panel hs-connected", id: "casoConnected" }, [
          h("h2", { class: "hs-h3", text: t("caso.connected") }),
          h("p", { text: t("caso.connectedBody", { name: cn.name || cn.company || "" }) }),
          h("p", { class: "hs-meta", text: [cn.name, cn.company].filter(Boolean).join(" · ") }),
          h("div", { class: "hs-contact" }, [
            cn.phone ? h("a", { href: "tel:" + String(cn.phone).replace(/[^\d+]/g, ""), text: prettyPhone(cn.phone) }) : null,
            cn.email ? h("a", { href: "mailto:" + cn.email, text: cn.email }) : null
          ])
        ]));
      }
      if (d.summary) parts.push(h("section", { class: "hs-panel" }, [h("h2", { class: "hs-h3", text: t("caso.summary") }), h("p", { text: d.summary }),
        h("p", { class: "hs-meta", text: [d.issue ? t("issue." + d.issue) : "", (d.trades || []).map(function (x) { return t("trade." + x); }).join(", "), d.area].filter(Boolean).join(" · ") })]));
      parts.push(h("h2", { class: "hs-h3", text: t("caso.offers") }));
      if (!d.offers.length) parts.push(h("p", { class: "hs-panel", text: t("caso.none") }));
      d.offers.forEach(function (o) {
        var lic = [o.licenseType ? t("lic." + o.licenseType) : "", o.licenseNumber, o.licenseState].filter(Boolean).join(" ");
        var btn = function (act, key, cls) { return h("button", { class: "hs-btn " + cls, type: "button", "data-offer": o.id, "data-act": act, disabled: busy, text: t(key) }); };
        var acts = null, open = d.status !== "connected";
        if (o.status === "pending" && open) {
          acts = h("div", { class: "hs-offer-actions" }, [btn("talk_first", "caso.talkFirst", "hs-btn-gold hs-wide"), btn("accept", "caso.share", "hs-btn-line"), btn("decline", "caso.decline", "hs-btn-line")]);
        } else if (o.status === "accepted_talk_first" && open) {
          acts = h("div", { class: "hs-offer-actions" }, [btn("share_contact", "caso.share", "hs-btn-gold"), btn("decline", "caso.decline", "hs-btn-line")]);
        }
        var note = o.status === "declined" ? t("caso.declined") : o.status === "accepted_talk_first" ? t("caso.talking") : o.status === "accepted" ? t("caso.sharedNote") : o.status === "pending" && open ? t("caso.talkFirstNote") : "";
        parts.push(h("article", { class: "hs-offer" + (o.status === "declined" ? " is-declined" : ""), "data-offer-id": o.id, "data-status": o.status }, [
          h("h3", { text: o.name || o.company }),
          h("p", { class: "hs-meta", text: [o.company, (o.trades || []).map(function (x) { return t("trade." + x); }).join(", ")].filter(Boolean).join(" · ") }),
          lic ? h("p", { class: "hs-meta hs-lic", text: t("caso.license") + ": " + lic + (o.verified ? " · " + t("caso.verified") : "") }) : null,
          o.message ? h("blockquote", { text: o.message }) : null,
          note ? h("p", { class: "hs-meta", text: note }) : null,
          acts,
          o.status === "accepted_talk_first" || o.status === "accepted" ? threadEl(o) : null
        ]));
      });
      parts.push(h("button", { class: "hs-del", type: "button", id: "casoDelete", text: t("caso.delete") }));
      var focusId = doc.activeElement && doc.activeElement.getAttribute && doc.activeElement.getAttribute("data-thread-input");
      box.innerHTML = "";
      parts.forEach(function (p) { box.appendChild(p); });
      if (focusId) { var fi = box.querySelector('[data-thread-input="' + focusId + '"]'); if (fi) fi.focus(); }
    }
    function err(e) {
      var p = h("p", { class: "hs-err", role: "alert", text: t("caso.err", { e: e.message }) });
      box.insertBefore(p, box.firstChild);
    }
    function refresh() {
      return get().then(function (j) {
        data = norm(j);
        var open = data.offers.filter(function (o) { return o.status === "accepted_talk_first" || o.status === "accepted"; });
        return Promise.all(open.map(loadThread));
      }).then(function () { render(); }).catch(function (e) {
        if (e.status === 404 || e.status === 403 || e.status === 401) { clearInterval(poll); box.innerHTML = ""; box.appendChild(h("div", { class: "hs-panel" }, [h("p", { text: t("caso.bad") }), h("a", { href: "/home-shield/", text: t("caso.back") })])); }
      });
    }
    box.addEventListener("submit", function (e) {
      var f = e.target.closest("form[data-thread]");
      if (!f) return;
      e.preventDefault();
      var proId = f.getAttribute("data-thread"), inp = f.querySelector("input"), text = inp.value.trim();
      if (!text) return;
      inp.disabled = true;
      post("hs-case-messages", { caseId: c, token: tok, proId: proId, text: text }).then(function (j) {
        drafts[proId] = "";
        (threads[proId] = threads[proId] || []).push(j.message || { from: "homeowner", text: text });
        render();
        if (j.scrubbed) { var n = box.querySelector('form[data-thread="' + proId + '"]'); if (n) n.parentNode.appendChild(h("p", { class: "hs-meta", text: t("caso.scrubbed") })); }
      }).catch(function (x) { inp.disabled = false; err(x); });
    });
    box.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      if (b.hasAttribute("data-act")) {
        busy = true;
        b.disabled = true;
        post("hs-offer-respond", { caseId: c, token: tok, offerId: b.getAttribute("data-offer"), action: b.getAttribute("data-act") })
          .then(function () { busy = false; return refresh(); })
          .catch(function (x) { busy = false; render(); err(x); });
      } else if (b.id === "casoDelete") {
        var ask = h("div", { class: "hs-panel", id: "casoDeleteAsk" }, [h("p", { text: t("caso.deleteAsk") }), h("button", { class: "hs-del", type: "button", id: "casoDeleteYes", text: t("caso.deleteConfirm") })]);
        b.replaceWith(ask);
      } else if (b.id === "casoDeleteYes") {
        b.disabled = true;
        post("hs-case-delete", { caseId: c, token: tok }).then(function () { deleted = true; clearInterval(poll); store("hs_case", null); render(); }).catch(function (x) { b.disabled = false; err(x); });
      }
    });
    langHooks.push(render);
    box.textContent = t("caso.loading");
    refresh();
    poll = setInterval(function () { if (!doc.hidden && !busy) refresh(); }, 15000);
    window.HS_CASO_REFRESH = refresh;
  }

  /* ================================================================
     WIRING
     ================================================================ */
  function init() {
    applyLang(lang, false);
    var lb = doc.getElementById("hsLang");
    if (lb) lb.addEventListener("click", function () { stopSpeech(); applyLang(lang === "es" ? "en" : "es", true); });
    if (doc.body.getAttribute("data-page") === "caso") { initCaso(); return; }

    initAssets();
    initStars();
    showMyCase();
    var mute = doc.getElementById("hsMute");
    var paintMute = function () { if (!mute) return; mute.setAttribute("aria-pressed", muted ? "true" : "false"); mute.setAttribute("data-i18n-aria", muted ? "chat.unmute" : "chat.mute"); var a = t(muted ? "chat.unmute" : "chat.mute"); mute.setAttribute("aria-label", a); mute.setAttribute("title", a); };
    paintMute();
    if (mute) mute.addEventListener("click", function () { muted = !muted; store("hs_muted", muted ? "1" : "0"); if (muted) stopSpeech(); paintMute(); });
    langHooks.push(function () {
      paintMute();
      if (cardEl) showCaseCard(chat.cardMode);
      var on = doc.querySelectorAll(".hs-listen");
      for (var i = 0; i < on.length; i++) setListenBtn(on[i], on[i] === speech.owner ? "on" : "");
    });

    doc.addEventListener("click", function (e) {
      var el = e.target.closest("[data-action],[data-listen]");
      if (!el) return;
      if (el.hasAttribute("data-listen")) { onListen(el); return; }
      var act = el.getAttribute("data-action");
      if (act === "star") onStarTap();
      else if (act === "upload") onUploadClick();
      else if (act === "talk") {
        stopSpeech();
        openSheet();
        var starter = el.getAttribute("data-starter");
        if (starter) { greetIfNeeded(false); sendText(t(starter)); }
        else greetIfNeeded(true);
        if (!starter && input) setTimeout(function () { input.focus(); }, 60);
      }
    });
    var compose = doc.getElementById("hsCompose");
    if (compose) compose.addEventListener("submit", function (e) { e.preventDefault(); var v = input.value; input.value = ""; stopSpeech(); sendText(v); });
    var mic = doc.getElementById("hsMic");
    if (mic) mic.addEventListener("click", function () { if (convo.active) { convo.stop(); stopSpeech(); } else onStarTap(); });
    var close = doc.getElementById("hsClose");
    if (close) close.addEventListener("click", closeSheet);
    doc.addEventListener("keydown", function (e) { if (e.key === "Escape" && sheet && !sheet.hidden) closeSheet(); });
    if (fileInput) fileInput.addEventListener("change", onFilePicked);
    if (input) input.addEventListener("input", function () { if (convo.active && convo.state === "speaking") stopSpeech(); });
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init); else init();
})();
