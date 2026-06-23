// reader namespace — EPUB + PDF reader UI strings.
export const reader = {
  en: {
    reader: {
      loading: "Loading…",
      failedToLoad: "Failed to load",
      close: "Close",
      back: "← Back",

      // Errors
      noDownloadLink: "No download link — please close and reopen the book.",
      httpError: "HTTP {status} — download link may have expired. Please close and reopen.",
      failedDownload: "Failed to download book",
      tookTooLong: "Book took too long to open — try re-uploading the file.",
      linkExpired: "Download link expired — close and reopen the book.",
      fileNotFound: "Book file not found — try re-uploading.",
      failedLoadBook: "Failed to load book",
      failedInit: "Failed to initialize reader",
      couldNotLoadPdf: "Could not load PDF",
      failedToLoadPdf: "Failed to load PDF",
      failedToLoadPdfWith: "Failed to load PDF: {msg}",

      // Header tooltips / controls
      contents: "Contents",
      addBookmark: "Add bookmark",
      removeBookmark: "Remove bookmark",
      bookmarks: "Bookmarks",
      highlights: "Highlights",
      noHighlights: "No highlights yet.",
      highlightHint: "Select text, then pick a colour.",
      settings: "Settings",
      fullscreen: "Fullscreen",
      exitFullscreen: "Exit fullscreen",
      resumeMusic: "Resume",
      pauseMusic: "Pause",
      stopMusic: "Stop music",

      // Bookmark flash + panel
      bookmarkSaved: "★ Bookmark saved",
      loadingContents: "Loading contents…",
      bookmarkHint: "Tap {star} in the toolbar to bookmark the current page. Tap a bookmark below to jump to it.",
      bookmarkHintPdf: "Tap {star} to bookmark the current page. Tap a bookmark to jump to it.",
      noBookmarks: "No bookmarks yet.",
      tapStarToAdd: "Tap ☆ to add one.",
      pressStarToAdd: "Press ☆ to add one.",
      bookmarkLabel: "Bookmark",
      delete: "Delete",
      page: "Page {n}",

      // Chapter footer (time-left estimate)
      minLeftInChapter: "{n} min left in chapter",
      lessThanMinLeft: "Less than a minute left",

      // Search-in-book
      search: "Search",
      searchPlaceholder: "Search in this book…",
      searching: "Searching…",
      noResults: "No results found.",
      searchResults: "{n} results",

      // Settings panel
      readingSettings: "Reading Settings",
      typeface: "Typeface",
      fontSize: "Font size — {n}px",
      lineSpacing: "Line spacing — {n}×",
      readingMode: "Reading mode",
      pages: "Pages",
      scroll: "Scroll",
      layout: "Layout",
      single: "Single",
      twoPage: "Two-page",
      margins: "Margins",
      marginNarrow: "Narrow",
      marginMedium: "Medium",
      marginWide: "Wide",
      theme: "Theme",
      brightness: "Brightness — {n}%",

      // PDF toolbar
      singlePage: "Single page",
      dualPage: "Dual page",
      scrollMode: "Scroll",
      resetZoom: "Reset zoom",
      fitWidth: "Fit width",
      fitPage: "Fit whole page",
      fullscreen: "Fullscreen",
      exitFullscreen: "Exit fullscreen",

      // Dictionary
      definition: "Definition",
      lookingUp: "Looking up “{word}”…",
      noDefinition: "No definition found for “{word}”",
      synonyms: "Syn:",

      // Lore picker
      searchOn: "Search on",
      fandomWiki: "📖 Fandom Wiki",
      lexicanum: "📜 Lexicanum",
      searchWiki: "Search on Wiki / Lexicanum ↗",
    },
  },
  it: {
    reader: {
      loading: "Caricamento…",
      failedToLoad: "Caricamento non riuscito",
      close: "Chiudi",
      back: "← Indietro",

      // Errors
      noDownloadLink: "Nessun link di download — chiudi e riapri il libro.",
      httpError: "HTTP {status} — il link di download potrebbe essere scaduto. Chiudi e riapri.",
      failedDownload: "Download del libro non riuscito",
      tookTooLong: "Il libro ha impiegato troppo tempo ad aprirsi — prova a ricaricare il file.",
      linkExpired: "Link di download scaduto — chiudi e riapri il libro.",
      fileNotFound: "File del libro non trovato — prova a ricaricarlo.",
      failedLoadBook: "Caricamento del libro non riuscito",
      failedInit: "Inizializzazione del lettore non riuscita",
      couldNotLoadPdf: "Impossibile caricare il PDF",
      failedToLoadPdf: "Caricamento del PDF non riuscito",
      failedToLoadPdfWith: "Caricamento del PDF non riuscito: {msg}",

      // Header tooltips / controls
      contents: "Indice",
      addBookmark: "Aggiungi segnalibro",
      removeBookmark: "Rimuovi segnalibro",
      bookmarks: "Segnalibri",
      highlights: "Evidenziazioni",
      noHighlights: "Ancora nessuna evidenziazione.",
      highlightHint: "Seleziona il testo, poi scegli un colore.",
      settings: "Impostazioni",
      fullscreen: "Schermo intero",
      exitFullscreen: "Esci da schermo intero",
      resumeMusic: "Riprendi",
      pauseMusic: "Pausa",
      stopMusic: "Ferma la musica",

      // Bookmark flash + panel
      bookmarkSaved: "★ Segnalibro salvato",
      loadingContents: "Caricamento indice…",
      bookmarkHint: "Tocca {star} nella barra per aggiungere un segnalibro alla pagina attuale. Tocca un segnalibro qui sotto per saltarci.",
      bookmarkHintPdf: "Tocca {star} per aggiungere un segnalibro alla pagina attuale. Tocca un segnalibro per saltarci.",
      noBookmarks: "Ancora nessun segnalibro.",
      tapStarToAdd: "Tocca ☆ per aggiungerne uno.",
      pressStarToAdd: "Premi ☆ per aggiungerne uno.",
      bookmarkLabel: "Segnalibro",
      delete: "Elimina",
      page: "Pagina {n}",

      // Chapter footer (time-left estimate)
      minLeftInChapter: "{n} min alla fine del capitolo",
      lessThanMinLeft: "Meno di un minuto alla fine",

      // Search-in-book
      search: "Cerca",
      searchPlaceholder: "Cerca in questo libro…",
      searching: "Ricerca in corso…",
      noResults: "Nessun risultato.",
      searchResults: "{n} risultati",

      // Settings panel
      readingSettings: "Impostazioni di lettura",
      typeface: "Carattere",
      fontSize: "Dimensione testo — {n}px",
      lineSpacing: "Interlinea — {n}×",
      readingMode: "Modalità di lettura",
      pages: "Pagine",
      scroll: "Scorrimento",
      layout: "Disposizione",
      single: "Singola",
      twoPage: "Doppia",
      margins: "Margini",
      marginNarrow: "Stretti",
      marginMedium: "Medi",
      marginWide: "Ampi",
      theme: "Tema",
      brightness: "Luminosità — {n}%",

      // PDF toolbar
      singlePage: "Pagina singola",
      dualPage: "Pagina doppia",
      scrollMode: "Scorrimento",
      resetZoom: "Reimposta zoom",
      fitWidth: "Adatta larghezza",
      fitPage: "Pagina intera",
      fullscreen: "Schermo intero",
      exitFullscreen: "Esci da schermo intero",

      // Dictionary
      definition: "Definizione",
      lookingUp: "Ricerca di “{word}”…",
      noDefinition: "Nessuna definizione trovata per “{word}”",
      synonyms: "Sin:",

      // Lore picker
      searchOn: "Cerca su",
      fandomWiki: "📖 Fandom Wiki",
      lexicanum: "📜 Lexicanum",
      searchWiki: "Cerca su Wiki / Lexicanum ↗",
    },
  },
};
