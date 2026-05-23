import { useState, useRef, useEffect, lazy, Suspense } from "react";
import { sb } from "../lib/sb";

const EpubReader = lazy(() => import("./EpubReader"));
const PdfReader  = lazy(() => import("./PdfReader"));

// ─── AoS COLOUR PALETTE ───────────────────────────────────────────────────────
export const AOS = {
  bg:      "#06080f",
  surface: "#0a0f1c",
  card:    "#0f1625",
  border:  "#1c2840",
  gold:    "#C9A227",
  goldDim: "#7a6015",
  blue:    "#5a8fc5",
  purple:  "#7a5aaa",
  text:    "#e0d8cc",
  muted:   "#607080",
  dim:     "#2a3850",
  green:   "#4aaa6a",
  red:     "#ff4444",
};

// ─── SHARED HELPERS ───────────────────────────────────────────────────────────
function SectionLabel({ children }) {
  return (
    <div style={{ fontFamily:"'Cinzel',serif", fontSize:8, letterSpacing:"0.4em",
      color:AOS.goldDim, textTransform:"uppercase", marginBottom:10 }}>
      {children}
    </div>
  );
}

function QuickCard({ icon, label, onClick, color }) {
  return (
    <button onClick={onClick} style={{
      background:AOS.card, border:`1px solid ${color}44`,
      borderLeft:`3px solid ${color}`, borderRadius:10,
      padding:"14px 16px", cursor:"pointer", textAlign:"left",
      display:"flex", alignItems:"center", gap:12,
      transition:"border-color 0.2s",
    }}>
      <span style={{ fontSize:28 }}>{icon}</span>
      <span style={{ fontFamily:"'Cinzel',serif", fontSize:13, color:AOS.text, letterSpacing:1 }}>{label}</span>
      <span style={{ marginLeft:"auto", color:AOS.muted, fontSize:14 }}>›</span>
    </button>
  );
}

// ─── AoS HOME PAGE ────────────────────────────────────────────────────────────
export function AoSHomePage({ user, setSection }) {
  return (
    <div style={{ paddingBottom:80, minHeight:"100%", background:AOS.bg }}>
      <style>{`
        @keyframes aosGlow {
          0%,100%{opacity:0.4;} 50%{opacity:0.8;}
        }
      `}</style>

      {/* Hero header */}
      <div style={{
        padding:"28px 20px 24px",
        borderBottom:`1px solid ${AOS.border}`,
        background:`linear-gradient(160deg,${AOS.blue}18,${AOS.bg})`,
        position:"relative", overflow:"hidden",
      }}>
        <div style={{ position:"absolute", top:0, left:0, right:0, height:2,
          background:`linear-gradient(to right,transparent,${AOS.gold},transparent)`,
          animation:"aosGlow 3s ease-in-out infinite" }}/>

        <div style={{ fontFamily:"'Cinzel',serif", fontSize:8, letterSpacing:5,
          color:AOS.goldDim, textTransform:"uppercase", marginBottom:8 }}>
          Mortal Realms
        </div>
        <h1 style={{ fontFamily:"'Cinzel Decorative',serif",
          fontSize:"clamp(20px,6vw,32px)", color:AOS.text, lineHeight:1.1, marginBottom:6 }}>
          Age of Sigmar
        </h1>
        <p style={{ fontSize:12, color:AOS.muted, lineHeight:1.7, maxWidth:340 }}>
          Gli Undici Regni Mortali. Dei che camminano tra i mortali.
          Eroi forgiati nell'immortalità. Scegli la tua fazione.
        </p>

        {user && (
          <div style={{ marginTop:16, display:"flex", alignItems:"center", gap:10 }}>
            {user.user_metadata?.avatar_url && (
              <img src={user.user_metadata.avatar_url} alt=""
                style={{ width:32, height:32, borderRadius:"50%", border:`1px solid ${AOS.gold}55` }}/>
            )}
            <div>
              <div style={{ fontFamily:"'Cinzel',serif", fontSize:10, color:AOS.gold, letterSpacing:1 }}>
                {user.user_metadata?.full_name || user.email}
              </div>
              <div style={{ fontSize:11, color:AOS.muted }}>Campione dei Regni Mortali</div>
            </div>
          </div>
        )}
      </div>

      {/* Quick access */}
      <div style={{ padding:"20px 16px", display:"flex", flexDirection:"column", gap:10 }}>
        <SectionLabel>Sezioni</SectionLabel>
        <QuickCard icon="📚" label="Libreria Regni" color={AOS.gold} onClick={() => setSection("library")}/>
        <QuickCard icon="⚔️" label="Lore & Risorse" color={AOS.blue} onClick={() => setSection("lore")}/>
        <QuickCard icon="🛡️" label="Path to Glory" color={AOS.purple} onClick={() => setSection("reading")}/>
        <QuickCard icon="🎨" label="Painting Tracker" color={AOS.green} onClick={() => setSection("painting")}/>
        <QuickCard icon="🎵" label="Musica" color={AOS.muted} onClick={() => setSection("music")}/>
      </div>

      {/* Factions */}
      <div style={{ padding:"0 16px 20px" }}>
        <SectionLabel>Grand Alliances</SectionLabel>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
          {[
            { name:"Order",       color:"#4a7fb5", desc:"Sigmar, Sylvaneth, Seraphon…",   icon:"⚡" },
            { name:"Chaos",       color:"#8B2020", desc:"Khorne, Nurgle, Tzeentch, Slaanesh…", icon:"⛧" },
            { name:"Death",       color:"#5a5aaa", desc:"Ossiarch, Soulblight, Nighthaunt…",   icon:"💀" },
            { name:"Destruction", color:"#5a7a20", desc:"Orruk, Ogroid, Gloomspite…",      icon:"💪" },
          ].map(f => (
            <div key={f.name} style={{
              background:`linear-gradient(135deg,${f.color}18,${AOS.card})`,
              border:`1px solid ${f.color}44`, borderLeft:`3px solid ${f.color}`,
              borderRadius:10, padding:"12px 14px",
            }}>
              <div style={{ fontSize:22, marginBottom:4 }}>{f.icon}</div>
              <div style={{ fontFamily:"'Cinzel',serif", fontSize:12, color:AOS.text, marginBottom:2 }}>{f.name}</div>
              <div style={{ fontSize:10, color:AOS.muted, lineHeight:1.4 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── AoS BOOK DATA ────────────────────────────────────────────────────────────
const AOS_BOOKS = [
  { id:"aos1",  title:"Realmslayer",                   author:"David Guymer",    series:"Gotrek Gurnisson",   type:"Audio Drama" },
  { id:"aos2",  title:"The Gates of Azyr",             author:"Chris Wraight",   series:"Realmgate Wars",     type:"Novel" },
  { id:"aos3",  title:"Spear of Shadows",              author:"Josh Reynolds",   series:"Eight Lamentations", type:"Novel" },
  { id:"aos4",  title:"Soul Wars",                     author:"Josh Reynolds",   series:"Nagash Trilogy",     type:"Novel" },
  { id:"aos5",  title:"Hamilcar: Champion of the Gods",author:"David Guymer",    series:"Standalone",         type:"Novel" },
  { id:"aos6",  title:"Dominion",                      author:"Darius Hinks",    series:"Standalone",         type:"Novel" },
  { id:"aos7",  title:"The Sundering Flood",           author:"Gav Thorpe",      series:"Standalone",         type:"Novel" },
  { id:"aos8",  title:"Godeater's Son",                author:"Noah Van Nguyen", series:"Standalone",         type:"Novel" },
  { id:"aos9",  title:"Black Pyramid",                 author:"Nick Horth",      series:"Standalone",         type:"Novel" },
  { id:"aos10", title:"The Court of the Blind King",   author:"David Guymer",    series:"Standalone",         type:"Novel" },
];

const AOS_SERIES = ["All", ...new Set(AOS_BOOKS.map(b => b.series))];

// ─── AoS BOOK DETAIL ─────────────────────────────────────────────────────────
function AoSBookDetail({ book, user, onBack, onOpenReader }) {
  const inp = useRef(null);
  const [ebookMeta,    setEbookMeta]    = useState(null);
  const [uploading,    setUploading]    = useState(false);
  const [uploadMsg,    setUploadMsg]    = useState("");
  const [deleteConfirm,setDeleteConfirm]= useState(false);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const files = await sb.get("ebook_files", `book_id=eq.${book.id}&limit=1`);
      if (files?.length && !files._error) {
        setEbookMeta(files[0]);
      } else {
        const cached = localStorage.getItem(`wh40k_ebook_${user.id}_${book.id}`);
        if (cached) { try { setEbookMeta(JSON.parse(cached)); } catch {} }
      }
    })();
  }, [book.id, user?.id]);

  const handleFileSelect = async e => {
    const file = e.target.files[0]; if (!file) return;
    if (!user?.id) { setUploadMsg("❌ Effettua il login per caricare ebook."); return; }
    setUploading(true); setUploadMsg("Caricamento…");
    const path = `${user.id}/${book.id}/${file.name}`;
    const ok = await sb.storage.upload(path, file);
    if (ok) {
      const meta = {
        user_id:user.id, book_id:book.id,
        file_name:file.name, file_path:path,
        file_type:file.name.toLowerCase().endsWith(".pdf") ? "pdf" : "epub",
      };
      await sb.upsert("ebook_files", meta, "user_id,book_id");
      localStorage.setItem(`wh40k_ebook_${user.id}_${book.id}`, JSON.stringify(meta));
      setEbookMeta(meta);
      setUploadMsg("✅ Caricato e sincronizzato!");
    } else { setUploadMsg("❌ Caricamento fallito — controlla Supabase."); }
    setUploading(false);
    setTimeout(() => setUploadMsg(""), 3000);
  };

  const handleDeleteEbook = async () => {
    if (!deleteConfirm) { setDeleteConfirm(true); setTimeout(() => setDeleteConfirm(false), 4000); return; }
    setDeleteConfirm(false);
    setUploadMsg("Rimozione…");
    if (ebookMeta?.file_path) await sb.storage.remove(ebookMeta.file_path);
    if (user?.id) await sb.del("ebook_files", `user_id=eq.${user.id}&book_id=eq.${book.id}`);
    if (user?.id) localStorage.removeItem(`wh40k_ebook_${user.id}_${book.id}`);
    setEbookMeta(null);
    setUploadMsg("✅ Ebook rimosso.");
    setTimeout(() => setUploadMsg(""), 2500);
  };

  const handleOpenReader = async () => {
    if (!ebookMeta) return;
    setUploadMsg("Apertura…");
    const url = await sb.storage.signedUrl(ebookMeta.file_path);
    if (!url) { setUploadMsg("❌ Impossibile aprire il file — ricaricalo."); return; }
    setUploadMsg("");
    onOpenReader({ book, url, fileType:ebookMeta.file_type });
  };

  return (
    <div style={{ minHeight:"100%", background:AOS.bg }}>
      {/* Back bar */}
      <div style={{ position:"sticky", top:0, zIndex:10, background:AOS.surface,
        borderBottom:`1px solid ${AOS.border}`, height:52,
        display:"flex", alignItems:"center", padding:"0 16px", gap:12 }}>
        <button onClick={onBack} style={{ background:"transparent", border:`1px solid ${AOS.dim}`,
          borderRadius:8, color:AOS.gold, padding:"7px 16px", cursor:"pointer",
          fontFamily:"'Cinzel',serif", fontSize:13, letterSpacing:1 }}>← Libreria</button>
        <div style={{ fontFamily:"'Cinzel',serif", fontSize:11, color:AOS.muted,
          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{book.series}</div>
      </div>

      {/* Hero */}
      <div style={{ background:`linear-gradient(160deg,${AOS.blue}44,${AOS.bg})`,
        borderBottom:`1px solid ${AOS.border}`, padding:"28px 20px 24px",
        display:"flex", gap:16, alignItems:"flex-start" }}>
        <div style={{ width:80, height:120, flexShrink:0, borderRadius:5,
          background:`linear-gradient(160deg,${AOS.blue}aa,${AOS.purple}aa)`,
          display:"flex", alignItems:"center", justifyContent:"center",
          boxShadow:"0 4px 16px rgba(0,0,0,0.5)", fontSize:32 }}>⚡</div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontFamily:"'Cinzel',serif", fontSize:10, color:AOS.goldDim,
            letterSpacing:3, textTransform:"uppercase", marginBottom:10 }}>{book.series}</div>
          <h1 style={{ fontFamily:"'Cinzel Decorative',serif",
            fontSize:"clamp(16px,5vw,24px)", color:AOS.text, lineHeight:1.2, marginBottom:6 }}>
            {book.title}
          </h1>
          <div style={{ color:AOS.muted, fontSize:14, fontStyle:"italic" }}>di {book.author}</div>
        </div>
      </div>

      <div style={{ padding:"20px 16px", display:"flex", flexDirection:"column", gap:14 }}>
        {/* Metadata */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
          {[{ l:"Tipo", v:book.type },{ l:"Serie", v:book.series }].map(m => (
            <div key={m.l} style={{ background:AOS.card, border:`1px solid ${AOS.border}`,
              borderRadius:8, padding:"10px" }}>
              <div style={{ fontFamily:"'Cinzel',serif", fontSize:8, color:AOS.goldDim,
                letterSpacing:2, textTransform:"uppercase", marginBottom:3 }}>{m.l}</div>
              <div style={{ color:AOS.text, fontSize:12, lineHeight:1.2 }}>{m.v}</div>
            </div>
          ))}
        </div>

        {/* Ebook card */}
        <div style={{ background:AOS.card,
          border:`2px solid ${ebookMeta ? AOS.gold : AOS.border}`,
          borderRadius:12, overflow:"hidden" }}>
          <div style={{ background:ebookMeta ? `${AOS.gold}18` : AOS.surface,
            padding:"14px 16px", borderBottom:`1px solid ${ebookMeta ? AOS.gold+"44" : AOS.border}`,
            display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize:20 }}>{ebookMeta ? "📖" : "📂"}</span>
            <div>
              <div style={{ fontFamily:"'Cinzel',serif", fontSize:11,
                color:ebookMeta ? AOS.gold : AOS.muted, fontWeight:700, letterSpacing:1 }}>
                {ebookMeta ? "Ebook Pronto" : "Nessun Ebook"}
              </div>
              {ebookMeta && <div style={{ fontSize:11, color:AOS.goldDim, marginTop:1 }}>{ebookMeta.file_name}</div>}
            </div>
          </div>
          <div style={{ padding:"16px" }}>
            {!user ? (
              <div style={{ textAlign:"center", padding:"24px 8px", color:AOS.muted, fontSize:13 }}>
                Effettua il login per caricare ebook.
              </div>
            ) : ebookMeta ? (
              <>
                {uploadMsg && (
                  <div style={{ color:uploadMsg.startsWith("❌") ? AOS.red : AOS.gold,
                    fontFamily:"'Cinzel',serif", fontSize:12, textAlign:"center", marginBottom:8 }}>
                    {uploadMsg}
                  </div>
                )}
                <button onClick={handleOpenReader} style={{ width:"100%", padding:"16px", borderRadius:10,
                  background:`linear-gradient(135deg,${AOS.gold},#7a6015)`, border:"none",
                  color:AOS.bg, fontFamily:"'Cinzel',serif", fontSize:15, letterSpacing:3,
                  textTransform:"uppercase", fontWeight:700, cursor:"pointer",
                  display:"flex", alignItems:"center", justifyContent:"center", gap:10 }}>
                  📖 Leggi
                </button>
                <div style={{ display:"flex", gap:8, marginTop:8 }}>
                  <button onClick={() => inp.current.click()} style={{ flex:1, padding:"10px",
                    borderRadius:8, background:"transparent", border:`1px solid ${AOS.dim}`,
                    color:AOS.muted, fontFamily:"'Cinzel',serif", fontSize:11, letterSpacing:1, cursor:"pointer" }}>
                    Sostituisci
                  </button>
                  <button onClick={handleDeleteEbook} style={{ flex:1, padding:"10px", borderRadius:8,
                    background:deleteConfirm ? `${AOS.red}22` : "transparent",
                    border:`1px solid ${deleteConfirm ? AOS.red : AOS.dim}`,
                    color:deleteConfirm ? AOS.red : AOS.muted,
                    fontFamily:"'Cinzel',serif", fontSize:11, letterSpacing:1, cursor:"pointer",
                    transition:"all 0.2s" }}>
                    {deleteConfirm ? "⚠️ Conferma" : "🗑 Rimuovi"}
                  </button>
                </div>
              </>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                <div style={{ color:AOS.muted, fontSize:13, lineHeight:1.6 }}>
                  Carica il tuo EPUB o PDF — salvato nel cloud, accessibile da qualsiasi dispositivo.
                </div>
                {(uploading || uploadMsg) && (
                  <div style={{ color:AOS.gold, fontFamily:"'Cinzel',serif", fontSize:12, textAlign:"center" }}>
                    {uploadMsg || "Caricamento…"}
                  </div>
                )}
                <button onClick={() => inp.current.click()} disabled={uploading} style={{
                  width:"100%", padding:"16px", borderRadius:10, background:"transparent",
                  border:`2px dashed ${AOS.goldDim}`, color:AOS.gold, fontFamily:"'Cinzel',serif",
                  fontSize:14, letterSpacing:2, textTransform:"uppercase", cursor:"pointer",
                  display:"flex", alignItems:"center", justifyContent:"center", gap:10,
                  opacity:uploading ? 0.5 : 1 }}>
                  📂 Carica EPUB o PDF
                </button>
              </div>
            )}
            <input ref={inp} type="file" accept=".epub,.pdf" style={{ display:"none" }} onChange={handleFileSelect}/>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── AoS LIBRARY ─────────────────────────────────────────────────────────────
export function AoSLibrarySection({ user }) {
  const [search,       setSearch]       = useState("");
  const [series,       setSeries]       = useState("All");
  const [tab,          setTab]          = useState("catalogue");
  const [detail,       setDetail]       = useState(null);
  const [reader,       setReader]       = useState(null);
  const [uploadedIds,  setUploadedIds]  = useState(new Set());

  // Load uploaded AoS book IDs from localStorage then DB
  useEffect(() => {
    if (!user?.id) return;
    const uid = user.id;
    // Local cache first (instant)
    const ids = new Set();
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(`wh40k_ebook_${uid}_`)) {
        const bid = key.slice(`wh40k_ebook_${uid}_`.length);
        if (AOS_BOOKS.some(b => b.id === bid)) ids.add(bid);
      }
    }
    setUploadedIds(new Set(ids));
    // DB sync
    sb.get("ebook_files", `user_id=eq.${uid}&select=book_id`).then(files => {
      if (files?.length && !files._error) {
        const dbIds = new Set(files.map(f => f.book_id).filter(id => AOS_BOOKS.some(b => b.id === id)));
        setUploadedIds(dbIds);
      }
    });
  }, [user?.id]);

  const handleOpenReader = ({ book, url, fileType }) => {
    setDetail(null);
    setReader({ book, url, fileType });
  };

  if (reader) {
    const { book, url, fileType } = reader;
    return (
      <Suspense fallback={
        <div style={{ position:"fixed", inset:0, background:AOS.bg,
          display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ fontSize:48, animation:"spin 2s linear infinite" }}>⚙</div>
        </div>
      }>
        {fileType === "pdf"
          ? <PdfReader url={url} title={book.title} bookId={book.id} userId={user?.id} onClose={() => setReader(null)}/>
          : <EpubReader url={url} title={book.title} bookId={book.id} userId={user?.id}
              initProgress={0} initChapterIndex={0} initPageIndex={0}
              onProgress={() => {}} onClose={() => setReader(null)}/>
        }
      </Suspense>
    );
  }

  if (detail) {
    return <AoSBookDetail book={detail} user={user}
      onBack={() => setDetail(null)} onOpenReader={handleOpenReader}/>;
  }

  const shelfBooks = AOS_BOOKS.filter(b => uploadedIds.has(b.id));
  const filtered = AOS_BOOKS.filter(b => {
    if (series !== "All" && b.series !== series) return false;
    if (search) {
      const q = search.toLowerCase();
      return b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q);
    }
    return true;
  });

  const TABS = [
    { id:"catalogue", label:"Catalogo" },
    { id:"shelf",     label:`Mia Libreria${shelfBooks.length > 0 ? ` (${shelfBooks.length})` : ""}` },
    { id:"info",      label:"Info" },
  ];

  return (
    <div style={{ paddingBottom:80, minHeight:"100%", background:AOS.bg }}>
      {/* Header */}
      <div style={{ padding:"20px 16px 0", borderBottom:`1px solid ${AOS.border}` }}>
        <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, letterSpacing:5,
          color:AOS.goldDim, textTransform:"uppercase", marginBottom:6 }}>Black Library</div>
        <h2 style={{ fontFamily:"'Cinzel Decorative',serif", fontSize:24, color:AOS.text, marginBottom:12 }}>
          Libreria Regni
        </h2>
        <div style={{ display:"flex", gap:20, marginBottom:14, flexWrap:"wrap" }}>
          {[
            { l:"Titoli",   v:AOS_BOOKS.length,     color:AOS.text },
            { l:"Ebook",    v:shelfBooks.length,     color:AOS.gold },
            { l:"Serie",    v:AOS_SERIES.length - 1, color:AOS.blue },
          ].map(s => (
            <div key={s.l}>
              <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:AOS.goldDim,
                letterSpacing:2, textTransform:"uppercase" }}>{s.l}</div>
              <div style={{ fontFamily:"'Cinzel Decorative',serif", fontSize:20, color:s.color }}>{s.v}</div>
            </div>
          ))}
        </div>
        <div style={{ display:"flex", gap:0 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex:1, padding:"10px",
              background:"transparent", border:"none",
              borderBottom:`2px solid ${tab === t.id ? AOS.gold : "transparent"}`,
              color: tab === t.id ? AOS.gold : AOS.muted,
              fontFamily:"'Cinzel',serif", fontSize:10, letterSpacing:1,
              cursor:"pointer", textTransform:"uppercase", whiteSpace:"nowrap",
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* ── MIA LIBRERIA TAB ── */}
      {tab === "shelf" && (
        shelfBooks.length === 0 ? (
          <div style={{ textAlign:"center", padding:"60px 20px",
            display:"flex", flexDirection:"column", alignItems:"center", gap:16 }}>
            <div style={{ fontSize:52 }}>📂</div>
            <div style={{ fontFamily:"'Cinzel',serif", fontSize:16, color:AOS.muted }}>Nessun ebook caricato</div>
            <div style={{ color:AOS.muted, fontSize:13, maxWidth:280, lineHeight:1.6, textAlign:"center" }}>
              Vai al Catalogo, seleziona un libro e carica il tuo file EPUB o PDF.
            </div>
            <button onClick={() => setTab("catalogue")} style={{
              background:`${AOS.gold}22`, border:`1px solid ${AOS.gold}`,
              borderRadius:8, padding:"10px 24px", color:AOS.gold,
              fontFamily:"'Cinzel',serif", fontSize:12, letterSpacing:2, cursor:"pointer" }}>
              Vai al Catalogo →
            </button>
          </div>
        ) : (
          <div style={{ padding:"12px 16px", display:"flex", flexDirection:"column", gap:8 }}>
            {shelfBooks.map(book => (
              <div key={book.id} onClick={() => setDetail(book)} style={{
                background:`linear-gradient(135deg,${AOS.blue}18,${AOS.card})`,
                border:`1px solid ${AOS.gold}55`, borderLeft:`3px solid ${AOS.gold}`,
                borderRadius:10, padding:"12px 14px", cursor:"pointer",
                display:"flex", gap:12, alignItems:"center",
              }}>
                <div style={{ width:44, height:64, flexShrink:0, borderRadius:3,
                  background:`linear-gradient(160deg,${AOS.blue}aa,${AOS.purple}aa)`,
                  display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>⚡</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:AOS.goldDim,
                    letterSpacing:1, textTransform:"uppercase", marginBottom:3 }}>{book.series} · {book.type}</div>
                  <div style={{ fontFamily:"'Cinzel',serif", fontSize:14, color:AOS.text,
                    lineHeight:1.3, marginBottom:2 }}>{book.title}</div>
                  <div style={{ fontSize:11, color:AOS.muted, fontStyle:"italic" }}>{book.author}</div>
                </div>
                <span style={{ background:`${AOS.gold}22`, border:`1px solid ${AOS.gold}44`,
                  borderRadius:4, padding:"2px 7px", fontFamily:"'Cinzel',serif",
                  fontSize:9, color:AOS.gold, letterSpacing:1, flexShrink:0 }}>EPUB</span>
              </div>
            ))}
          </div>
        )
      )}

      {/* ── INFO TAB ── */}
      {tab === "info" && (
        <div style={{ padding:"24px 16px", display:"flex", flexDirection:"column", gap:12 }}>
          <div style={{ background:AOS.card, border:`1px solid ${AOS.border}`, borderRadius:12, padding:"16px 18px" }}>
            <div style={{ fontFamily:"'Cinzel',serif", fontSize:10, color:AOS.gold,
              letterSpacing:2, marginBottom:10 }}>COME INIZIARE CON AoS</div>
            {[
              { t:"Sei nuovo?", d:"Inizia con The Gates of Azyr di Chris Wraight — breve, d'azione e introduce i Stormcast Eternals." },
              { t:"Ami Gotrek?", d:"Realmslayer è il bridge tra Fantasy e AoS. Essenziale per i fan del veterano nano." },
              { t:"Vuoi il lore profondo?", d:"Soul Wars di Josh Reynolds copre la guerra tra Nagash e Sigmar in modo epico." },
            ].map((item, i) => (
              <div key={i} style={{ marginBottom: i < 2 ? 10 : 0, paddingBottom: i < 2 ? 10 : 0,
                borderBottom: i < 2 ? `1px solid ${AOS.border}` : "none" }}>
                <div style={{ fontFamily:"'Cinzel',serif", fontSize:11, color:AOS.text, marginBottom:3 }}>{item.t}</div>
                <div style={{ fontSize:11, color:AOS.muted, lineHeight:1.5 }}>{item.d}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── CATALOGO TAB ── */}
      {tab === "catalogue" && (
        <>
          {/* Search */}
          <div style={{ padding:"12px 16px 0" }}>
            <div style={{ position:"relative" }}>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Cerca titolo o autore…"
                style={{ width:"100%", background:AOS.surface, border:`1px solid ${AOS.border}`,
                  borderRadius:10, color:AOS.text, padding:"11px 40px 11px 44px",
                  fontSize:14, outline:"none" }}/>
              <span style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)",
                color:AOS.muted, fontSize:17, pointerEvents:"none" }}>🔍</span>
              {search && (
                <button onClick={() => setSearch("")}
                  style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)",
                    background:"transparent", border:"none", color:AOS.muted, cursor:"pointer", fontSize:20 }}>×</button>
              )}
            </div>
          </div>

          {/* Series filter */}
          <div style={{ padding:"10px 16px", overflowX:"auto" }}>
            <div style={{ display:"flex", gap:6, minWidth:"max-content" }}>
              {AOS_SERIES.map(s => (
                <button key={s} onClick={() => setSeries(s)} style={{
                  background: series === s ? `${AOS.gold}22` : "transparent",
                  border:`1px solid ${series === s ? AOS.gold : AOS.dim}`,
                  borderRadius:20, padding:"6px 14px",
                  color: series === s ? AOS.gold : AOS.muted,
                  fontFamily:"'Cinzel',serif", fontSize:10, letterSpacing:1,
                  cursor:"pointer", whiteSpace:"nowrap",
                }}>{s}</button>
              ))}
            </div>
          </div>

          {/* Books list */}
          <div style={{ padding:"4px 16px", display:"flex", flexDirection:"column", gap:8 }}>
            {filtered.length === 0 ? (
              <div style={{ textAlign:"center", padding:"40px 20px", color:AOS.muted, fontStyle:"italic" }}>
                Nessun risultato.
              </div>
            ) : filtered.map(book => {
              const hasEbook = uploadedIds.has(book.id);
              return (
                <div key={book.id} onClick={() => setDetail(book)} style={{
                  background:`linear-gradient(135deg,${AOS.blue}12,${AOS.card})`,
                  border:`1px solid ${hasEbook ? AOS.gold + "55" : AOS.border}`,
                  borderLeft:`3px solid ${hasEbook ? AOS.gold : AOS.blue}`,
                  borderRadius:10, padding:"12px 14px", cursor:"pointer",
                  display:"flex", gap:12, alignItems:"flex-start",
                }}>
                  <div style={{ width:52, height:76, flexShrink:0, borderRadius:4,
                    background:`linear-gradient(160deg,${AOS.blue}99,${AOS.purple}99)`,
                    display:"flex", alignItems:"center", justifyContent:"center", fontSize:22 }}>⚡</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, color:AOS.goldDim,
                      letterSpacing:1, textTransform:"uppercase", marginBottom:4 }}>
                      {book.series} · {book.type}
                    </div>
                    <div style={{ fontFamily:"'Cinzel',serif", fontSize:14, color:AOS.text,
                      lineHeight:1.3, marginBottom:3 }}>{book.title}</div>
                    <div style={{ fontSize:11, color:AOS.muted, fontStyle:"italic" }}>{book.author}</div>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4, flexShrink:0 }}>
                    {hasEbook && (
                      <span style={{ background:`${AOS.gold}22`, border:`1px solid ${AOS.gold}44`,
                        borderRadius:4, padding:"2px 7px", fontFamily:"'Cinzel',serif",
                        fontSize:9, color:AOS.gold, letterSpacing:1 }}>EPUB</span>
                    )}
                    <span style={{ color:AOS.muted, fontSize:14 }}>›</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── AoS PATH TO GLORY (Crusade equiv.) ─────────────────────────────────────
export function AoSCrusadeSection() {
  const REALMS = [
    { name:"Aqshy",    sub:"Realm of Fire",    color:"#C0392B", icon:"🔥" },
    { name:"Ghyran",   sub:"Realm of Life",    color:"#4aaa6a", icon:"🌿" },
    { name:"Shyish",   sub:"Realm of Death",   color:"#7a5aaa", icon:"💀" },
    { name:"Azyr",     sub:"Realm of Heavens", color:"#5a8fc5", icon:"⭐" },
    { name:"Chamon",   sub:"Realm of Metal",   color:"#8a8a4a", icon:"⚙️" },
    { name:"Ghur",     sub:"Realm of Beasts",  color:"#8a5a2a", icon:"🦴" },
    { name:"Ulgu",     sub:"Realm of Shadow",  color:"#4a4a6a", icon:"🌑" },
    { name:"Hysh",     sub:"Realm of Light",   color:"#aaa060", icon:"✨" },
  ];

  return (
    <div style={{ paddingBottom:80, minHeight:"100%", background:AOS.bg }}>
      <div style={{ padding:"22px 16px 20px", borderBottom:`1px solid ${AOS.border}` }}>
        <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, letterSpacing:5,
          color:AOS.goldDim, textTransform:"uppercase", marginBottom:6 }}>Narrative Play</div>
        <h2 style={{ fontFamily:"'Cinzel Decorative',serif", fontSize:24, color:AOS.text, marginBottom:6 }}>
          Path to Glory
        </h2>
        <p style={{ fontSize:12, color:AOS.muted, lineHeight:1.7 }}>
          Traccia le tue campagne narrative nei Regni Mortali.
        </p>
      </div>

      <div style={{ margin:"20px 16px 0",
        background:`linear-gradient(135deg,${AOS.gold}10,${AOS.card})`,
        border:`1px solid ${AOS.gold}44`, borderRadius:12,
        padding:"20px 18px", textAlign:"center" }}>
        <div style={{ fontSize:40, marginBottom:12 }}>🛡️</div>
        <div style={{ fontFamily:"'Cinzel Decorative',serif", fontSize:16, color:AOS.text, marginBottom:8 }}>
          In Sviluppo
        </div>
        <div style={{ fontSize:12, color:AOS.muted, lineHeight:1.7, maxWidth:300, margin:"0 auto" }}>
          Il tracker di campagne Path to Glory — warband, vittorie e progressione narrativa — è in arrivo.
        </div>
      </div>

      <div style={{ padding:"20px 16px" }}>
        <div style={{ fontFamily:"'Cinzel',serif", fontSize:8, color:AOS.goldDim,
          letterSpacing:3, textTransform:"uppercase", marginBottom:12 }}>I Regni Mortali</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
          {REALMS.map(r => (
            <div key={r.name} style={{
              background:`linear-gradient(135deg,${r.color}18,${AOS.card})`,
              border:`1px solid ${r.color}44`, borderLeft:`3px solid ${r.color}`,
              borderRadius:10, padding:"12px 14px",
              display:"flex", alignItems:"center", gap:10,
            }}>
              <span style={{ fontSize:22 }}>{r.icon}</span>
              <div>
                <div style={{ fontFamily:"'Cinzel',serif", fontSize:12, color:AOS.text }}>{r.name}</div>
                <div style={{ fontSize:10, color:r.color, letterSpacing:0.5 }}>{r.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
