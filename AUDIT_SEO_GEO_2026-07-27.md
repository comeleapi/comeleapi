# Audit SEO + GEO — comeleapi.it
**Data:** 27 luglio 2026 · **Metodo:** 6 agenti di analisi specializzati + verifica manuale sicurezza/fiducia + ricerca concorrenti · **Perimetro:** intera piattaforma (sito pubblico, /links/, gestionale, Worker Cloudflare, pipeline di build, dati strutturati, strategia documentata)

> Nessuna modifica al codice è stata effettuata. Questo documento è un piano di lavoro.

---

## 1. Sintesi iniziale della situazione

comeleapi.it è una piattaforma tecnicamente **sopra la media** per un'attività locale di questa dimensione: grafo JSON-LD sofisticato con validator automatico, pre-rendering statico dei contenuti, CSP con Trusted Types, robots.txt esplicitamente aperto a tutti i crawler AI, pipeline di build con igiene di deploy corretta.

Il problema è che **l'eccellenza tecnica poggia su una presenza quasi inesistente fuori dal sito e su un'architettura monopagina che non può competere**. In sintesi:

1. **Il sito è una singola pagina** (più /links/). Non esistono pagine per servizi, zone, FAQ o approfondimenti. Tutta la strategia documentata in `strategia-seo-geo-sara.md` (sezioni 2.2, 8) prevede un'architettura multi-pagina che **non è mai stata implementata**.
2. **Zero segnali esterni**: nessun Google Business Profile, nessuna citazione locale, nessuna recensione, sameAs limitato a 2 profili social. Per una query come "massaggi a domicilio Bresso" la SERP è dominata da marketplace (ProntoPro, Miodottore, Cronoshare) che vincono proprio grazie a recensioni e aggregazione — segnali che comeleapi non possiede.
3. **La GEO è a metà**: l'infrastruttura per essere letti dalle AI c'è (robots.txt, FAQ estraibili, HTML statico), ma **manca il contenuto che le AI possano citare** (definizioni, confronti, prezzi completi, prove di autorevolezza) e manca la conferma esterna dell'entità.
4. **Gap di conformità e fiducia**: P.IVA assente ovunque, privacy/cookie policy esistono solo dentro modal JavaScript non crawlabili.

**Giudizio complessivo: 5,5/10.** Fondamenta tecniche 8/10, visibilità reale 3/10. Il divario tra ciò che il codice permetterebbe e ciò che la presenza organica effettivamente produce è il dato dominante di questo audit.

---

## 2. Valutazione generale della piattaforma

| Area | Voto | Sintesi |
|---|---|---|
| SEO tecnica (crawling, indexing, canonical) | 7/10 | Solida; mancano redirect canonici host e pagine indicizzabili oltre la home |
| Contenuti e keyword | 4/10 | H1 senza keyword, card servizi senza testo visibile, nessuna pagina di approfondimento |
| Architettura e link interni | 3/10 | Monopagina: nessuna profondità, nessuna possibilità di presidiare query specifiche |
| Dati strutturati | 8/10 | Grafo @id eccellente con validator; incoerenze minori (inLanguage, prezzi parziali) |
| SEO locale | 3/10 | 6 comuni su 15+ previsti, zero GBP, zero citazioni, NAP incoerente |
| GEO / visibilità AI | 5/10 | Infrastruttura pronta, contenuto citabile assente, entità non confermata esternamente |
| Performance, mobile, accessibilità | 6,5/10 | Preload/defer/lazy corretti, build minifica; rischio `.reveal` senza noscript, no skip-link |
| Reputazione e autorevolezza | 2/10 | Zero recensioni, zero menzioni esterne, E-E-A-T debole |
| Sicurezza e fiducia tecnica | 8,5/10 | PBKDF2, CSRF, rate limiting, CSP/TT, HSTS, igiene deploy; gap solo legali (P.IVA, policy) |
| Allineamento con la strategia documentata | 4/10 | `strategia-seo-geo-sara.md` implementata solo nelle parti on-page tecniche |

---

## 3. Principali problemi trovati (ordinati per impatto reale)

| # | Problema | Dove | Classe |
|---|---|---|---|
| P1 | Architettura monopagina: impossibile posizionarsi per query servizio+zona | `index.html` unica pagina indicizzabile di contenuto; sitemap con soli 3 URL | **Bloccante** (per la crescita) |
| P2 | Zero Google Business Profile e zero citazioni locali | Fuori sito; previsti da `strategia-seo-geo-sara.md` §3.2, §5 | **Bloccante** (per il locale) |
| P3 | Zero recensioni visibili o aggregate ovunque | Sito + assenza GBP/ProntoPro/Miodottore | **Importante** |
| P4 | Card servizi senza descrizioni visibili: mismatch tra schema (description presenti) e pagina | `index.html` sezione servizi vs `scripts/structured-data.mjs` L20-67 | **Importante** |
| P5 | H1 privo di keyword: "Vola verso il tuo benessere" | `index.html` L1292 | **Importante** |
| P6 | Privacy/cookie policy solo in modal JS (`href="#"`), P.IVA assente ovunque | `index.html` L1788-1789, `assets/js/app.js` L793-1032 | **Importante** (legale + fiducia) |
| P7 | areaServed limitata a 6 comuni contro i 15+ della strategia | `scripts/structured-data.mjs` L11-18 vs strategia §2 (L102-112) | Importante |
| P8 | NAP incoerente: "comeleapi" vs "Come le api"; telefono "388 163 9306" (footer/FAQ) vs "+393881639306" (schema) | `index.html` L1780, `structured-data.mjs` L95, L188 | Importante |
| P9 | `.reveal { opacity:0 }` senza fallback `<noscript>`: con JS disattivo gran parte della pagina resta invisibile | `assets/css/styles.css` L1569; fallback solo per prefers-reduced-motion (L1575-1579) e via JS (`app.js` L310-326) | Importante |
| P10 | Incoerenza prezzi: FAQ dichiara relax 40€, mirato 30€, kinesio 10€ ma lo schema ha Offer solo per 4 servizi su 7 | `structured-data.mjs` L91 (FAQ) vs L20-67 (SERVICE_DEFINITIONS) | Miglioramento |
| P11 | FAQPage `inLanguage: "it-IT"` vs WebPage/WebSite `["it-IT","en"]`; `<html lang="it">` vs schema bilingue | `structured-data.mjs` L371-389 vs L417/427; `index.html` L2 | Miglioramento |
| P12 | Person Sara Bordenga senza `sameAs`: l'entità della fondatrice non è collegabile ai profili social | `structured-data.mjs` L222-236 | Miglioramento |
| P13 | Nessun redirect canonico www/apex/*.workers.dev documentato a livello Worker/DNS | `src/worker/index.mjs` non gestisce host | Miglioramento |
| P14 | 6 elementi nascosti via JS (foto about, community CTA, WhatsApp float…): contenuto E-E-A-T presente in HTML ma non mostrato | `index.html` L1629, L1674, L1809 | Miglioramento |
| P15 | Nessun contenuto definizionale/informativo citabile dalle AI (cos'è, benefici, per chi, controindicazioni) | Tutto il sito | **Opportunità strategica** |
| P16 | Manca skip-link per l'accessibilità da tastiera | `index.html` inizio body | Miglioramento |
| P17 | Link dofollow in footer verso WebNovis (leak di PageRank su sito monopagina) | `index.html` L1795 | Minore |

---

## 4. Principali opportunità

1. **Nessun concorrente presidia Bresso/Cusano/Cormano con pagine dedicate.** La SERP locale è occupata solo da marketplace generalisti: una pagina "Massaggio a domicilio a Bresso" ben fatta ha campo quasi libero. È il punto di svolta n.1.
2. **Google Business Profile per Service Area Business**: costo quasi nullo, impatto massimo su Map Pack e su ogni query "vicino a me". La strategia lo prevede già (§3.2) con configurazione pronta.
3. **Il posizionamento "massaggio + aromaterapia Young Living" è unico nella zona.** Nessun risultato in SERP combina i due temi: contenuto differenziante che le AI possono citare come specialità.
4. **L'infrastruttura GEO è già pronta**: robots.txt aperto (Googlebot, GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot ecc.), FAQ in `<details>` + FAQPage sincronizzate da un'unica fonte (`FAQ_DEFINITIONS`), HTML pre-renderizzato. Aggiungere contenuto citabile ha costo marginale basso.
5. **Il validator dei dati strutturati** (`check-structured-data.mjs`) rende ogni estensione dello schema sicura e verificabile: aggiungere comuni, Offer o sameAs è a rischio zero di regressione.
6. **Le recensioni sono il divario più colmabile**: i marketplace vincono per le recensioni; 10-15 recensioni Google reali cambierebbero la competitività locale più di qualunque intervento on-page.

---

## 5. Analisi dettagliata per area

### 5.1 SEO tecnica (AUDIT-1)

**Cosa funziona.** `robots.txt` ben strutturato con direttiva Sitemap e allowlist esplicita per tutti i principali crawler AI; sitemap.xml presente; canonical in pagina; admin/login con `noindex` e gate di autenticazione nel Worker (`src/worker/index.mjs` L97-132: `/admin`, `/admin.html` e perfino `/assets/js/admin.js` richiedono sessione, con 302 verso login); service worker network-first (`sw.js` L38-48) che non serve HTML stantio; nessuna infrastruttura zombie (Render/Netlify residui esclusi dal deploy).

**Criticità.**
- **Sitemap con 3 URL**: non è un difetto della sitemap ma il sintomo di P1 — non c'è nulla da indicizzare oltre la home e /links/. Conseguenza: il crawl budget non è un problema, la superficie di ranking sì.
- **Host canonici**: il Worker non normalizza www→apex né blocca l'hostname `*.workers.dev` (in `index.mjs` non esiste logica sull'host). Se il progetto Workers risponde anche su `comeleapi.workers.dev`, Google può indicizzare un duplicato integrale del sito. Gravità media, urgenza media, sforzo basso (redirect 301 nel Worker o regola Cloudflare). Verifica: `curl -I https://<nome>.workers.dev/` deve restituire 301 verso https://comeleapi.it/.
- **`<html lang="it">` vs `inLanguage ["it-IT","en"]`** (P11): la pagina dichiara di essere solo italiana ma lo schema promette bilinguismo (giustificato dalle traduzioni runtime dei prodotti in `app.js`). Nessun hreflang esiste. Va scelta una linea: o si dichiara solo it-IT ovunque, o si implementa un vero toggle con hreflang. Impatto basso ma è un segnale di incoerenza che i parser rigidi (e i validatori AI) rilevano.

### 5.2 Contenuti e parole chiave (AUDIT-2)

- **H1 "Vola verso il tuo benessere"** (`index.html` L1292): evocativo, zero valore semantico. Il title (L6, "comeleapi — Massaggi a domicilio a Bresso e Milano Nord") fa da solo tutto il lavoro. Correzione a basso costo: mantenere la frase emotiva come sottotitolo e portare nell'H1 "Massaggi a domicilio a Bresso e Milano Nord" (o soluzione mista). Beneficio: rafforzo del topic principale per la query primaria; rischio: zero.
- **Card servizi mute** (P4): i 7 servizi hanno `description` complete nello schema (`structured-data.mjs` L20-67) ma le card visibili mostrano solo nome/durata/prezzo. Google confronta schema e contenuto visibile: descrizioni presenti solo nello schema sono un'incoerenza che indebolisce l'eleggibilità ai rich results e priva la pagina di ~700 parole di testo rilevante. Correzione: rendere visibili le stesse descrizioni (il validator già impone che i nomi coincidano, L120-126 di `check-structured-data.mjs` — estendere il principio alle descrizioni).
- **Copertura keyword**: le keyword locali ("massaggio a domicilio bresso", "massaggiatrice cusano milanino"…) esistono solo in title/meta/FAQ, mai come heading o sezioni. Le keyword informazionali ("a cosa serve il massaggio decontratturante", "linfodrenaggio benefici") sono totalmente assenti: è il gap che alimenta P15.
- **12 FAQ** ben fatte (incluse quelle anti-ambiguità: "non ho uno studio", "non vendo online") ma la strategia ne prevede 15-20 con più varianti locali e definizionali.
- **E-E-A-T**: la foto della fondatrice e la sezione community esistono nell'HTML ma sono nascoste via JS (P14); le credenziali sono mini-card generiche senza ente/anno. Per un servizio che tocca il corpo delle persone (YMYL-adiacente) la verificabilità della professionista è centrale, per Google come per le AI.
- **Ambiguità dell'entità**: "comeleapi" (schema, L182-202), "Come le api" (testi narrativi), "comeleapi - Sara Bordenga" (privacy). Serve una forma canonica + `alternateName`.

### 5.3 Architettura e collegamenti interni

- Il sito è **una pagina con ancore** (#servizi, #oli, #faq…): la navigazione interna non distribuisce autorevolezza perché non esistono pagine da collegare. Non c'è dispersione (nessuna cannibalizzazione, nessun duplicato) — c'è **assenza di superficie**.
- `/links/` è di fatto una landing bio separata con grafo schema proprio (5 nodi, validati): corretta, ma è l'unico secondo nodo del "sito".
- La strategia (§8, L240-263) disegna già l'architettura target: `/servizi/<slug>/`, `/zone/<comune>/`, `/prodotti/`, `/faq/`, `/blog/`. Nulla di questo esiste. Ogni pagina servizio+zona mancante è una query che oggi viene vinta da ProntoPro/Miodottore per assenza di concorrenti diretti.
- Link esterni: i 12 prodotti puntano a Young Living con `rel="noopener nofollow"` (corretto, L1330-1533); il link WebNovis in footer è dofollow (P17) — su un sito monopagina il peso relativo di un singolo dofollow esterno è più alto del normale. Correzione: `rel="nofollow"` o sponsorizzato.

### 5.4 Dati strutturati (AUDIT-3 — l'area migliore: 8/10)

**Punti di forza rari a questo livello**: grafo unificato con riferimenti `@id` (WebSite → WebPage → Organization/LocalBusiness → Person → Service ×7 → OfferCatalog → Product ×12 → FAQPage ×12 → DigitalDocument per la mini-guida PDF); generazione da un'unica fonte (`structured-data.mjs`) iniettata in build; **validator dedicato** (`check-structured-data.mjs`) che impone conteggi esatti, vieta proprietà incoerenti con la privacy (address/geo/latitude, L105-114), vieta rating fittizi (L197-211) e verifica la coerenza schema↔HTML per i nomi servizio. La scelta di **non** dichiarare `aggregateRating` senza recensioni reali è corretta e va difesa.

**Criticità puntuali:**
1. **P11 — inLanguage incoerente**: FAQPage "it-IT" (L371-389) contro WebPage/WebSite `["it-IT","en"]` (L417, L427). Fix: 5 minuti, uniformare (consiglio: tutto `"it-IT"` finché non esiste una versione inglese navigabile). Verifica: Rich Results Test + `npm run check` (validator).
2. **P10 — Offer mancanti**: relax, mirato-30 e kinesio non hanno prezzo nello schema ma i prezzi sono dichiarati nel testo FAQ (L91: 40€, 30€, 10€). Le AI che estraggono prezzi dallo schema vedono un catalogo incompleto; i parser che confrontano FAQ e Offer vedono un'incoerenza. Fix: aggiungere le 3 Offer (e aggiornare i conteggi nel validator).
3. **P12 — Person senza sameAs**: Sara Bordenga non è collegata a Instagram/Facebook (che nello schema appartengono solo all'Organization, L188-190). Per l'entity building della professionista (fondamentale per E-E-A-T e per il knowledge graph) il collegamento è gratuito.
4. **Assente HowTo/Article**: coerente con l'attuale monopagina, ma quando nasceranno pagine di contenuto serviranno tipi dedicati.

### 5.5 SEO locale (AUDIT-5 — 3/10, l'area più arretrata)

- **areaServed = 6 comuni** (`structured-data.mjs` L11-18: Bresso, Cusano Milanino, Cormano, Cinisello Balsamo, Sesto San Giovanni, Milano) contro il modello a 3 cerchi della strategia (§2, L102-112) che include anche Niguarda, Bruzzano, Bollate, Paderno Dugnano, Affori, Senago, Garbagnate. Ogni comune assente è un segnale locale non emesso.
- **Google Business Profile: inesistente.** Per un Service Area Business è LO strumento locale: Map Pack, recensioni, foto, post, statistiche di ricerca. La strategia (§3.2, L114-121) ha già la configurazione SAB pronta (aree servite senza indirizzo esposto). Senza GBP, comeleapi non può apparire nel Map Pack per nessuna query — che per "massaggi a domicilio + comune" è la sezione più cliccata della SERP.
- **Citazioni: zero.** La lista è già scritta (strategia §5, L123-133: PagineGialle, Bing Places, ecc.). Le citazioni coerenti sono anche il modo in cui gli LLM confermano l'esistenza dell'entità.
- **NAP incoerente** (P8): finché nome e formato telefono non sono identici ovunque (sito, schema, futuri GBP e citazioni), ogni citazione creata rischia di frammentare l'entità invece di rafforzarla. **Questa correzione va fatta PRIMA di aprire GBP e citazioni.**
- Nessuna pagina zona, nessun contenuto che menzioni i comuni oltre a meta/FAQ/areaServed.

### 5.6 GEO — visibilità nei sistemi AI (AUDIT-5 — 5/10)

**Pronto:** robots.txt apre esplicitamente a Googlebot, Google-Extended, GPTBot, OAI-SearchBot, ClaudeBot, Claude-SearchBot, PerplexityBot, Applebot, CCBot + wildcard; le 12 FAQ sono contemporaneamente HTML semantico (`<details>`) e FAQPage JSON-LD generate dalla stessa fonte (`FAQ_DEFINITIONS`, L72-121) — il formato ideale per l'estrazione; l'HTML è pre-renderizzato quindi leggibile senza JS; `llms.txt` assente per scelta documentata (posizione difendibile a luglio 2026).

**Mancante:**
1. **Contenuto citabile**: le AI citano chi risponde a domande. Oggi il sito risponde solo a domande su sé stesso (come funziona il servizio) ma mai a domande informative ("che differenza c'è tra massaggio decontratturante e sportivo?", "il linfodrenaggio è adatto in gravidanza?"). Senza queste risposte, non c'è motivo per cui ChatGPT/Perplexity/AI Overviews citino comeleapi.
2. **Conferma esterna dell'entità**: gli LLM triangolano. Un'entità presente solo sul proprio dominio con 2 profili social è "non confermata": GBP, citazioni, recensioni e menzioni sono anche segnali GEO, non solo locali.
3. **Prezzi incompleti nello schema** (P10): i sistemi che rispondono a "quanto costa un massaggio a domicilio a Bresso" oggi trovano il dato più facilmente su Cronoshare (che pubblica range 41-55€) che sullo schema di comeleapi.
4. **Rischio residuo di rendering**: i prodotti sono pre-renderizzati (L1330-1533) ma `app.js` L613 li sovrascrive con `innerHTML` dai dati API; se `/api/products` fallisce e il fallback `products.json` pure, l'utente (non il crawler) vede il messaggio "nessun prodotto". Rischio basso, ma da monitorare.

### 5.7 Prestazioni, mobile, accessibilità (AUDIT-4 — 6,5/10)

**Buono:** preload di hero e font con fetchpriority (L1249-1252), script tutti `defer` (L1813-1817), lazy-loading immagini sotto la piega, palette con contrasto conforme (#32171B su #FEEEEF), un solo H1, `:focus-visible` definito (styles.css L136-140), `prefers-reduced-motion` rispettato (L1575-1579), header di cache corretti in `dist/_headers` (asset immutabili 1 anno, HTML must-revalidate).

**Criticità:**
- **P9 — `.reveal` opacity:0**: se JS non viene eseguito (blocco script, errore, reader modes), tutte le sezioni animate restano invisibili. L'unico fallback CSS è per reduced-motion. Fix a costo quasi nullo: `<noscript><style>.reveal{opacity:1;transform:none}</style></noscript>`. Da fare subito.
- **P16 — nessun skip-link**: gli utenti da tastiera devono tabulare l'intera navigazione. Fix standard di 3 righe.
- **Minificazione**: i sorgenti non sono minificati ma `build-site.mjs` minifica CSS/JS e versiona con hash in `dist/` (L479-488). **Falso positivo parziale dell'agente performance** — vedi §5.11.
- Touch target di alcune icone social vicini al limite dei 44px; nessun critical CSS inline (accettabile date le dimensioni del CSS).

### 5.8 Reputazione, recensioni, autorevolezza (2/10)

- **Zero recensioni ovunque**: né Google (manca GBP), né marketplace, né testimonianze on-site. I concorrenti in SERP (ProntoPro: "40 migliori massaggiatori a Bresso classificati in base alle recensioni"; Miodottore: "recensioni verificate") competono esattamente su questo.
- **Zero menzioni esterne**: nessuna citazione, articolo, directory. Il dominio è un'isola.
- **E-E-A-T on-site debole**: credenziali generiche, foto nascosta, nessuna pagina "chi sono" approfondita. Lo schema Person esiste ma senza sameAs (P12) né riconoscimenti verificabili (nota: il validator vieta `hasCredential` per scelta — rivalutare quando esisteranno credenziali documentabili).
- **Percorso consigliato**: (1) GBP + prime 10 recensioni reali → (2) testimonianze on-site con nome/zona → (3) solo allora `aggregateRating` nello schema, allentando il divieto nel validator. Mai il contrario: rating schema senza recensioni verificabili è un rischio di azione manuale.

### 5.9 Sicurezza, affidabilità, segnali di fiducia (AUDIT-6 — 8,5/10 tecnico, con gap legali)

**Verificato direttamente sul codice:**
- **Autenticazione**: PBKDF2-SHA256 100.000 iterazioni via WebCrypto (`src/worker/auth.mjs` L37-68), sessioni su D1, CSRF double-submit verificato su ogni rotta admin (`index.mjs` L67-70), rate limiting sia sul login (`LOGIN_MAX_ATTEMPTS`) sia sul form contatti (`checkContactRate` → 429, `leads.mjs` L87-89).
- **Cookie di sessione**: `HttpOnly` + `SameSite=Lax` + `Secure` (`lib.mjs` L155-158).
- **Gate admin**: `/admin`, `/admin.html`, `/admin/` e `/assets/js/admin.js` richiedono sessione; senza sessione → 302 al login o 401 per il JS (`index.mjs` L97-113). Il gestionale non espone nulla ai crawler (oltre al noindex).
- **Igiene deploy**: `FORBIDDEN_OUTPUTS` in `build-site.mjs` (L118-128) impedisce che `server.js`, `package.json`, `wrangler.jsonc`, `data/`, `scripts/`, `.env` finiscano in `dist/`. La allowlist `PUBLIC_FILES` (L34-56) è esplicita. Corretto.
- **Header**: CSP con `require-trusted-types-for 'script'; trusted-types comeleapi`, HSTS preload, X-Frame-Options DENY (`dist/_headers` + `withSecurityHeaders` nel Worker).

**Gap di fiducia e conformità (non tecnici ma visibili a utenti, Google e AI):**
- **P6a — P.IVA assente ovunque** (grep su tutto il progetto: zero occorrenze). L'art. 35 DPR 633/72 impone l'indicazione della partita IVA sulla home page dei siti di soggetti che esercitano attività d'impresa/lavoro autonomo. Oltre al profilo sanzionatorio, l'assenza è un segnale di fiducia mancante che i sistemi AI usano per valutare la legittimità di un'attività commerciale.
- **P6b — Policy solo in modal JS**: privacy e cookie policy sono complete e ben scritte (bilingui, con basi giuridiche GDPR corrette — `app.js` L972-1032) ma vivono dentro un modal aperto da `href="#"` (`index.html` L1788-1789). Non esistono URL `/privacy/` e `/cookie-policy/` crawlabili: Google e le AI non possono verificarne l'esistenza, e un utente non può linkarle o stamparle. Il contenuto c'è già: va solo promosso a pagina statica.
- Il titolare è indicato come "comeleapi - Sara Bordenga, 20091 Bresso (MI)" solo dentro il modal (L1017) — terza variante del nome (vedi P8).

### 5.10 Allineamento con la strategia documentata

`strategia-seo-geo-sara.md` è un documento di qualità. Stato di implementazione:

| Sezione strategia | Stato |
|---|---|
| On-page tecnico home (title, meta, schema, FAQ) | ✅ Implementato, spesso oltre le attese |
| §2 Copertura territoriale (3 cerchi, 15+ comuni) | ❌ Solo 6 comuni |
| §3.2 GBP Service Area Business | ❌ Non aperto |
| §5 Citazioni locali | ❌ Zero |
| §6 Recensioni | ❌ Zero |
| §8 Architettura multi-pagina (/zone/, /servizi/, /blog/, /faq/) | ❌ Non esiste |
| §GEO Azioni (contenuto citabile, definizioni) | ❌ Solo FAQ operative |
| "Cosa NON fare" (L330-336) | ✅ Rispettato (no rating finti, no keyword stuffing) |

**Conclusione**: la piattaforma ha eseguito la parte del piano che si fa nel codice e ignorato quella che si fa fuori dal codice o che richiede nuove pagine. È il pattern classico "tecnica 8, distribuzione 2".

### 5.11 Conclusioni discordanti tra agenti (riconciliate)

Richiesto esplicitamente dal mandato: i punti in cui gli agenti sono arrivati a conclusioni diverse.

1. **Rendering dei prodotti** — L'agente contenuti sosteneva che i prodotti fossero renderizzati client-side (rischio grave per crawler senza JS). L'agente performance ha verificato il sorgente: le 12 card prodotto **sono pre-renderizzate staticamente** in `index.html` L1330-1533 e quindi visibili a qualunque crawler; è `app.js` (L613) che a runtime le **sovrascrive** con `innerHTML` dai dati API. Verdetto: nessun problema di indicizzazione; restano due rischi minori — divergenza possibile tra HTML statico e catalogo API (mitigata dalla build che rigenera l'HTML dal catalogo) e messaggio "nessun prodotto" in caso di doppio fallimento API+fallback.
2. **Asset non minificati** — L'agente performance segnalava CSS/JS non minificati basandosi sui sorgenti. La verifica su `build-site.mjs` (L479-505) mostra che la build **minifica e versiona con hash** tutto ciò che finisce in `dist/`. Verdetto: falso positivo per la produzione; la segnalazione vale solo se si servisse la directory sorgente.
3. **Assenza di aggregateRating** — L'agente dati strutturati la valuta come scelta corretta (il validator la vieta finché non esistono recensioni reali); l'agente locale/reputazione la segnala come gap competitivo. Verdetto: **entrambi hanno ragione su piani diversi**. La sequenza corretta è: prima recensioni reali (GBP), poi testimonianze on-site, infine rating nello schema. Il divieto nel validator è una protezione, non un difetto.

---

## 6. Confronto con i concorrenti

### 6.1 Chi occupa la SERP oggi (query verificate: "massaggi a domicilio Bresso", "massaggio a domicilio Milano")

| Concorrente | Tipo | Perché vince | Debolezza sfruttabile |
|---|---|---|---|
| **ProntoPro** (prontopro.it/bresso-massaggi) | Marketplace | "40 migliori massaggiatori a Bresso" ordinati per recensioni; pagina per ogni comune | Contenuto generico, nessuna specializzazione, esperienza da preventivificio |
| **Miodottore** (servizi/massaggio-decontratturante/bresso) | Marketplace sanitario | Recensioni verificate + prenotazione online + pagina servizio×comune | Taglio clinico, non copre il benessere olistico/aromaterapia |
| **Cronoshare** (servizi/massaggi-a-domicilio/milano/bresso) | Marketplace | Pubblica range di prezzo (41-50€, decontratturante 45-50€, ayurvedico 50-55€): contenuto che le AI citano volentieri | Nessun professionista reale in evidenza, contenuto template |
| **ShapeMe** (shapeme.it/massaggi-a-domicilio-milano) | Piattaforma booking | Prenotazione online strutturata, brand curato, copertura Milano | Non presidia i singoli comuni di Milano Nord |
| **ilmassaggioadomicilio.it** | Concorrente diretto (Francesca Di Palma) | Descrizioni servizio lunghe (200+ parole ciascuna), prezzi visibili (80€/60min), founder brand forte, booking Calendly, 7/7 8-21, prodotti proprietari (1981 Lab) | Verificato sul sito: promo scadute ancora in pagina ("Festa della Donna fino al 8/3/2024", Black Friday), prezzi barrati confusi, tutto su una pagina Elementor pesante, focus solo Milano città, nessun presidio Milano Nord |
| **PagineBianche/PagineGialle** | Directory | Autorevolezza di dominio su query "centro massaggi + comune" | Schede povere: una scheda curata di comeleapi spiccherebbe |

### 6.2 Che cosa hanno loro e manca a comeleapi

1. **Pagine servizio×comune** (Miodottore, Cronoshare, ProntoPro le hanno per OGNI combinazione) — comeleapi: zero.
2. **Recensioni aggregate e visibili** — comeleapi: zero.
3. **Prezzi completi e citabili** (Cronoshare pubblica i range; ilmassaggioadomicilio i listini) — comeleapi: 4 prezzi su 7 nello schema, il resto solo in una FAQ.
4. **Descrizioni servizio approfondite** (ilmassaggioadomicilio: 200+ parole a servizio con benefici e indicazioni) — comeleapi: descrizioni solo nello schema, invisibili.
5. **Prenotazione online** (ShapeMe, Miodottore, Calendly su ilmassaggioadomicilio) — comeleapi: solo WhatsApp/telefono. Non necessariamente un difetto per un'attività individuale, ma da valutare.

### 6.3 Dove comeleapi è già superiore

- **Dati strutturati**: nessuno dei concorrenti verificati ha un grafo JSON-LD paragonabile (ilmassaggioadomicilio è un WordPress/Elementor standard).
- **Igiene tecnica**: performance di base, sicurezza, robots per AI crawler.
- **Onestà commerciale**: niente promo scadute, niente prezzi barrati fittizi.

### 6.4 Spazi non occupati (differenziazione, non imitazione)

1. **"Massaggio a domicilio a [Bresso/Cusano/Cormano/Cinisello]" come professionista locale identificabile**: i marketplace hanno pagine-template, nessuna persona reale. Una pagina zona con Sara, i tempi di arrivo reali, le vie servite, batte il template sul piano dell'esperienza e dell'E-E-A-T.
2. **Massaggio + aromaterapia Young Living**: nessun concorrente combina i due temi. Contenuti "quale olio essenziale per il massaggio decontratturante" non hanno concorrenza locale e sono perfetti per le citazioni AI.
3. **Trasparenza prezzi totale**: pubblicare il listino completo (visibile + schema + FAQ coerenti) mentre ProntoPro nasconde tutto dietro "richiedi preventivo".
4. **Il pubblico femminile di Milano Nord**: ilmassaggioadomicilio dichiara "servizio solo per donne" ma solo su Milano città; il posizionamento è replicabile/adattabile nella zona nord se coerente con l'attività reale.

---

## 7. Tabella delle priorità

Legenda sforzo: 🟢 ore · 🟡 giorni · 🔴 settimane. Impatto atteso: su visibilità organica+AI.

| Pri | Intervento | Riferimento | Gravità | Urgenza | Sforzo | Impatto | Classe |
|---|---|---|---|---|---|---|---|
| 1 | Aprire GBP come Service Area Business + prime 10 recensioni | Strategia §3.2 | Alta | Alta | 🟢/🟡 | ★★★★★ | Punto di svolta |
| 2 | Normalizzare NAP (nome canonico + telefono formato unico) ovunque | P8 — index.html L1780, structured-data.mjs L95/L188, app.js L1017 | Media | **Alta (prerequisito del #1)** | 🟢 | ★★★★ | Alto impatto/basso sforzo |
| 3 | Pagine statiche /privacy/ e /cookie-policy/ + P.IVA in footer | P6 — contenuto già in app.js L972-1032 | Alta (legale) | Alta | 🟢 | ★★★ | Importante |
| 4 | Descrizioni servizi visibili nelle card | P4 — structured-data.mjs L20-67 → index.html | Media | Alta | 🟢 | ★★★★ | Alto impatto/basso sforzo |
| 5 | H1 con keyword primaria | P5 — index.html L1292 | Media | Alta | 🟢 | ★★★ | Alto impatto/basso sforzo |
| 6 | `<noscript>` per `.reveal` + skip-link | P9/P16 — styles.css L1569 | Media | Media | 🟢 | ★★ | Miglioramento |
| 7 | Offer per i 3 servizi senza prezzo + inLanguage uniforme + sameAs su Person | P10/P11/P12 — structured-data.mjs | Bassa | Media | 🟢 | ★★★ (GEO) | Alto impatto/basso sforzo |
| 8 | Redirect 301 host non canonici (workers.dev, www) | P13 — src/worker/index.mjs | Media | Media | 🟢 | ★★ | Miglioramento |
| 9 | Citazioni locali (PagineGialle, Bing Places, +lista strategia §5) | Fuori sito | Media | Media | 🟡 | ★★★★ | Importante |
| 10 | areaServed 6→15 comuni + menzioni nel testo | P7 — structured-data.mjs L11-18 + validator | Media | Media | 🟢/🟡 | ★★★ | Importante |
| 11 | Architettura multi-pagina: /servizi/×7 e /zone/×5 prioritarie | P1 — strategia §8 | **Alta** | Media | 🔴 | ★★★★★ | Complesso ma decisivo |
| 12 | Contenuto definizionale/informativo (FAQ estese, sezioni "che cos'è") | P15 | Media | Media | 🟡/🔴 | ★★★★ (GEO) | Strategico |
| 13 | Mostrare foto/credenziali/community nascoste + pagina chi-sono estesa | P14 | Media | Media | 🟡 | ★★★ | Importante |
| 14 | Testimonianze on-site → poi aggregateRating nello schema | §5.8 | Media | Bassa (dipende da #1) | 🟡 | ★★★★ | Strategico |
| 15 | nofollow su link WebNovis footer | P17 — index.html L1795 | Bassa | Bassa | 🟢 | ★ | Minore |

---

## 8. Interventi rapidi (quick wins — tutti realizzabili in 1-2 giorni complessivi)

1. **NAP canonico** (pri 2): decidere la forma ufficiale (proposta: nome visibile "comeleapi", `alternateName` "Come le api — Sara Bordenga"; telefono visibile "+39 388 163 9306", schema E.164 "+393881639306") e applicarla in `index.html` (footer L1780, FAQ), `structured-data.mjs` (FAQ_DEFINITIONS L95, Organization L182-202), modal privacy (`app.js` L1017). Verifica: grep di entrambe le varianti = zero incoerenze residue.
2. **Pagine policy + P.IVA** (pri 3): estrarre l'HTML già pronto dal modal in due pagine statiche servite da `dist/`, linkarle dal footer con URL reali (mantenendo il modal come progressive enhancement se si vuole), aggiungere P.IVA e denominazione nel footer di tutte le pagine e nelle pagine policy. Aggiornare sitemap. Verifica: `curl https://comeleapi.it/privacy/` restituisce 200 con contenuto completo senza JS.
3. **Card servizi con descrizione visibile** (pri 4): riusare le `description` di `SERVICE_DEFINITIONS`; idealmente far generare le card dalla stessa fonte in build (pattern già usato per le FAQ). Verifica: le descrizioni compaiono nel sorgente HTML e `npm run check` passa.
4. **H1** (pri 5): es. `<h1>Massaggi a domicilio a Bresso e Milano Nord</h1>` + sottotitolo "Vola verso il tuo benessere". Verifica: un solo H1, keyword primaria presente, title invariato.
5. **Schema** (pri 7): 3 Offer aggiuntive coerenti con la FAQ prezzi; `inLanguage:"it-IT"` uniforme (o piano hreflang reale); `sameAs` su Person verso Instagram/Facebook. Aggiornare i conteggi attesi in `check-structured-data.mjs`. Verifica: Rich Results Test senza errori + validator verde.
6. **Resilienza no-JS** (pri 6): blocco `<noscript>` che azzera `.reveal`; skip-link "Salta al contenuto" come primo elemento del body. Verifica: pagina completa con JS disabilitato; tab dalla barra indirizzi raggiunge subito il main.
7. **Host canonici** (pri 8): nel Worker, se `url.hostname` ≠ "comeleapi.it" → 301 verso l'equivalente canonico. Verifica: `curl -I` su workers.dev e www.
8. **nofollow WebNovis** (pri 15): un attributo. Verifica: ispezione sorgente.

---

## 9. Interventi strategici

### 9.1 Presenza locale fuori dal sito (il vero punto di svolta)
- **GBP Service Area Business** con le aree della strategia, categoria "Massaggiatore", servizi con prezzi allineati al sito, foto reali, senza indirizzo esposto (coerente con `publicAccess:false` dello schema). Poi routine di richiesta recensioni post-trattamento (WhatsApp con link diretto). Obiettivo 90 giorni: 10-15 recensioni ≥4,8.
- **Citazioni** dalla lista §5 della strategia, create SOLO dopo la normalizzazione NAP, tutte identiche.
- Beneficio atteso: ingresso nel Map Pack per "massaggio a domicilio + [comune]" — traffico a intento massimo oggi interamente ceduto ai marketplace.

### 9.2 Architettura multi-pagina (complesso ma decisivo)
- Fase A: 7 pagine `/servizi/<slug>/` (contenuto: descrizione estesa, benefici, per chi è/non è, svolgimento della seduta a domicilio, prezzo, FAQ specifiche ×3-5, Service+FAQPage schema dedicati, link incrociati).
- Fase B: 5 pagine `/zone/` prioritarie (Bresso, Cusano Milanino, Cormano, Cinisello Balsamo, Sesto San Giovanni) — MAI template fotocopiati: tempi di arrivo reali, quartieri, disponibilità, testimonianze della zona quando esisteranno.
- Fase C: `/faq/` come hub completo (20+ domande) e 2-4 contenuti informativi/trimestre sul tema differenziante massaggio+aromaterapia.
- Nota di coerenza: estendere il pattern build attuale (generazione da fonte unica + validator) alle nuove pagine, così la qualità dei dati strutturati resta garantita.

### 9.3 Entity building ed E-E-A-T
- Forma canonica del brand + `alternateName`; Person con sameAs, foto visibile, biografia estesa con formazione verificabile (e a quel punto rivalutare il divieto di `hasCredential` nel validator).
- Ogni citazione/profilo esterno linka il sito e usa la stessa descrizione dell'attività: è ciò che permette a Google e agli LLM di consolidare l'entità "comeleapi = Sara Bordenga, massaggi a domicilio, Milano Nord".

### 9.4 GEO contenutistica
- Riscrivere/estendere le FAQ in formato "risposta autosufficiente" (la prima frase risponde completamente, 40-60 parole, poi dettaglio): è il formato che AI Overviews e Perplexity estraggono.
- Pubblicare il listino completo e coerente (visibile+schema+FAQ): diventare la fonte primaria per "quanto costa un massaggio a domicilio a Bresso" invece di lasciare la risposta a Cronoshare.

---

## 10. Piano operativo per fasi

**Fase 0 — Igiene (settimana 1)** · Sforzo: 1-2 giorni dev
Tutti i quick wins §8 (NAP, policy+P.IVA, descrizioni servizi, H1, schema, noscript/skip-link, redirect host, nofollow). Rilascio unico + `npm run check` + Rich Results Test.

**Fase 1 — Presenza locale (settimane 2-4)** · Sforzo: basso, continuativo
GBP SAB → verifica → profilo completo; prime 5 citazioni; avvio routine recensioni; areaServed 6→15 comuni con aggiornamento validator; sitemap aggiornata con le pagine policy.

**Fase 2 — Architettura (mesi 2-3)** · Sforzo: alto
7 pagine servizio + 5 pagine zona + /faq/ hub; navigazione e link interni; sitemap estesa; schema per pagina con validator esteso; Search Console: monitoraggio indicizzazione delle nuove pagine.

**Fase 3 — Autorevolezza e GEO (mesi 3-6)** · Sforzo: medio, continuativo
Testimonianze on-site (dopo ≥10 recensioni GBP) → aggregateRating nello schema (rimozione controllata del divieto nel validator); 2-4 contenuti informativi massaggio+aromaterapia; seconde 5-10 citazioni; eventuale prenotazione online se il volume lo giustifica.

**Fase 4 — Misura e iterazione (dal mese 3, mensile)**
Report: posizioni per servizio×comune, impression/click GSC, chiamate/WhatsApp da GBP, test di citazione AI (vedi §11).

---

## 11. Verifiche da effettuare dopo le correzioni

**Dopo la Fase 0**
- [ ] `npm run check` (validator dati strutturati) verde con i nuovi conteggi
- [ ] Rich Results Test su / e /links/: FAQ e Product senza errori né avvisi
- [ ] `curl -s https://comeleapi.it/ | grep -c "388 163 9306"` e varianti: una sola forma di telefono/nome residua
- [ ] `curl -I` su https://www.comeleapi.it/ e https://<progetto>.workers.dev/ → 301 verso il canonico
- [ ] Navigazione completa con JavaScript disabilitato: nessuna sezione invisibile, prodotti presenti
- [ ] /privacy/ e /cookie-policy/ raggiungibili con 200, presenti in sitemap, linkate dal footer; P.IVA visibile in footer
- [ ] Lighthouse mobile: Performance ≥90, Accessibility ≥95 (skip-link rilevato)

**Dopo la Fase 1**
- [ ] GBP verificato e "attivo"; ricerca del brand → knowledge panel locale presente
- [ ] Ricerca "massaggi a domicilio bresso": posizione organica e presenza/assenza nel Map Pack (baseline e a +30/+60/+90 giorni)
- [ ] Le 5 citazioni pubblicate mostrano NAP identico (verifica manuale)
- [ ] Rich Results Test: 15 City in areaServed senza errori

**Dopo la Fase 2**
- [ ] GSC → Copertura: tutte le nuove pagine "Indicizzata"; nessuna "Scansionata, attualmente non indicizzata" persistente oltre 4 settimane (se sì: il contenuto zona è troppo simile → differenziare)
- [ ] Ogni pagina servizio posizionata top-20 per "[servizio] a domicilio [comune primario]" entro 90 giorni
- [ ] Click interni dalle card della home alle pagine servizio (GA/analytics)

**Verifiche GEO (trimestrali, sempre)**
- [ ] Chiedere a ChatGPT (con browsing), Perplexity, Gemini e Claude: "massaggio a domicilio a Bresso", "quanto costa un massaggio decontratturante a domicilio a Milano Nord", "chi fa massaggi con oli essenziali Young Living vicino a Cusano Milanino" → registrare se comeleapi viene citato, con quale descrizione e quale fonte
- [ ] Verificare nei log del Worker/Cloudflare gli accessi di GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot (conferma che l'apertura del robots.txt viene usata)
- [ ] Google: `site:comeleapi.it` → numero pagine indicizzate coerente con la sitemap; ricerca del brand → il sito domina i primi risultati

**Guardrail permanenti**
- [ ] Mai aggiungere aggregateRating senza recensioni pubbliche verificabili (il validator oggi lo impedisce: rimuovere il divieto solo contestualmente alla pubblicazione delle testimonianze reali)
- [ ] Ogni nuova pagina passa dal pattern fonte-unica + validator prima del rilascio
- [ ] Ogni nuova citazione esterna usa il NAP canonico deciso in Fase 0

---

*Fine dell'audit. Documento generato da 6 aree di analisi indipendenti (tecnica, contenuti, dati strutturati, performance/accessibilità, locale+GEO, sicurezza/fiducia) con riconciliazione delle conclusioni discordanti in §5.11 e ricerca concorrenti verificata su SERP reali in §6.*
