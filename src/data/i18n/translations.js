// App translations. Demo scope (PR 1): language toggle infrastructure +
// navigation labels + the onboarding tutorial. Further sections are migrated
// in follow-up PRs until the whole app is covered.
//
// Keys are namespaced and resolved by dot-path via lib/i18n.jsx `t()`.
// English is the source of truth and the fallback for any missing IT key.

export const TRANSLATIONS = {
  en: {
    language: { name: "English", toggle: "Change language", short: "EN" },
    nav: {
      home: "Home",
      library: "Library",
      lore: "Lore",
      crusade: "Crusade",
      pathToGlory: "Path to Glory",
      painting: "Painting",
      music: "Music",
    },
    header: {
      switchUniverse: "Switch Universe",
      companion: "Companion",
      achievements: "Achievements & Stats",
      backup: "Backup & Restore",
      logout: "LOGOUT",
      resume: "Resume",
      pause: "Pause",
      stopMusic: "Stop music",
      offline: "Offline — local data only",
    },
    onboarding: {
      skip: "Skip",
      back: "Back",
      next: "Next",
      begin: "Begin",
      slides: [
        {
          tag: "WELCOME",
          title: "The Scriptorium",
          body: "Your all-in-one companion for the 41st Millennium and the Mortal Realms. Track your reading, explore the lore, and manage your hobby — in one place.",
          bullets: [],
        },
        {
          tag: "LIBRARY",
          title: "Your Library",
          bullets: [
            "280+ books from Warhammer 40,000 & Age of Sigmar",
            "Upload your own EPUB & PDF ebooks",
            "Mark books as Read, Reading or Want to Read",
            "Filter by status, faction & series — and sort the catalogue",
            "Progress syncs automatically across all devices",
          ],
        },
        {
          tag: "CRUSADE · PATH TO GLORY",
          title: "Reading Guides",
          bullets: [
            "Horus Heresy Full & Essential reading order",
            "Age of Sigmar narrative reading guide",
            '"Next Up" shows what to read next in every saga',
            "Short stories & audio dramas included in the order",
          ],
        },
        {
          tag: "READER",
          title: "Read Anywhere",
          bullets: [
            "Read your ebooks directly in the app (EPUB & PDF)",
            "Bookmarks & auto-resume — pick up where you left off",
            "Open once online → cached locally for offline reading",
            "WH40K and AoS lore terms highlighted — tap to open the wiki",
          ],
        },
        {
          tag: "LORE",
          title: "Explore the Lore",
          bullets: [
            "Lore lookup: tap any highlighted term to open the wiki",
            "AoS Realms guide with direct Lexicanum links",
            "Both 40K Fandom wiki & AoS Lexicanum supported",
          ],
        },
        {
          tag: "MUSIC",
          title: "Ambient Soundscapes",
          bullets: [
            "Search any track or playlist on YouTube & Spotify",
            "Paste a YouTube or Spotify link to play it instantly",
            "Your own & followed playlists, full-length playback",
            "Mini player keeps the music going across the whole app",
          ],
        },
        {
          tag: "PAINTING",
          title: "Track Your Hobby",
          bullets: [
            "Track miniature painting progress step by step",
            "AI Color Advisor — photo-based scheme suggestions",
            "Citadel, AK & Army Painter paint picker with notes",
          ],
        },
        {
          tag: "RECORD & BACKUP",
          title: "Stats & Backup",
          bullets: [
            "Stats screen (🏆): monthly reading charts & streaks",
            "Achievements unlock as you read and paint",
            "Backup & restore (💾): export and import all your data",
            "Move to a new device without losing your progress",
          ],
        },
      ],
    },
  },

  it: {
    language: { name: "Italiano", toggle: "Cambia lingua", short: "IT" },
    nav: {
      home: "Home",
      library: "Libreria",
      lore: "Lore",
      crusade: "Crociata",
      pathToGlory: "Sentiero della Gloria",
      painting: "Pittura",
      music: "Musica",
    },
    header: {
      switchUniverse: "Cambia universo",
      companion: "Companion",
      achievements: "Obiettivi e statistiche",
      backup: "Backup e ripristino",
      logout: "ESCI",
      resume: "Riprendi",
      pause: "Pausa",
      stopMusic: "Ferma la musica",
      offline: "Offline — solo dati locali",
    },
    onboarding: {
      skip: "Salta",
      back: "Indietro",
      next: "Avanti",
      begin: "Inizia",
      slides: [
        {
          tag: "BENVENUTO",
          title: "The Scriptorium",
          body: "Il tuo compagno tutto-in-uno per il 41° Millennio e i Regni Mortali. Tieni traccia delle letture, esplora l'ambientazione e gestisci il tuo hobby — in un unico posto.",
          bullets: [],
        },
        {
          tag: "LIBRERIA",
          title: "La tua libreria",
          bullets: [
            "280+ libri da Warhammer 40.000 e Age of Sigmar",
            "Carica i tuoi ebook EPUB e PDF",
            "Segna i libri come Letto, In lettura o Da leggere",
            "Filtra per stato, fazione e serie — e ordina il catalogo",
            "I progressi si sincronizzano automaticamente su tutti i dispositivi",
          ],
        },
        {
          tag: "CROCIATA · SENTIERO DELLA GLORIA",
          title: "Guide di lettura",
          bullets: [
            "Ordine di lettura Completo ed Essenziale dell'Eresia di Horus",
            "Guida di lettura narrativa di Age of Sigmar",
            '"Prossimo" ti mostra cosa leggere dopo in ogni saga',
            "Racconti brevi e audiodrammi inclusi nell'ordine",
          ],
        },
        {
          tag: "LETTORE",
          title: "Leggi ovunque",
          bullets: [
            "Leggi i tuoi ebook direttamente nell'app (EPUB e PDF)",
            "Segnalibri e ripresa automatica — riprendi da dove avevi lasciato",
            "Apri una volta online → salvato in locale per la lettura offline",
            "Termini lore di WH40K e AoS evidenziati — tocca per aprire la wiki",
          ],
        },
        {
          tag: "LORE",
          title: "Esplora l'ambientazione",
          bullets: [
            "Ricerca lore: tocca qualsiasi termine evidenziato per aprire la wiki",
            "Guida ai Reami di AoS con link diretti a Lexicanum",
            "Supporta sia la wiki Fandom di 40K sia il Lexicanum di AoS",
          ],
        },
        {
          tag: "MUSICA",
          title: "Atmosfere sonore",
          bullets: [
            "Cerca qualsiasi brano o playlist su YouTube e Spotify",
            "Incolla un link YouTube o Spotify per riprodurlo subito",
            "Le tue playlist e quelle che segui, riproduzione completa",
            "Il mini player mantiene la musica attiva in tutta l'app",
          ],
        },
        {
          tag: "PITTURA",
          title: "Segui il tuo hobby",
          bullets: [
            "Tieni traccia della pittura delle miniature passo dopo passo",
            "Consulente Colori AI — suggerimenti di schemi basati su foto",
            "Selettore colori Citadel, AK e Army Painter con note",
          ],
        },
        {
          tag: "RESOCONTO E BACKUP",
          title: "Statistiche e Backup",
          bullets: [
            "Schermata statistiche (🏆): grafici di lettura mensili e serie consecutive",
            "Gli obiettivi si sbloccano man mano che leggi e dipingi",
            "Backup e ripristino (💾): esporta e importa tutti i tuoi dati",
            "Passa a un nuovo dispositivo senza perdere i progressi",
          ],
        },
      ],
    },
  },
};
