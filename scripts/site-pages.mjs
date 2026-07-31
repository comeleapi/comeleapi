// Generatore delle sottopagine statiche del sito pubblico (architettura
// multipagina): hub /zone/ con le pagine locali, hub /servizi/ con le pagine
// dei trattamenti, pagina /faq/ dedicata alle domande frequenti e informative
// legali (/privacy/, /cookie-policy/, /termini/).
//
// Principi:
//  - unica fonte di verità: AREA_DEFINITIONS, SERVICE_DEFINITIONS e
//    FAQ_DEFINITIONS condivise con i dati strutturati della home
//    (scripts/structured-data.mjs);
//  - stessa identità visiva della landing: styles.css, font, icone e classi
//    esistenti (.site-header, .section, .service-card, .faq-item, .footer);
//  - nessuno script inline (CSP require-trusted-types-for): l'interattività
//    minima (menu mobile, anno footer) vive in assets/js/pages.js;
//  - asset referenziati root-relative e versionati via versionedAsset(), dato
//    che /assets/* è servito con cache immutable;
//  - le informative sono navigabili ma noindex e fuori dalla sitemap (nessun
//    valore strategico di posizionamento).
import { AREA_DEFINITIONS, SERVICE_DEFINITIONS, FAQ_DEFINITIONS } from "./structured-data.mjs";
import { escapeHtml, buildFaqHtml } from "./html-inject.mjs";

const SITE_URL = "https://comeleapi.it/";
const ORGANIZATION_ID = `${SITE_URL}#organization`;
const CONTACT_EMAIL = "sara.bordenga@gmail.com";
const PHONE_DISPLAY = "+39 388 163 9306";
const PHONE_E164 = "393881639306";
const OG_IMAGE = `${SITE_URL}assets/img/hero/hero-massaggio-professionale-comeleapi.webp`;

// Le pagine sono generate da questi sorgenti: la sitemap usa i loro mtime.
export const SUBPAGE_SOURCE_FILES = ["scripts/site-pages.mjs", "scripts/structured-data.mjs"];

function whatsAppUrl(message) {
  return `https://wa.me/${PHONE_E164}?text=${encodeURIComponent(message)}`;
}

// Prezzo visibile per ogni servizio: rispecchia le card della home e la FAQ.
const SERVICE_VISIBLE_PRICES = {
  "massaggio-sportivo": "50 €",
  "massaggio-decontratturante": "50 €",
  "massaggio-relax": "40 €",
  "massaggio-drenante": "50 €",
  "trattamento-mirato-30-minuti": "30 €",
  "kinesio-taping": "10 €",
  "massaggio-oli-essenziali": "70 €"
};

// Classe icona per servizio: stessa mappa delle card in index.html.
const SERVICE_ICON_CLASSES = {
  "massaggio-sportivo": "service-ic--sport",
  "massaggio-decontratturante": "service-ic--body",
  "massaggio-relax": "service-ic--calm",
  "massaggio-drenante": "service-ic--lymph",
  "trattamento-mirato-30-minuti": "service-ic--short",
  "kinesio-taping": "service-ic--tape",
  "massaggio-oli-essenziali": "service-ic--oil"
};

const PRICES_SENTENCE =
  "I prezzi sono gli stessi in tutte le zone servite: massaggio sportivo, decontratturante e drenante 50 €, " +
  "massaggio relax 40 €, trattamento mirato da 30 minuti 30 €, kinesio taping 10 € e massaggio con oli essenziali 70 €.";

// ─── Contenuti per città ────────────────────────────────────────────────────
// Ogni città ha un taglio editoriale proprio — persona, trattamenti in evidenza,
// riferimenti locali reali (quartieri, parchi, stazioni) — per evitare
// sovrapposizioni tra le pagine e rafforzare i segnali di geolocalizzazione.
const CITY_CONTENT = {
  bresso: {
    title: "Massaggi a domicilio a Bresso — la base operativa di comeleapi",
    description:
      "comeleapi nasce a Bresso: massaggi esclusivamente a domicilio dal centro alle vie lungo il Parco Nord, con la massima flessibilità di date. Prenotazione diretta su WhatsApp.",
    h2: "Massaggiatrice a domicilio a Bresso: la base operativa",
    tagline: "La base operativa del servizio",
    imageCaption: "Massaggi a domicilio a Bresso, base operativa di comeleapi, dal centro al Parco Nord",
    sameAs: "https://it.wikipedia.org/wiki/Bresso",
    intro: [
      "Bresso non è solo una delle zone servite: è la base operativa da cui parte ogni trattamento comeleapi. Per chi abita qui significa tragitti ridotti al minimo e più facilità nel trovare la data giusta.",
      "Lettino professionale, teli e oli viaggiano con me: tu scegli solo la stanza più tranquilla, che tu sia in centro, verso l'aeroporto o nelle vie affacciate sul Parco Nord Milano."
    ],
    local: [
      "Copertura totale del territorio comunale: centro, zona municipio, quadrante dell'aeroporto e vie residenziali lungo il Parco Nord.",
      "Essendo la base del servizio, Bresso è la zona con più margine per appuntamenti ravvicinati o riprogrammati.",
      "Ideale al rientro da una camminata o una corsa al Parco Nord: il trattamento ti aspetta direttamente a casa."
    ],
    faq: [
      {
        q: "Copri davvero tutta Bresso?",
        a: "Sì: il comune è compatto e lo copro per intero, dal centro alla zona dell'aeroporto fino alle vie lungo il Parco Nord. Bresso è la base operativa di comeleapi, nessuna via è fuori portata."
      },
      {
        q: "Quanto costa un massaggio a domicilio a Bresso?",
        a: `Essere la base operativa non cambia il listino. ${PRICES_SENTENCE}`
      },
      {
        q: "Quanto è facile trovare una data a Bresso?",
        a: `È la zona con la maggiore disponibilità: scrivimi su WhatsApp al ${PHONE_DISPLAY} e ti propongo le prime date utili.`
      },
      {
        q: "Devo preparare qualcosa per la seduta?",
        a: "No: arrivo con tutta l'attrezzatura e mi organizzo in autonomia. Ti chiedo solo un ambiente tranquillo con lo spazio per aprire il lettino."
      }
    ]
  },
  "cusano-milanino": {
    title: "Massaggi a domicilio a Cusano Milanino, la città giardino — comeleapi",
    description:
      "Massaggio relax, drenante o con oli essenziali tra i viali della città giardino: a Cusano Milanino il trattamento arriva a casa tua, dal Milanino al centro di Cusano.",
    h2: "Massaggiatrice a domicilio nella città giardino",
    tagline: "La città giardino, al confine con Bresso",
    imageCaption: "Massaggio relax e trattamenti a domicilio a Cusano Milanino, la città giardino",
    sameAs: "https://it.wikipedia.org/wiki/Cusano_Milanino",
    intro: [
      "Il Milanino è nato più di un secolo fa come città giardino, progettata attorno al benessere di chi la abita: ricevere un massaggio tra i suoi viali alberati, senza nemmeno uscire di casa, è il modo più naturale di viverla.",
      "Da Bresso, che confina direttamente con Cusano, raggiungo tutto il comune in pochi minuti: è una delle zone in cui posso offrire la maggiore flessibilità di giorni e orari."
    ],
    local: [
      "Servizio attivo su tutto il comune: il quartiere giardino del Milanino, il centro storico di Cusano e le vie verso il Parco Grugnotorto.",
      "Il confine diretto con la base di Bresso rende semplici anche gli appuntamenti ricorrenti.",
      "La quiete della città giardino è la cornice ideale per il massaggio relax e per il massaggio con oli essenziali Young Living."
    ],
    faq: [
      {
        q: "Arrivi sia al Milanino sia a Cusano centro?",
        a: "Sì, copro l'intero comune: il quartiere giardino del Milanino, il centro di Cusano e le zone verso il Parco Grugnotorto, senza differenze di tempi o condizioni."
      },
      {
        q: "Il listino a Cusano Milanino è diverso da quello di Bresso?",
        a: `No, il prezzo non dipende dal comune. ${PRICES_SENTENCE}`
      },
      {
        q: "Quale trattamento scegliere per staccare davvero?",
        a: "Il massaggio relax da 50 minuti è pensato per rallentare; se ami i profumi, il massaggio con oli essenziali Young Living aggiunge la dimensione aromatica. Ti aiuto a scegliere su WhatsApp."
      },
      {
        q: "Come prenoto da Cusano Milanino?",
        a: `Scrivi su WhatsApp al ${PHONE_DISPLAY} indicando trattamento e zona — Milanino o Cusano centro — e fissiamo insieme la data.`
      }
    ]
  },
  cormano: {
    title: "Massaggi a domicilio a Cormano, Brusuglio e Ospitaletto — comeleapi",
    description:
      "Massaggi a domicilio in tutta Cormano, comprese Brusuglio e Ospitaletto: lettino, teli e oli li porto io. A pochi minuti da Bresso, si prenota con un messaggio WhatsApp.",
    h2: "Massaggiatrice a domicilio a Cormano: un servizio, tre borghi",
    tagline: "Con Brusuglio e Ospitaletto",
    imageCaption: "Massaggi a domicilio a Cormano, Brusuglio e Ospitaletto con Sara Bordenga",
    sameAs: "https://it.wikipedia.org/wiki/Cormano",
    intro: [
      "Cormano è fatta di tre anime — Cormano centro, Brusuglio e Ospitaletto — e il servizio a domicilio le copre tutte, alle stesse condizioni.",
      "Dalla base di Bresso bastano pochi minuti: per chi passa la giornata tra lavoro e tragitti, il massaggio a casa toglie di mezzo l'ennesimo spostamento."
    ],
    local: [
      "Raggiungo Cormano centro, il borgo di Brusuglio — noto per la villa che fu di Alessandro Manzoni — e Ospitaletto.",
      "Comodo per chi pendola da e per Milano dalla stazione di Cormano-Cusano Milanino: l'appuntamento si costruisce sui tuoi rientri.",
      "La distanza minima da Bresso lascia buona flessibilità per sedute singole o ricorrenti."
    ],
    faq: [
      {
        q: "Vieni a domicilio anche a Brusuglio e Ospitaletto?",
        a: "Sì: le frazioni fanno parte del servizio esattamente come Cormano centro. Indicami la via nel messaggio e ti confermo la disponibilità."
      },
      {
        q: "C'è un sovrapprezzo per le frazioni di Cormano?",
        a: `No, nessun sovrapprezzo. ${PRICES_SENTENCE}`
      },
      {
        q: "Rientro con orari variabili: come ci organizziamo?",
        a: "L'appuntamento si concorda direttamente su WhatsApp, senza segreteria: mi scrivi le tue finestre libere e costruiamo la seduta intorno ai tuoi orari."
      },
      {
        q: "Quale trattamento consigli dopo giornate tra scrivania e treno?",
        a: "Il massaggio decontratturante da 50 minuti lavora su collo, spalle e schiena; se il tempo è poco, il trattamento mirato da 30 minuti si concentra su un'unica zona."
      }
    ]
  },
  "cinisello-balsamo": {
    title: "Massaggi a domicilio a Cinisello Balsamo, anche sportivi — comeleapi",
    description:
      "Dopo la palestra o la corsa al Parco Nord, il recupero ti aspetta a casa: massaggi a domicilio in tutta Cinisello Balsamo, dalla Crocetta a Sant'Eusebio. Prenoti su WhatsApp.",
    h2: "Massaggiatrice a domicilio a Cinisello Balsamo: sport e recupero",
    tagline: "Sport e recupero, dal Parco Nord a casa",
    imageCaption: "Massaggio sportivo e trattamenti a domicilio in tutti i quartieri di Cinisello Balsamo",
    sameAs: "https://it.wikipedia.org/wiki/Cinisello_Balsamo",
    intro: [
      "Cinisello Balsamo è la città più grande tra quelle servite e una delle più attive: tra le palestre cittadine e i percorsi del Parco Nord, chi si allena qui non manca di occasioni — né di muscoli da far recuperare.",
      "Il servizio è esclusivamente a domicilio: arrivo da Bresso con lettino, teli e oli, e il recupero comincia nel tuo salotto, da Balsamo alla Crocetta."
    ],
    local: [
      "Copertura completa dei quartieri: Cinisello centro, Balsamo, Crocetta, Sant'Eusebio e le vie intorno a Villa Ghirlanda Silva.",
      "Il dopo-allenamento è il momento tipico: massaggio sportivo, drenante e applicazione di kinesio taping senza muoverti da casa.",
      "Bresso è a un confine di distanza: tempi di arrivo contenuti e buona scelta di date."
    ],
    faq: [
      {
        q: "Fai massaggi sportivi a domicilio a Cinisello Balsamo?",
        a: "Sì, è uno dei trattamenti più indicati per chi si allena: 50 minuti dedicati a preparazione o recupero muscolare, con l'esperienza di un'ex atleta. Su richiesta aggiungo l'applicazione di kinesio taping."
      },
      {
        q: "Copri anche Crocetta e Sant'Eusebio?",
        a: "Sì: il servizio copre tutti i quartieri di Cinisello Balsamo, comprese Crocetta, Sant'Eusebio e la zona di Villa Ghirlanda. Nessuna via è esclusa."
      },
      {
        q: "Quanto costa un massaggio a domicilio a Cinisello Balsamo?",
        a: `Il domicilio non aggiunge costi. ${PRICES_SENTENCE}`
      },
      {
        q: "Posso organizzare la seduta in base a gare e allenamenti?",
        a: "Sì: scrivimi appena conosci il calendario e concordiamo la data su WhatsApp. Possiamo valutare anche il massaggio sportivo di preparazione prima dell'impegno."
      }
    ]
  },
  "sesto-san-giovanni": {
    title: "Massaggi a domicilio a Sesto San Giovanni, sui tuoi orari — comeleapi",
    description:
      "A Sesto San Giovanni il massaggio arriva a casa, dal Rondò a Cascina Gatti: decontratturante, relax o trattamento mirato da 30 minuti. L'appuntamento si costruisce sui tuoi orari.",
    h2: "Massaggiatrice a domicilio a Sesto San Giovanni, sui tuoi orari",
    tagline: "Dal Rondò a Cascina Gatti",
    imageCaption: "Massaggi a domicilio a Sesto San Giovanni, dal Rondò a Cascina Gatti",
    sameAs: "https://it.wikipedia.org/wiki/Sesto_San_Giovanni",
    intro: [
      "Sesto San Giovanni è una città che non si ferma, tra uffici, la trasformazione delle ex aree Falck e migliaia di persone in movimento ogni giorno lungo la MM1. Il massaggio a domicilio è pensato per chi, a fine giornata, non vuole rimettersi in coda.",
      "Arrivo io con lettino professionale, teli e oli: dal Rondò a Cascina Gatti, la seduta si svolge nella stanza più tranquilla di casa tua."
    ],
    local: [
      "Servizio attivo in tutti i quartieri: Rondò, Marelli, Rondinella, Cascina Gatti, Pelucca e le zone vicine alle ex aree Falck.",
      "Per chi passa molte ore alla scrivania: massaggio decontratturante da 50 minuti o trattamento mirato da 30, concentrato su collo e spalle.",
      "Da Bresso raggiungo Sesto costeggiando il Parco Nord: distanze contenute e appuntamenti concordati sui tuoi impegni."
    ],
    faq: [
      {
        q: "Copri tutti i quartieri di Sesto San Giovanni?",
        a: "Sì: Rondò, Marelli, Rondinella, Cascina Gatti, Pelucca e ogni altra via del comune. Scrivimi la tua zona e ti confermo la prima data disponibile."
      },
      {
        q: "Lavoro tutto il giorno: riusciamo comunque a organizzarci?",
        a: "Sì: l'appuntamento si concorda direttamente su WhatsApp, senza vincoli di segreteria. Dimmi quando sei a casa e troviamo l'incastro giusto."
      },
      {
        q: "Sesto è più lontana da Bresso: il prezzo cambia?",
        a: `No, la distanza non incide sul listino. ${PRICES_SENTENCE}`
      },
      {
        q: "Meglio massaggio decontratturante o trattamento mirato?",
        a: "Dipende da tempo e zone di tensione: il decontratturante lavora in profondità per 50 minuti, il mirato concentra 30 minuti su un'unica area, come cervicale o schiena. Ti aiuto a scegliere su WhatsApp."
      }
    ]
  },
  milano: {
    title: "Massaggi a domicilio a Milano: Niguarda, Bicocca, Affori e tutta la città — comeleapi",
    description:
      "Massaggi a domicilio a Milano con Sara Bordenga: servizio attivo in tutta la città, con copertura più rapida nei quartieri nord — Niguarda, Bicocca, Affori e Bruzzano. Prenotazione su WhatsApp.",
    h2: "Massaggiatrice a domicilio a Milano, dal centro ai quartieri nord",
    tagline: "Tutta la città, dai quartieri nord al centro",
    imageCaption: "Massaggi a domicilio a Milano: Niguarda, Bicocca, Affori e tutta la città",
    sameAs: "https://it.wikipedia.org/wiki/Milano",
    intro: [
      "Milano è pienamente tra le zone servite da comeleapi: il servizio è attivo in tutta la città, con copertura più rapida nei quartieri della zona nord — Niguarda, Ca' Granda, Bicocca, Affori e Bruzzano — raggiungibili in pochi minuti dalla base operativa di Bresso.",
      "Che tu viva in centro, studi o lavori al campus Bicocca o abiti nelle vie di Niguarda e Affori, la sostanza non cambia: il trattamento arriva a casa tua e la città resta fuori dalla porta."
    ],
    local: [
      "Copertura più immediata: Niguarda, Ca' Granda, Bicocca — zona università e Hangar — Affori e Bruzzano.",
      "Comodo anche per chi abita vicino alle fermate MM3 di Affori e Comasina o alla MM5 tra Bignami e Ponale.",
      "Per gli altri quartieri di Milano la disponibilità è ampia e viene confermata in base a distanza e trattamento: scrivimi la tua zona su WhatsApp."
    ],
    faq: [
      {
        q: "Quali quartieri di Milano copri a domicilio?",
        a: "Tutta la città è tra le zone servite: la copertura più rapida riguarda i quartieri nord — Niguarda, Ca' Granda, Bicocca, Affori e Bruzzano — mentre per gli altri quartieri confermo la disponibilità su WhatsApp in base a distanza e trattamento."
      },
      {
        q: "Abito in zona Bicocca: con quanto anticipo devo scriverti?",
        a: `Non c'è un anticipo minimo: scrivimi su WhatsApp al ${PHONE_DISPLAY} e ti propongo le prime date compatibili con la tua zona.`
      },
      {
        q: "Venire fino a Milano costa di più?",
        a: `No. ${PRICES_SENTENCE}`
      },
      {
        q: "Il mio quartiere non è tra quelli elencati: ha senso scriverti?",
        a: "Sì, sempre: indicami quartiere e trattamento desiderato e ti dico subito, senza impegno, se riesco a raggiungerti."
      }
    ]
  }
};

// ─── Contenuti per servizio ─────────────────────────────────────────────────
const SERVICE_CONTENT = {
  "massaggio-sportivo": {
    duration: "50 minuti",
    intro: [
      "Il massaggio sportivo è pensato per chi si allena con costanza e vuole prendersi cura della propria muscolatura: prima dell'attività per preparare i tessuti, dopo per favorire il recupero.",
      "Sara è massaggiatrice sportiva ed ex atleta: conosce da vicino le esigenze di chi fa sport e personalizza ogni seduta su carico di lavoro e obiettivi."
    ],
    forWho: [
      "Chi pratica sport con regolarità, a livello amatoriale o agonistico",
      "Chi vuole preparare la muscolatura prima di una gara o di un allenamento intenso",
      "Chi cerca un supporto al recupero dopo lo sforzo"
    ],
    faq: [
      {
        q: "Quanto dura e quanto costa il massaggio sportivo?",
        a: "La seduta ha una durata dichiarata di 50 minuti e costa 50 €, in tutte le zone servite."
      },
      {
        q: "Serve attrezzatura da parte mia?",
        a: "No: porto io lettino professionale, teli e oli. Ti basta scegliere un ambiente tranquillo della casa."
      },
      {
        q: "Dove è disponibile il massaggio sportivo a domicilio?",
        a: "A Milano, Bresso, Cusano Milanino, Cormano, Cinisello Balsamo, Sesto San Giovanni e nelle zone limitrofe."
      }
    ]
  },
  "massaggio-decontratturante": {
    duration: "50 minuti",
    intro: [
      "Il massaggio decontratturante lavora sulle zone in cui accumuli più tensione — spesso collo, spalle e schiena — con manualità mirate e profonde.",
      "È il trattamento scelto da chi passa molte ore alla scrivania o in piedi e sente il bisogno di sciogliere le rigidità della routine quotidiana."
    ],
    forWho: [
      "Chi accumula tensioni muscolari per lavoro o postura",
      "Chi sente rigidità localizzate a collo, spalle o schiena",
      "Chi desidera un lavoro profondo e mirato sulla muscolatura"
    ],
    faq: [
      {
        q: "Quanto dura e quanto costa il massaggio decontratturante?",
        a: "La seduta ha una durata dichiarata di 50 minuti e costa 50 €, in tutte le zone servite."
      },
      {
        q: "Il trattamento è personalizzato?",
        a: "Sì: prima della seduta parliamo delle zone in cui senti più tensione e il lavoro viene calibrato sulle tue esigenze."
      },
      {
        q: "Dove è disponibile il massaggio decontratturante a domicilio?",
        a: "A Milano, Bresso, Cusano Milanino, Cormano, Cinisello Balsamo, Sesto San Giovanni e nelle zone limitrofe."
      }
    ]
  },
  "massaggio-relax": {
    duration: "50 minuti",
    intro: [
      "Il massaggio relax è un momento tutto per te: manualità avvolgenti e ritmo lento per allentare lo stress e ritrovare calma e leggerezza.",
      "Riceverlo a casa propria amplifica l'effetto: nessuno spostamento prima, nessuna fretta dopo. Solo il tuo tempo."
    ],
    forWho: [
      "Chi attraversa periodi intensi e vuole rallentare",
      "Chi fatica a staccare la mente e cerca un momento di quiete",
      "Chi si avvicina per la prima volta al massaggio"
    ],
    faq: [
      {
        q: "Quanto dura e quanto costa il massaggio relax?",
        a: "La seduta ha una durata dichiarata di 50 minuti e costa 40 €, in tutte le zone servite."
      },
      {
        q: "Come preparo la casa per il massaggio relax?",
        a: "Basta una stanza tranquilla: al lettino, ai teli e agli oli penso io. Se vuoi, puoi aggiungere luce soffusa e la tua musica preferita."
      },
      {
        q: "Dove è disponibile il massaggio relax a domicilio?",
        a: "A Milano, Bresso, Cusano Milanino, Cormano, Cinisello Balsamo, Sesto San Giovanni e nelle zone limitrofe."
      }
    ]
  },
  "massaggio-drenante": {
    duration: "50 minuti",
    intro: [
      "Il massaggio drenante utilizza manualità dolci e ritmate che accompagnano la naturale circolazione dei liquidi, per una piacevole sensazione di leggerezza.",
      "È particolarmente apprezzato da chi passa molte ore in piedi o seduto e sente gambe stanche a fine giornata."
    ],
    forWho: [
      "Chi avverte gambe stanche o pesanti a fine giornata",
      "Chi passa molte ore in piedi o alla scrivania",
      "Chi cerca una sensazione di leggerezza e benessere diffuso"
    ],
    faq: [
      {
        q: "Quanto dura e quanto costa il massaggio drenante?",
        a: "La seduta ha una durata dichiarata di 50 minuti e costa 50 €, in tutte le zone servite."
      },
      {
        q: "Con quale frequenza si riceve il massaggio drenante?",
        a: "Dipende dalle tue esigenze: ne parliamo insieme al primo contatto e definiamo il percorso più adatto a te."
      },
      {
        q: "Dove è disponibile il massaggio drenante a domicilio?",
        a: "A Milano, Bresso, Cusano Milanino, Cormano, Cinisello Balsamo, Sesto San Giovanni e nelle zone limitrofe."
      }
    ]
  },
  "trattamento-mirato-30-minuti": {
    duration: "30 minuti",
    intro: [
      "Il trattamento mirato da 30 minuti concentra il lavoro su una sola zona — ad esempio cervicale, schiena o gambe — quando il tempo è poco ma il bisogno è chiaro.",
      "È la formula ideale per chi vuole un intervento rapido e specifico, anche in pausa pranzo o a fine giornata."
    ],
    forWho: [
      "Chi ha una zona specifica da trattare",
      "Chi ha poco tempo ma non vuole rinunciare al benessere",
      "Chi vuole provare il servizio a domicilio con una seduta breve"
    ],
    faq: [
      {
        q: "Quanto dura e quanto costa il trattamento mirato?",
        a: "La seduta dura 30 minuti e costa 30 €, in tutte le zone servite."
      },
      {
        q: "Quali zone si possono trattare in 30 minuti?",
        a: "Una zona a scelta: ad esempio cervicale e spalle, schiena o gambe. La definiamo insieme al momento della prenotazione."
      },
      {
        q: "Dove è disponibile il trattamento mirato a domicilio?",
        a: "A Milano, Bresso, Cusano Milanino, Cormano, Cinisello Balsamo, Sesto San Giovanni e nelle zone limitrofe."
      }
    ]
  },
  "kinesio-taping": {
    duration: "applicazione",
    intro: [
      "Il kinesio taping è l'applicazione di nastri elastici sulla pelle, molto diffusa in ambito sportivo come supporto alla muscolatura durante il movimento.",
      "Viene spesso richiesto a completamento di un massaggio sportivo o decontratturante, ma può essere prenotato anche come applicazione singola."
    ],
    forWho: [
      "Sportivi che vogliono un supporto durante allenamenti e gare",
      "Chi ha ricevuto un massaggio e vuole prolungarne il beneficio",
      "Chi desidera un'applicazione professionale del nastro"
    ],
    faq: [
      {
        q: "Quanto costa l'applicazione del kinesio taping?",
        a: "L'applicazione costa 10 €, in tutte le zone servite. Spesso viene abbinata a un massaggio sportivo o decontratturante."
      },
      {
        q: "Quanto resta in sede il nastro?",
        a: "Il nastro è pensato per restare sulla pelle alcuni giorni, anche sotto la doccia. Ti spiego io come gestirlo dopo l'applicazione."
      },
      {
        q: "Dove è disponibile il kinesio taping a domicilio?",
        a: "A Milano, Bresso, Cusano Milanino, Cormano, Cinisello Balsamo, Sesto San Giovanni e nelle zone limitrofe."
      }
    ]
  },
  "massaggio-oli-essenziali": {
    duration: "seduta completa",
    intro: [
      "Il massaggio con oli essenziali unisce le manualità del massaggio al profumo e alle proprietà degli oli essenziali Young Living, selezionati insieme prima della seduta.",
      "Un'esperienza sensoriale completa che coinvolge corpo e mente, nel comfort di casa tua."
    ],
    forWho: [
      "Chi ama l'aromaterapia e vuole viverla in un trattamento completo",
      "Chi cerca un'esperienza di benessere più avvolgente del massaggio classico",
      "Chi vuole scoprire gli oli essenziali con la guida di una rivenditrice indipendente Young Living"
    ],
    faq: [
      {
        q: "Quanto costa il massaggio con oli essenziali?",
        a: "La seduta costa 70 €, in tutte le zone servite. Gli oli essenziali utilizzati sono inclusi."
      },
      {
        q: "Posso scegliere gli oli essenziali?",
        a: "Sì: prima della seduta scegliamo insieme gli oli più adatti a te. Se vuoi approfondire, è disponibile anche la consulenza aromatica Signature Blend."
      },
      {
        q: "Dove è disponibile il massaggio con oli essenziali a domicilio?",
        a: "A Milano, Bresso, Cusano Milanino, Cormano, Cinisello Balsamo, Sesto San Giovanni e nelle zone limitrofe."
      }
    ]
  }
};

// ─── Helpers di markup ──────────────────────────────────────────────────────
function jsonLd(structuredData) {
  return JSON.stringify(structuredData, null, 2).replace(/</g, "\\u003c");
}

function faqSectionHtml(items, title = "Domande frequenti") {
  const details = items
    .map(
      (item) => `          <details class="faq-item">
            <summary class="faq-q">${escapeHtml(item.q)}</summary>
            <div class="faq-a"><p>${escapeHtml(item.a)}</p></div>
          </details>`
    )
    .join("\n");
  return `    <section class="section">
      <div class="container">
        <div class="section-head section-head--center">
          <span class="eyebrow">FAQ</span>
          <h2 class="section-title">${escapeHtml(title)}</h2>
        </div>
        <div class="faq-list">
${details}
        </div>
      </div>
    </section>`;
}

function ctaSectionHtml(message) {
  return `    <section class="section">
      <div class="container">
        <div class="section-head section-head--center">
          <span class="eyebrow">Contatto diretto</span>
          <h2 class="section-title">Prenota il tuo trattamento</h2>
          <p class="section-lead">Scrivimi su WhatsApp: ti rispondo con disponibilità, costi e dettagli in modo chiaro e riservato.</p>
        </div>
        <div class="subpage-cta">
          <a class="btn btn--primary" href="${escapeHtml(whatsAppUrl(message))}" target="_blank" rel="noopener">Scrivimi su WhatsApp</a>
        </div>
      </div>
    </section>`;
}

function breadcrumbsHtml(crumbs) {
  const items = crumbs
    .map((crumb, index) =>
      index === crumbs.length - 1
        ? `<li aria-current="page">${escapeHtml(crumb.name)}</li>`
        : `<li><a href="${escapeHtml(crumb.path)}">${escapeHtml(crumb.name)}</a></li>`
    )
    .join("\n            ");
  return `        <nav class="breadcrumbs" aria-label="Percorso di navigazione">
          <ol>
            ${items}
          </ol>
        </nav>`;
}

function breadcrumbNode(pageUrl, crumbs) {
  return {
    "@id": `${pageUrl}#breadcrumb`,
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: `${SITE_URL.replace(/\/$/, "")}${crumb.path}`
    }))
  };
}

function websiteNode() {
  return {
    "@id": `${SITE_URL}#website`,
    "@type": "WebSite",
    name: "comeleapi",
    url: SITE_URL,
    inLanguage: ["it-IT", "en"],
    publisher: { "@id": ORGANIZATION_ID }
  };
}

function organizationNodes() {
  return [
    {
      "@id": `${SITE_URL}#logo`,
      "@type": "ImageObject",
      url: `${SITE_URL}assets/img/logo-comeleapi-256.webp`,
      contentUrl: `${SITE_URL}assets/img/logo-comeleapi-256.webp`,
      width: 256,
      height: 256,
      caption: "Logo comeleapi"
    },
    {
      "@id": ORGANIZATION_ID,
      "@type": ["Organization", "LocalBusiness"],
      name: "comeleapi",
      url: SITE_URL,
      logo: { "@id": `${SITE_URL}#logo` },
      email: CONTACT_EMAIL,
      telephone: `+${PHONE_E164}`
    }
  ];
}

function faqPageNode(pageUrl, items, name) {
  return {
    "@id": `${pageUrl}#faq`,
    "@type": "FAQPage",
    name,
    url: pageUrl,
    inLanguage: "it-IT",
    isPartOf: { "@id": `${pageUrl}#webpage` },
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a }
    }))
  };
}

function inlineCities() {
  return AREA_DEFINITIONS.map(([, name]) => ({ "@type": "City", name }));
}

// ─── Shell di pagina (head + header + footer identici alla landing) ────────
function pageShell({ canonical, title, description, robots, structuredData, content, v }) {
  const robotsMeta = robots ? `\n  <meta name="robots" content="${robots}" />` : "";
  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta name="theme-color" content="#FEEEEF" />
  <link rel="canonical" href="${canonical}" />${robotsMeta}

  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:site_name" content="comeleapi" />
  <meta property="og:image" content="${OG_IMAGE}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${OG_IMAGE}" />

  <script id="structuredData" type="application/ld+json">
${jsonLd(structuredData)}
  </script>

  <link rel="preload" as="font" type="font/woff2" href="${v("assets/fonts/mulish-variable-latin.woff2")}" crossorigin />
  <link rel="preload" as="font" type="font/woff2" href="${v("assets/fonts/cormorant-garamond-variable-latin.woff2")}" crossorigin />
  <link rel="stylesheet" href="${v("assets/css/styles.css")}" />

  <link rel="icon" type="image/webp" sizes="96x96" href="${v("assets/img/logo-comeleapi-96.webp")}" />
  <link rel="apple-touch-icon" href="${v("assets/img/logo-comeleapi-256.png")}" />
</head>
<body class="subpage">
  <header class="site-header" id="siteHeader">
    <div class="container header-inner">
      <a href="/" class="brand" aria-label="comeleapi — home">
        <span class="brand-mark" aria-hidden="true">
          <img src="${v("assets/img/logo-comeleapi-256.webp")}" srcset="${v("assets/img/logo-comeleapi-96.webp")} 96w, ${v("assets/img/logo-comeleapi-256.webp")} 256w" sizes="(max-width: 600px) 40px, 48px" width="48" height="48" alt="" decoding="async" />
        </span>
        <span>comeleapi</span>
      </a>

      <nav class="nav" id="mainNav" aria-label="Navigazione principale">
        <a href="/#prodotti">Oli</a>
        <a href="/servizi/">Trattamenti</a>
        <a href="/#chi-sono">The founder</a>
        <a href="/zone/">Where</a>
        <a href="/faq/">Faq</a>
        <a href="${escapeHtml(whatsAppUrl("Ciao Sara, vorrei prenotare una consulenza."))}" class="btn btn--primary btn--sm nav-cta" target="_blank" rel="noopener">
          Scrivimi su WhatsApp
          <img class="btn-icon" src="${v("assets/img/icons/icon-whatsapp-custom.webp")}" width="18" height="18" alt="" loading="lazy" decoding="async" />
        </a>
      </nav>

      <button class="nav-toggle" id="navToggle" aria-label="Apri menu" aria-expanded="false" aria-controls="mainNav">
        <span></span><span></span><span></span>
      </button>
    </div>
  </header>

  <main id="top">
${content}
  </main>

  <footer class="footer" id="footer">
    <div class="container footer-grid">
      <div class="footer-brand">
        <a href="/" class="brand" aria-label="comeleapi — home">
          <span class="brand-mark" aria-hidden="true">
            <img src="${v("assets/img/logo-comeleapi-256.webp")}" srcset="${v("assets/img/logo-comeleapi-96.webp")} 96w, ${v("assets/img/logo-comeleapi-256.webp")} 256w" sizes="(max-width: 600px) 40px, 48px" width="48" height="48" alt="" decoding="async" loading="lazy" />
          </span>
          <span>comeleapi</span>
        </a>
        <div class="socials" aria-label="Social">
          <a class="social-link social-link--instagram" href="https://www.instagram.com/comeleapi/" target="_blank" rel="noopener" aria-label="Instagram comeleapi"><img src="${v("assets/img/icons/social-instagram.webp")}" srcset="${v("assets/img/icons/social-instagram-64.webp")} 64w, ${v("assets/img/icons/social-instagram.webp")} 128w" sizes="22px" width="22" height="22" alt="" loading="lazy" decoding="async" /></a>
          <a class="social-link social-link--facebook" href="https://www.facebook.com/profile.php?id=61591999618100&amp;locale=it_IT" target="_blank" rel="noopener" aria-label="Facebook comeleapi"><img src="${v("assets/img/icons/social-facebook.webp")}" srcset="${v("assets/img/icons/social-facebook-64.webp")} 64w, ${v("assets/img/icons/social-facebook.webp")} 128w" sizes="22px" width="22" height="22" alt="" loading="lazy" decoding="async" /></a>
          <a class="social-link social-link--whatsapp" href="${escapeHtml(whatsAppUrl("Ciao Sara, vorrei prenotare una consulenza."))}" target="_blank" rel="noopener" aria-label="WhatsApp"><img src="${v("assets/img/icons/social-whatsapp.webp")}" srcset="${v("assets/img/icons/social-whatsapp-64.webp")} 64w, ${v("assets/img/icons/social-whatsapp.webp")} 128w" sizes="22px" width="22" height="22" alt="" loading="lazy" decoding="async" /></a>
        </div>
      </div>

      <div class="footer-col">
        <p class="footer-col-title">Navigazione</p>
        <ul>
          <li><a href="/#prodotti">Oli essenziali</a></li>
          <li><a href="/servizi/">Trattamenti</a></li>
          <li><a href="/zone/">Zone</a></li>
          <li><a href="/faq/">Domande frequenti</a></li>
          <li><a href="/#chi-sono">The founder</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <p class="footer-col-title">Contatti</p>
        <ul>
          <li><a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></li>
          <li><a href="tel:+${PHONE_E164}">${PHONE_DISPLAY}</a></li>
          <li>Solo a domicilio &mdash; Milano, Bresso e zone limitrofe</li>
          <li>Nessuno studio aperto al pubblico</li>
        </ul>
      </div>
      <div class="footer-col">
        <p class="footer-col-title">Informative</p>
        <ul>
          <li><a href="/cookie-policy/">Cookie policy</a></li>
          <li><a href="/privacy/">Privacy policy</a></li>
          <li><a href="/termini/">Termini del sito</a></li>
        </ul>
      </div>
    </div>
    <div class="container footer-bottom" style="flex-direction: column; justify-content: center; text-align: center; gap: 1.5rem;">
      <span>© <span id="year"></span> comeleapi. Tutti i diritti riservati.</span>
      <a href="https://www.webnovis.com" target="_blank" rel="noopener" class="btn-webnovis">
        Realizzato con cura da WebNovis
      </a>
    </div>
  </footer>

  <script src="${v("assets/js/pages.js")}" defer></script>
</body>
</html>
`;
}

// Intestazione standard delle sottopagine: breadcrumb + H1 nello stile della landing.
function pageHeadHtml({ eyebrow, h1, lead, crumbs }) {
  return `    <section class="section">
      <div class="container">
${breadcrumbsHtml(crumbs)}
        <div class="section-head section-head--center">
          ${eyebrow ? `<span class="eyebrow">${escapeHtml(eyebrow)}</span>` : ""}
          <h1 class="section-title">${escapeHtml(h1)}</h1>
          ${lead ? `<p class="section-lead">${escapeHtml(lead)}</p>` : ""}
        </div>
      </div>
    </section>`;
}

function serviceCardsHtml(v, { linkPrefix = "/servizi/" } = {}) {
  return SERVICE_DEFINITIONS.map((service) => {
    const iconClass = SERVICE_ICON_CLASSES[service.slug];
    const price = SERVICE_VISIBLE_PRICES[service.slug];
    return `          <a class="service-card service-card--link" href="${linkPrefix}${service.slug}/">
            <div class="service-ic ${iconClass}" aria-hidden="true"><img class="generated-icon" src="${v(service.image)}" alt="" loading="lazy" decoding="async" /></div>
            <h3>${escapeHtml(service.name)}</h3>
            <span class="service-price">${escapeHtml(price)}</span>
          </a>`;
  }).join("\n");
}

// Icona dedicata per città: landmark in line-art (assets/img/icons/icon-city-<slug>.webp),
// derivata dai sorgenti PNG in assets/img/icons/icone-città e ottimizzata in WebP lossless 128px.
function zoneCardsHtml(v) {
  return AREA_DEFINITIONS.map(([slug, name]) => {
    return `          <a class="service-card service-card--link" href="/zone/${slug}/">
            <div class="service-ic" aria-hidden="true"><img class="generated-icon" src="${v(`assets/img/icons/icon-city-${slug}.webp`)}" alt="" loading="lazy" decoding="async" /></div>
            <h3>${escapeHtml(name)}</h3>
          </a>`;
  }).join("\n");
}

const HOW_IT_WORKS_HTML = `    <section class="section">
      <div class="container">
        <div class="section-head section-head--center">
          <span class="eyebrow">Come funziona</span>
          <h2 class="section-title">Il benessere arriva a casa tua</h2>
        </div>
        <ul class="subpage-list">
          <li>Arrivo da te con lettino professionale, teli e oli.</li>
          <li>Scegli un ambiente tranquillo della casa, bastano pochi metri quadrati.</li>
          <li>Concordiamo insieme giorno e orario su WhatsApp.</li>
          <li>Lavoro solo a domicilio su appuntamento.</li>
        </ul>
      </div>
    </section>`;


// ─── Costruzione delle singole pagine ───────────────────────────────────────
function buildZoneHubPage(v) {
  const pagePath = "/zone/";
  const pageUrl = `${SITE_URL}zone/`;
  const title = "Zone servite — Massaggi a domicilio a Milano, Bresso e Milano Nord | comeleapi";
  const description =
    "Le zone coperte dal servizio di massaggi a domicilio di comeleapi: Milano, Bresso, Cusano Milanino, Cormano, Cinisello Balsamo, Sesto San Giovanni e le aree limitrofe.";
  const crumbs = [
    { name: "Home", path: "/" },
    { name: "Where", path: pagePath }
  ];
  const content = [
    pageHeadHtml({
      eyebrow: "Zone servite",
      h1: "Massaggi a domicilio a Milano, Bresso e Milano Nord",
      lead: "comeleapi lavora esclusivamente a domicilio a Milano, Bresso e nei comuni limitrofi: scegli la tua città e scopri come funziona il servizio nella tua zona.",
      crumbs
    }),
    `    <section class="section">
      <div class="container">
        <div class="services-grid">
${zoneCardsHtml(v)}
        </div>
      </div>
    </section>`,
    HOW_IT_WORKS_HTML,
    ctaSectionHtml("Ciao Sara, vorrei prenotare un massaggio a domicilio nella mia zona.")
  ].join("\n\n");

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      websiteNode(),
      {
        "@id": `${pageUrl}#webpage`,
        "@type": ["WebPage", "CollectionPage"],
        name: title,
        url: pageUrl,
        description,
        inLanguage: "it-IT",
        isPartOf: { "@id": `${SITE_URL}#website` },
        breadcrumb: { "@id": `${pageUrl}#breadcrumb` },
        mainEntity: { "@id": `${pageUrl}#zone-list` },
        about: { "@id": ORGANIZATION_ID }
      },
      breadcrumbNode(pageUrl, crumbs),
      {
        "@id": `${pageUrl}#zone-list`,
        "@type": "ItemList",
        name: "Zone servite dal servizio di massaggi a domicilio comeleapi",
        numberOfItems: AREA_DEFINITIONS.length,
        itemListElement: AREA_DEFINITIONS.map(([slug, name], index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: `Massaggi a domicilio a ${name}`,
          url: `${SITE_URL}zone/${slug}/`
        }))
      },
      ...organizationNodes()
    ]
  };

  return {
    route: "zone/index.html",
    canonical: pageUrl,
    html: pageShell({ canonical: pageUrl, title, description, structuredData, content, v })
  };
}

function buildCityPage(v, [slug, name]) {
  const city = CITY_CONTENT[slug];
  if (!city) throw new Error(`Contenuti mancanti per la città: ${slug}`);
  const pagePath = `/zone/${slug}/`;
  const pageUrl = `${SITE_URL}zone/${slug}/`;
  const title = city.title;
  const crumbs = [
    { name: "Home", path: "/" },
    { name: "Where", path: "/zone/" },
    { name, path: pagePath }
  ];
  const content = [
    pageHeadHtml({
      eyebrow: "Zone servite",
      h1: `Massaggi a domicilio a ${name}`,
      lead: city.intro[0],
      crumbs
    }),
    `    <section class="section">
      <div class="container">
        <div class="section-head section-head--center">
          <h2 class="section-title">${escapeHtml(city.h2)}</h2>
        </div>
        <p class="subpage-text">${escapeHtml(city.intro[1])}</p>
        <ul class="subpage-list">
${city.local.map((line) => `          <li>${escapeHtml(line)}</li>`).join("\n")}
        </ul>
      </div>
    </section>`,
    `    <section class="section">
      <div class="container">
        <div class="section-head section-head--center">
          <span class="eyebrow">Trattamenti</span>
          <h2 class="section-title">I trattamenti disponibili a ${escapeHtml(name)}</h2>
        </div>
        <div class="services-grid">
${serviceCardsHtml(v)}
        </div>
      </div>
    </section>`,
    HOW_IT_WORKS_HTML,
    faqSectionHtml(city.faq, `Domande frequenti su ${name}`),
    ctaSectionHtml(`Ciao Sara, vorrei prenotare un massaggio a domicilio a ${name}.`)
  ].join("\n\n");

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      websiteNode(),
      {
        "@id": `${pageUrl}#webpage`,
        "@type": "WebPage",
        name: title,
        url: pageUrl,
        description: city.description,
        inLanguage: "it-IT",
        isPartOf: { "@id": `${SITE_URL}#website` },
        breadcrumb: { "@id": `${pageUrl}#breadcrumb` },
        mainEntity: { "@id": ORGANIZATION_ID },
        about: [
          {
            "@type": "City",
            name,
            sameAs: city.sameAs,
            containedInPlace: { "@type": "AdministrativeArea", name: "Città metropolitana di Milano" }
          },
          { "@id": ORGANIZATION_ID }
        ],
        hasPart: { "@id": `${pageUrl}#faq` }
      },
      breadcrumbNode(pageUrl, crumbs),
      ...organizationNodes(),
      faqPageNode(pageUrl, city.faq, `Domande frequenti sui massaggi a domicilio a ${name}`)
    ]
  };

  return {
    route: `zone/${slug}/index.html`,
    canonical: pageUrl,
    html: pageShell({ canonical: pageUrl, title, description: city.description, structuredData, content, v })
  };
}

function buildServicesHubPage(v) {
  const pagePath = "/servizi/";
  const pageUrl = `${SITE_URL}servizi/`;
  const title = "Trattamenti a domicilio — Massaggi e oli essenziali | comeleapi";
  const description =
    "Tutti i trattamenti a domicilio di comeleapi: massaggio sportivo, decontratturante, relax, drenante, trattamento mirato 30 minuti, kinesio taping e massaggio con oli essenziali.";
  const crumbs = [
    { name: "Home", path: "/" },
    { name: "Servizi", path: pagePath }
  ];
  const content = [
    pageHeadHtml({
      eyebrow: "Trattamenti",
      h1: "Trattamenti a domicilio",
      lead: "Ogni seduta è personalizzata sulle tue esigenze e si svolge esclusivamente a casa tua, a Milano, Bresso e nelle zone limitrofe.",
      crumbs
    }),
    `    <section class="section">
      <div class="container">
        <div class="services-grid">
${serviceCardsHtml(v)}
        </div>
      </div>
    </section>`,
    HOW_IT_WORKS_HTML,
    faqSectionHtml(
      [
        {
          q: "Quanto costano i trattamenti?",
          a: PRICES_SENTENCE
        },
        {
          q: "In quali zone sono disponibili i trattamenti?",
          a: "A Milano, Bresso, Cusano Milanino, Cormano, Cinisello Balsamo, Sesto San Giovanni e nelle zone limitrofe. Tutti i dettagli nella sezione Zone."
        },
        {
          q: "Come scelgo il trattamento più adatto?",
          a: "Scrivimi su WhatsApp raccontandomi le tue esigenze: ti aiuto a capire quale opzione può fare al caso tuo, senza impegno."
        }
      ],
      "Domande frequenti sui trattamenti"
    ),
    ctaSectionHtml("Ciao Sara, vorrei informazioni su trattamenti, disponibilità e costi.")
  ].join("\n\n");

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      websiteNode(),
      {
        "@id": `${pageUrl}#webpage`,
        "@type": ["WebPage", "CollectionPage"],
        name: title,
        url: pageUrl,
        description,
        inLanguage: "it-IT",
        isPartOf: { "@id": `${SITE_URL}#website` },
        breadcrumb: { "@id": `${pageUrl}#breadcrumb` },
        mainEntity: { "@id": `${pageUrl}#service-list` },
        about: { "@id": ORGANIZATION_ID },
        hasPart: { "@id": `${pageUrl}#faq` }
      },
      breadcrumbNode(pageUrl, crumbs),
      {
        "@id": `${pageUrl}#service-list`,
        "@type": "ItemList",
        name: "Trattamenti a domicilio proposti da comeleapi",
        numberOfItems: SERVICE_DEFINITIONS.length,
        itemListElement: SERVICE_DEFINITIONS.map((service, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: service.name,
          url: `${SITE_URL}servizi/${service.slug}/`
        }))
      },
      ...organizationNodes(),
      faqPageNode(pageUrl, [
        { q: "Quanto costano i trattamenti?", a: PRICES_SENTENCE },
        {
          q: "In quali zone sono disponibili i trattamenti?",
          a: "A Milano, Bresso, Cusano Milanino, Cormano, Cinisello Balsamo, Sesto San Giovanni e nelle zone limitrofe. Tutti i dettagli nella sezione Zone."
        },
        {
          q: "Come scelgo il trattamento più adatto?",
          a: "Scrivimi su WhatsApp raccontandomi le tue esigenze: ti aiuto a capire quale opzione può fare al caso tuo, senza impegno."
        }
      ], "Domande frequenti sui trattamenti a domicilio comeleapi")
    ]
  };

  return {
    route: "servizi/index.html",
    canonical: pageUrl,
    html: pageShell({ canonical: pageUrl, title, description, structuredData, content, v })
  };
}

function buildServicePage(v, service) {
  const extra = SERVICE_CONTENT[service.slug];
  if (!extra) throw new Error(`Contenuti mancanti per il servizio: ${service.slug}`);
  const pagePath = `/servizi/${service.slug}/`;
  const pageUrl = `${SITE_URL}servizi/${service.slug}/`;
  const title = `${service.name} a domicilio — Milano, Bresso e Milano Nord | comeleapi`;
  const description = `${service.name} a domicilio a Milano, Bresso e nelle zone limitrofe con Sara Bordenga: ${SERVICE_VISIBLE_PRICES[service.slug]}, ${extra.duration}. Prenotazione semplice su WhatsApp.`;
  const crumbs = [
    { name: "Home", path: "/" },
    { name: "Servizi", path: "/servizi/" },
    { name: service.name, path: pagePath }
  ];
  const zoneLinks = AREA_DEFINITIONS
    .map(([slug, name]) => `<a href="/zone/${slug}/">${escapeHtml(name)}</a>`)
    .join(", ");
  const content = [
    pageHeadHtml({
      eyebrow: "Trattamenti",
      h1: `${service.name} a domicilio`,
      lead: extra.intro[0],
      crumbs
    }),
    `    <section class="section">
      <div class="container">
        <div class="subpage-price-card">
          <div class="service-ic ${SERVICE_ICON_CLASSES[service.slug]}" aria-hidden="true"><img class="generated-icon" src="${v(service.image)}" alt="" loading="lazy" decoding="async" /></div>
          <div>
            <h2>${escapeHtml(service.name)}</h2>
            <p>${escapeHtml(extra.duration)} &mdash; esclusivamente a domicilio</p>
          </div>
          <span class="service-price">${escapeHtml(SERVICE_VISIBLE_PRICES[service.slug])}</span>
        </div>
        <p class="subpage-text">${escapeHtml(extra.intro[1])}</p>
      </div>
    </section>`,
    `    <section class="section">
      <div class="container">
        <div class="section-head section-head--center">
          <h2 class="section-title">A chi è pensato</h2>
        </div>
        <ul class="subpage-list">
${extra.forWho.map((line) => `          <li>${escapeHtml(line)}</li>`).join("\n")}
        </ul>
      </div>
    </section>`,
    `    <section class="section">
      <div class="container">
        <div class="section-head section-head--center">
          <h2 class="section-title">Dove è disponibile</h2>
        </div>
        <p class="subpage-text">Il trattamento si svolge esclusivamente a domicilio nelle zone di ${zoneLinks}. Scopri tutte le aree nella pagina <a href="/zone/">Zone</a>.</p>
      </div>
    </section>`,
    HOW_IT_WORKS_HTML,
    faqSectionHtml(extra.faq, `Domande frequenti sul ${service.name.toLowerCase()}`),
    ctaSectionHtml(`Ciao Sara, vorrei prenotare un ${service.name.toLowerCase()} a domicilio.`)
  ].join("\n\n");

  const serviceNode = {
    "@id": `${pageUrl}#service`,
    "@type": "Service",
    name: service.name,
    serviceType: service.name,
    url: pageUrl,
    description: service.description,
    image: `${SITE_URL}${service.image}`,
    provider: { "@id": ORGANIZATION_ID },
    providerMobility: "dynamic",
    areaServed: inlineCities(),
    availableChannel: {
      "@type": "ServiceChannel",
      name: "Prenotazione tramite WhatsApp",
      serviceUrl: `https://wa.me/${PHONE_E164}`,
      availableLanguage: ["it", "en", "es"]
    }
  };
  if (service.price) {
    serviceNode.offers = {
      "@type": "Offer",
      price: service.price,
      priceCurrency: "EUR",
      url: pageUrl,
      seller: { "@id": ORGANIZATION_ID }
    };
  }

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      websiteNode(),
      {
        "@id": `${pageUrl}#webpage`,
        "@type": "WebPage",
        name: title,
        url: pageUrl,
        description,
        inLanguage: "it-IT",
        isPartOf: { "@id": `${SITE_URL}#website` },
        breadcrumb: { "@id": `${pageUrl}#breadcrumb` },
        mainEntity: { "@id": `${pageUrl}#service` },
        about: { "@id": ORGANIZATION_ID },
        hasPart: { "@id": `${pageUrl}#faq` }
      },
      breadcrumbNode(pageUrl, crumbs),
      serviceNode,
      ...organizationNodes(),
      faqPageNode(pageUrl, extra.faq, `Domande frequenti sul ${service.name.toLowerCase()} a domicilio`)
    ]
  };

  return {
    route: `servizi/${service.slug}/index.html`,
    canonical: pageUrl,
    html: pageShell({ canonical: pageUrl, title, description, structuredData, content, v })
  };
}

// ─── Pagine legali (navigabili ma noindex, fuori sitemap) ───────────────────
// Il testo riprende fedelmente le informative IT già pubblicate nel modal
// della home (assets/js/app.js): unica differenza, la nota statica sulla
// gestione delle preferenze cookie al posto del pulsante interattivo.

const PRIVACY_BODY_HTML = `      <div class="policy-content">
        <p><strong>Ultimo aggiornamento:</strong> 11 luglio 2026.</p>
        <p>La presente informativa è resa ai sensi degli articoli 12, 13 e 14 del Regolamento (UE) 2016/679 ("GDPR") e descrive come comeleapi tratta i dati personali raccolti tramite questo sito e tramite i canali di contatto collegati.</p>

        <h4>Titolare del trattamento</h4>
        <p><strong>comeleapi - Sara Bordenga</strong>, progetto di benessere con riferimento territoriale a 20091 Bresso (Milano). Per richieste privacy: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> oppure <a href="tel:+${PHONE_E164}">${PHONE_DISPLAY}</a>.</p>

        <h4>Dati trattati</h4>
        <ul class="policy-list">
          <li><strong>Dati di navigazione:</strong> informazioni tecniche trasmesse dal browser, come indirizzo IP, user agent, data/ora della richiesta e URL richiesto, trattate dai fornitori tecnici per erogare e proteggere il sito.</li>
          <li><strong>Dati inviati volontariamente:</strong> nome, recapiti, contenuto dei messaggi, preferenze sul trattamento o richieste inviate via email, WhatsApp o eventuali moduli.</li>
          <li><strong>Preferenze cookie:</strong> scelta di accettazione o rifiuto delle categorie non necessarie, conservata tramite cookie tecnico.</li>
        </ul>

        <h4>Finalità e basi giuridiche</h4>
        <table class="policy-table">
          <thead><tr><th>Finalità</th><th>Base giuridica</th><th>Conservazione</th></tr></thead>
          <tbody>
            <tr><td>Funzionamento, sicurezza e manutenzione del sito.</td><td>Legittimo interesse del titolare e necessità tecnica del servizio, art. 6 par. 1 lett. f GDPR.</td><td>Log tecnici per il tempo necessario alla sicurezza e comunque secondo i tempi dei fornitori tecnici.</td></tr>
            <tr><td>Rispondere a richieste su trattamenti, oli essenziali e disponibilità.</td><td>Esecuzione di misure precontrattuali o contratto, art. 6 par. 1 lett. b GDPR.</td><td>Per il tempo necessario alla risposta e, salvo obblighi ulteriori, non oltre 24 mesi dall'ultimo contatto utile.</td></tr>
            <tr><td>Gestione delle preferenze cookie.</td><td>Obbligo di documentare la scelta e consenso per eventuali categorie non tecniche, art. 6 par. 1 lett. a GDPR ed ePrivacy.</td><td>180 giorni, salvo modifica anticipata delle preferenze.</td></tr>
          </tbody>
        </table>

        <h4>Destinatari e fornitori</h4>
        <p>I dati possono essere trattati da fornitori tecnici strettamente necessari alla gestione del sito, hosting, sicurezza, manutenzione, email o strumenti di messaggistica. I link verso WhatsApp, Instagram e WebNovis aprono servizi esterni: dopo il click, i relativi gestori trattano i dati secondo le proprie informative.</p>

        <h4>Trasferimenti extra SEE</h4>
        <p>Il sito è stato configurato per caricare font e immagini principali da asset locali, evitando richieste a Google Fonts o servizi immagine esterni durante la navigazione ordinaria. L'uso volontario di servizi esterni, come WhatsApp o social network, può comportare trattamenti o trasferimenti secondo le condizioni dei rispettivi fornitori.</p>

        <h4>Diritti dell'interessato</h4>
        <p>Puoi chiedere accesso, rettifica, cancellazione, limitazione, portabilità, opposizione e revoca del consenso quando applicabile, scrivendo a <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>. Hai inoltre diritto di proporre reclamo al <a href="https://www.garanteprivacy.it/" target="_blank" rel="noopener">Garante per la protezione dei dati personali</a>.</p>

        <h4>Riferimenti normativi</h4>
        <ul class="policy-list">
          <li><a href="https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng" target="_blank" rel="noopener">Regolamento (UE) 2016/679 - GDPR</a>.</li>
          <li><a href="https://eur-lex.europa.eu/eli/dir/2002/58/oj/eng" target="_blank" rel="noopener">Direttiva 2002/58/CE ePrivacy</a>.</li>
          <li><a href="https://www.garanteprivacy.it/home/docweb/-/docweb-display/docweb/9677876" target="_blank" rel="noopener">Linee guida cookie e altri strumenti di tracciamento del Garante, 10 giugno 2021</a>.</li>
        </ul>
      </div>`;

const COOKIE_BODY_HTML = `      <div class="policy-content">
        <p><strong>Ultimo aggiornamento:</strong> 11 luglio 2026.</p>
        <p>Questa Cookie Policy descrive l'uso di cookie e strumenti analoghi sul sito comeleapi. Per impostazione predefinita sono attivi solo strumenti tecnici necessari. Eventuali strumenti analytics o marketing vengono attivati solo dopo consenso espresso.</p>

        <h4>Cosa sono i cookie</h4>
        <p>I cookie sono piccoli file o informazioni salvate nel dispositivo dell'utente. La normativa europea e le indicazioni del Garante distinguono i cookie tecnici, necessari o assimilabili, dai cookie usati per finalità ulteriori, come analytics non tecnici o profilazione, che richiedono consenso preventivo e informato.</p>

        <h4>Cookie usati da questo sito</h4>
        <table class="policy-table">
          <thead><tr><th>Nome</th><th>Tipo</th><th>Finalità</th><th>Durata</th></tr></thead>
          <tbody>
            <tr><td><code>comeleapi_cookie_consent</code></td><td>Tecnico, prima parte</td><td>Memorizza la scelta dell'utente su accettazione o rifiuto delle categorie non necessarie. Non traccia la navigazione.</td><td>180 giorni</td></tr>
          </tbody>
        </table>

        <h4>Categorie di consenso</h4>
        <ul class="policy-list">
          <li><strong>Necessari:</strong> sempre attivi, servono al funzionamento del sito e alla conservazione della preferenza privacy.</li>
          <li><strong>Statistiche:</strong> al momento non sono installati strumenti analytics. La categoria è predisposta per eventuali statistiche future, da caricare solo dopo consenso.</li>
          <li><strong>Marketing:</strong> al momento non sono installati pixel o cookie di profilazione. La categoria è predisposta per eventuali strumenti futuri, da caricare solo dopo consenso.</li>
        </ul>

        <h4>Come funziona il consenso</h4>
        <p>Il rifiuto non limita l'accesso al sito. Il pulsante "Rifiuta" e la chiusura del banner mantengono attivi solo i cookie tecnici. Lo scrolling o la semplice prosecuzione della navigazione non sono considerati consenso.</p>
        <p>Il banner delle preferenze compare alla prima visita della <a href="/">pagina principale</a>; puoi rivedere o modificare la scelta in qualsiasi momento dalla voce «Preferenze cookie» nel footer della stessa pagina.</p>

        <h4>Riferimenti ufficiali</h4>
        <ul class="policy-list">
          <li><a href="https://www.garanteprivacy.it/faq/cookie" target="_blank" rel="noopener">FAQ Cookie del Garante Privacy</a>.</li>
          <li><a href="https://www.garanteprivacy.it/home/docweb/-/docweb-display/docweb/9677876" target="_blank" rel="noopener">Linee guida cookie e altri strumenti di tracciamento del Garante</a>.</li>
          <li><a href="https://www.edpb.europa.eu/our-work-tools/our-documents/topic/consent_en" target="_blank" rel="noopener">Linee guida EDPB sul consenso</a>.</li>
        </ul>
      </div>`;

const TERMS_BODY_HTML = `      <div class="policy-content">
        <p><strong>Ultimo aggiornamento:</strong> 27 luglio 2026.</p>
        <p>Le presenti condizioni descrivono l'uso del sito comeleapi.it e le modalità con cui vengono proposti i servizi di <strong>comeleapi - Sara Bordenga</strong>, progetto di benessere con riferimento territoriale a 20091 Bresso (Milano).</p>

        <h4>Natura del servizio</h4>
        <p>comeleapi propone trattamenti di massaggio a scopo di benessere, svolti esclusivamente a domicilio e su appuntamento a Milano, Bresso e nelle zone limitrofe. I trattamenti non hanno finalità sanitarie, non costituiscono prestazioni mediche o fisioterapiche e non sostituiscono il parere di un medico.</p>

        <h4>Prenotazioni e appuntamenti</h4>
        <ul class="policy-list">
          <li>La prenotazione avviene tramite WhatsApp al <a href="tel:+${PHONE_E164}">${PHONE_DISPLAY}</a> oppure via email a <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</li>
          <li>Giorno, orario e trattamento vengono concordati direttamente e confermati nella conversazione.</li>
          <li>In caso di impossibilità a rispettare l'appuntamento, è gradito un avviso con il maggior preavviso possibile, così da riorganizzare l'agenda.</li>
        </ul>

        <h4>Prezzi e pagamenti</h4>
        <p>${PRICES_SENTENCE} Il pagamento avviene direttamente al termine della seduta: il sito non gestisce pagamenti online né vendite a distanza dei trattamenti.</p>

        <h4>Prodotti Young Living</h4>
        <p>comeleapi non è un e-commerce e non gestisce spedizioni. Gli oli essenziali e i kit presentati in vetrina si acquistano sul sito ufficiale Young Living tramite i link di Sara Bordenga, rivenditrice indipendente: ordini, pagamenti, consegne ed eventuali resi sono regolati esclusivamente dalle condizioni di vendita di Young Living.</p>

        <h4>Link verso servizi esterni</h4>
        <p>Il sito contiene collegamenti verso servizi di terze parti (ad esempio WhatsApp, Instagram, Young Living, WebNovis). comeleapi non ha alcun controllo su tali servizi, ai quali si applicano le condizioni e le informative dei rispettivi gestori.</p>

        <h4>Proprietà intellettuale</h4>
        <p>Testi, immagini, logo e contenuti del sito appartengono a comeleapi - Sara Bordenga o ai rispettivi titolari e non possono essere riprodotti senza autorizzazione, salvo gli usi consentiti dalla legge.</p>

        <h4>Limitazioni</h4>
        <p>Le informazioni pubblicate sul sito hanno finalità descrittive e possono essere aggiornate in qualsiasi momento. Eventuali indisponibilità temporanee del sito o variazioni di orari e disponibilità dei trattamenti non fanno sorgere diritti a indennizzi.</p>

        <h4>Legge applicabile</h4>
        <p>Le presenti condizioni sono regolate dalla legge italiana. Per ogni chiarimento puoi scrivere a <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>
      </div>`;

const LEGAL_PAGE_DEFINITIONS = [
  {
    slug: "privacy",
    name: "Privacy Policy",
    title: "Privacy Policy | comeleapi",
    description: "Informativa privacy del sito comeleapi: titolare del trattamento, dati trattati, finalità, basi giuridiche e diritti dell'interessato ai sensi del GDPR.",
    body: PRIVACY_BODY_HTML
  },
  {
    slug: "cookie-policy",
    name: "Cookie Policy",
    title: "Cookie Policy | comeleapi",
    description: "Cookie Policy del sito comeleapi: cookie tecnici utilizzati, categorie di consenso e modalità di gestione delle preferenze.",
    body: COOKIE_BODY_HTML
  },
  {
    slug: "termini",
    name: "Termini e condizioni",
    title: "Termini e condizioni | comeleapi",
    description: "Termini e condizioni d'uso del sito comeleapi: natura dei servizi di massaggio a domicilio, prenotazioni, prezzi e riferimenti sui prodotti Young Living.",
    body: TERMS_BODY_HTML
  }
];

function buildLegalPage(v, legal) {
  const pagePath = `/${legal.slug}/`;
  const pageUrl = `${SITE_URL}${legal.slug}/`;
  const crumbs = [
    { name: "Home", path: "/" },
    { name: legal.name, path: pagePath }
  ];
  const content = [
    pageHeadHtml({ eyebrow: "Informative", h1: legal.name, lead: "", crumbs }),
    `    <section class="section">
      <div class="container">
${legal.body}
      </div>
    </section>`
  ].join("\n\n");

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      websiteNode(),
      {
        "@id": `${pageUrl}#webpage`,
        "@type": "WebPage",
        name: legal.title,
        url: pageUrl,
        description: legal.description,
        inLanguage: "it-IT",
        isPartOf: { "@id": `${SITE_URL}#website` },
        breadcrumb: { "@id": `${pageUrl}#breadcrumb` },
        about: { "@id": ORGANIZATION_ID }
      },
      breadcrumbNode(pageUrl, crumbs),
      ...organizationNodes()
    ]
  };

  return {
    route: `${legal.slug}/index.html`,
    canonical: pageUrl,
    legal: true,
    html: pageShell({
      canonical: pageUrl,
      title: legal.title,
      description: legal.description,
      robots: "noindex,follow",
      structuredData,
      content,
      v
    })
  };
}

// ─── Pagina FAQ dedicata ───────────────────────────────────────────────────────
// La landing mostra solo un box CTA in stile Community: tutte le domande
// vivono qui, indicizzabili, con nodo FAQPage allineato al testo visibile
// (stessa fonte FAQ_DEFINITIONS della vecchia sezione in home).
function buildFaqPage(v) {
  const pagePath = "/faq/";
  const pageUrl = `${SITE_URL}faq/`;
  const title = "Domande frequenti — Massaggi a domicilio a Milano, Bresso e Milano Nord | comeleapi";
  const description =
    "Le risposte alle domande più frequenti su comeleapi: massaggi a domicilio a Milano, Bresso e nelle zone limitrofe, aree servite, prezzi, prenotazione su WhatsApp e oli essenziali Young Living.";
  const crumbs = [
    { name: "Home", path: "/" },
    { name: "Domande", path: pagePath }
  ];
  const content = [
    pageHeadHtml({
      eyebrow: "",
      h1: "Massaggi a domicilio e oli essenziali",
      lead:
        "il benessere direttamente a casa tua: massaggi sportivi, decontratturanti, relax e drenanti a domicilio a Milano, Bresso e in tutta l'area di Milano Nord — Cusano Milanino, Cormano, Cinisello Balsamo, Sesto San Giovanni e Milano.",
      crumbs
    }),
    `    <section class="section faq-section" aria-label="Elenco delle domande frequenti">
      <div class="container">
        <div class="faq-list">
${buildFaqHtml(FAQ_DEFINITIONS)}
        </div>
      </div>
    </section>`,
    ctaSectionHtml("Ciao Sara, ho letto le FAQ e vorrei prenotare un trattamento a domicilio.")
  ].join("\n\n");

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      websiteNode(),
      {
        "@id": `${pageUrl}#webpage`,
        "@type": "WebPage",
        name: title,
        url: pageUrl,
        description,
        inLanguage: "it-IT",
        isPartOf: { "@id": `${SITE_URL}#website` },
        breadcrumb: { "@id": `${pageUrl}#breadcrumb` },
        mainEntity: { "@id": `${pageUrl}#faq` },
        about: { "@id": ORGANIZATION_ID }
      },
      breadcrumbNode(pageUrl, crumbs),
      ...organizationNodes(),
      faqPageNode(
        pageUrl,
        FAQ_DEFINITIONS,
        "Domande frequenti su massaggi a domicilio e oli essenziali — comeleapi"
      )
    ]
  };

  return {
    route: "faq/index.html",
    canonical: pageUrl,
    html: pageShell({ canonical: pageUrl, title, description, structuredData, content, v })
  };
}

// ─── API pubblica del generatore ────────────────────────────────────────────

/**
 * Genera tutte le sottopagine statiche. `v(relPath)` riceve un percorso
 * root-relative senza slash iniziale (es. "assets/css/styles.css") e deve
 * restituire l'URL root-relative versionata ("/assets/css/styles.css?v=…"),
 * calcolata sul file già presente in dist.
 */
export function renderSitePages(v) {
  return [
    buildZoneHubPage(v),
    ...AREA_DEFINITIONS.map((area) => buildCityPage(v, area)),
    buildServicesHubPage(v),
    ...SERVICE_DEFINITIONS.map((service) => buildServicePage(v, service)),
    buildFaqPage(v),
    ...LEGAL_PAGE_DEFINITIONS.map((legal) => buildLegalPage(v, legal))
  ];
}

// Directory generate (per le redirect /dir/index.html → /dir/).
export const GENERATED_PAGE_DIRS = [
  "zone",
  ...AREA_DEFINITIONS.map(([slug]) => `zone/${slug}`),
  "servizi",
  ...SERVICE_DEFINITIONS.map((service) => `servizi/${service.slug}`),
  "faq",
  ...LEGAL_PAGE_DEFINITIONS.map((legal) => legal.slug)
];

// Rotte legali: navigabili ma noindex e fuori dalla sitemap.
export const LEGAL_PAGE_ROUTES = LEGAL_PAGE_DEFINITIONS.map((legal) => ({
  slug: legal.slug,
  route: `${legal.slug}/index.html`,
  canonical: `${SITE_URL}${legal.slug}/`
}));

const HERO_IMAGE_PATH = "assets/img/hero/hero-massaggio-professionale-comeleapi.webp";

// Voci sitemap per le pagine indicizzabili (le legali restano escluse).
// Ordine: hub zone, città, hub servizi, servizi.
export const SUBPAGE_SITEMAP_ENTRIES = [
  {
    loc: `${SITE_URL}zone/`,
    sourceFiles: SUBPAGE_SOURCE_FILES,
    kind: "zone-hub",
    images: [
      {
        path: HERO_IMAGE_PATH,
        title: "Massaggi a domicilio nelle zone servite da comeleapi",
        caption: "Trattamenti a domicilio a Milano, Bresso, Cusano Milanino, Cormano, Cinisello Balsamo, Sesto San Giovanni e zone limitrofe"
      }
    ]
  },
  ...AREA_DEFINITIONS.map(([slug, name]) => ({
    loc: `${SITE_URL}zone/${slug}/`,
    sourceFiles: SUBPAGE_SOURCE_FILES,
    kind: "zone",
    images: [
      {
        path: HERO_IMAGE_PATH,
        title: `Massaggi a domicilio a ${name} — comeleapi`,
        caption: CITY_CONTENT[slug].imageCaption
      }
    ]
  })),
  {
    loc: `${SITE_URL}servizi/`,
    sourceFiles: SUBPAGE_SOURCE_FILES,
    kind: "services-hub",
    images: [
      {
        path: HERO_IMAGE_PATH,
        title: "Trattamenti a domicilio comeleapi",
        caption: "Massaggio sportivo, decontratturante, relax, drenante, trattamento mirato, kinesio taping e oli essenziali"
      }
    ]
  },
  ...SERVICE_DEFINITIONS.map((service) => ({
    loc: `${SITE_URL}servizi/${service.slug}/`,
    sourceFiles: SUBPAGE_SOURCE_FILES,
    kind: "service",
    images: [
      {
        path: service.image,
        title: `${service.name} a domicilio — comeleapi`,
        caption: service.description
      }
    ]
  })),
  {
    loc: `${SITE_URL}faq/`,
    sourceFiles: SUBPAGE_SOURCE_FILES,
    kind: "faq",
    images: [
      {
        path: HERO_IMAGE_PATH,
        title: "Domande frequenti sui massaggi a domicilio comeleapi",
        caption: "Risposte su massaggi a domicilio a Milano, Bresso e zone limitrofe, prezzi, prenotazioni e oli essenziali Young Living"
      }
    ]
  }
];

// Pagine indicizzabili per check-public-seo.mjs (file in dist + canonical).
export const SEO_CHECK_PAGES = [
  {
    file: "zone/index.html",
    canonical: `${SITE_URL}zone/`,
    schemaType: "WebPage",
    schemaId: `${SITE_URL}zone/#webpage`
  },
  ...AREA_DEFINITIONS.map(([slug]) => ({
    file: `zone/${slug}/index.html`,
    canonical: `${SITE_URL}zone/${slug}/`,
    schemaType: "WebPage",
    schemaId: `${SITE_URL}zone/${slug}/#webpage`
  })),
  {
    file: "servizi/index.html",
    canonical: `${SITE_URL}servizi/`,
    schemaType: "WebPage",
    schemaId: `${SITE_URL}servizi/#webpage`
  },
  ...SERVICE_DEFINITIONS.map((service) => ({
    file: `servizi/${service.slug}/index.html`,
    canonical: `${SITE_URL}servizi/${service.slug}/`,
    schemaType: "WebPage",
    schemaId: `${SITE_URL}servizi/${service.slug}/#webpage`
  })),
  {
    file: "faq/index.html",
    canonical: `${SITE_URL}faq/`,
    schemaType: "WebPage",
    schemaId: `${SITE_URL}faq/#webpage`
  }
];
