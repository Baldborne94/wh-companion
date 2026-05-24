import { useState, useEffect, useRef } from "react";

// ─── COVER IMAGE ──────────────────────────────────────────────────────────────
// v2 bumped to bust cached "not found" results from before the Various-author fix
export const COVER_CACHE_PREFIX = "wh40k_cover_v2_";

export async function fetchBookCover(book) {
  const key = COVER_CACHE_PREFIX + book.id;
  const cached = localStorage.getItem(key);
  if(cached !== null) return cached; // "" = confirmed not found; url = cover

  const various = !book.author || /^various$/i.test(book.author.trim());

  // 0. Open Library ISBN endpoint — most reliable when we have a known ISBN
  if(book.isbn){
    try{
      const probe = await fetch(`https://covers.openlibrary.org/b/isbn/${book.isbn}-M.jpg?default=false`,{method:'HEAD'});
      if(probe.ok){
        const url = `https://covers.openlibrary.org/b/isbn/${book.isbn}-M.jpg`;
        localStorage.setItem(key, url);
        return url;
      }
    }catch{}
  }

  // 1. Try Open Library (better Black Library coverage, free, no key)
  try{
    const t = encodeURIComponent(book.title);
    let olUrl = `https://openlibrary.org/search.json?title=${t}&limit=1&fields=cover_i`;
    if(!various) olUrl += `&author=${encodeURIComponent(book.author)}`;
    const r = await fetch(olUrl);
    if(r.ok){
      const d = await r.json();
      const coverId = d.docs?.[0]?.cover_i;
      if(coverId){
        const url = `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`;
        localStorage.setItem(key, url);
        return url;
      }
    }
  }catch{ /* fall through to Google Books */ }

  // 2. Fallback: Google Books
  try{
    // For anthologies with no single author, use intitle: to avoid false positives
    const q = various
      ? encodeURIComponent(`intitle:"${book.title}"`)
      : encodeURIComponent(`"${book.title}" ${book.author}`);
    const r = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=1&fields=items(volumeInfo/imageLinks)`);
    if(!r.ok){ return r.status>=500 ? null : (localStorage.setItem(key,""), ""); }
    const d = await r.json();
    const thumb = d.items?.[0]?.volumeInfo?.imageLinks?.thumbnail || "";
    const url = thumb.replace("http://","https://").replace("&edge=curl","").replace("zoom=1","zoom=2");
    localStorage.setItem(key, url);
    return url;
  }catch{ return null; }
}

/**
 * CoverImage
 * Props:
 *   book        — book object (id, title, author)
 *   width       — number, default 60
 *   height      — number, default 90
 *   radius      — border-radius, default 4
 *   style       — extra style object
 *   accentColor — fallback gradient color (replaces FC[faction]||C.dim in 40K, spineColor(book) in AoS)
 */
export default function CoverImage({ book, width=60, height=90, radius=4, style={}, accentColor="#2a3850" }){
  const fc = accentColor;
  const [url, setUrl] = useState(()=> localStorage.getItem(COVER_CACHE_PREFIX+book.id) ?? null);
  const ref = useRef(null);

  useEffect(()=>{
    if(url !== null) return;
    const obs = new IntersectionObserver(([e])=>{
      if(e.isIntersecting){ obs.disconnect(); fetchBookCover(book).then(v=>{ if(v!==null) setUrl(v); }); }
    },{rootMargin:"300px"});
    if(ref.current) obs.observe(ref.current);
    return ()=>obs.disconnect();
  },[book.id]);

  const base = { width, height, borderRadius:radius, overflow:"hidden", flexShrink:0, ...style };

  if(url === null){
    return(
      <div ref={ref} style={{...base, background:`linear-gradient(160deg,${fc}cc,${fc}55)`, display:"flex", alignItems:"center", justifyContent:"center", padding:4}}>
        <span style={{fontFamily:"'Cinzel',serif", fontSize:Math.max(6,width*0.12), color:"rgba(255,255,255,0.75)", lineHeight:1.3, textAlign:"center", wordBreak:"break-word", overflow:"hidden"}}>{book.title}</span>
      </div>
    );
  }
  if(url===""){
    return <div style={{...base, background:`linear-gradient(160deg,${fc}cc,${fc}55)`, display:"flex", alignItems:"center", justifyContent:"center", padding:4}}><span style={{fontFamily:"'Cinzel',serif", fontSize:Math.max(6,width*0.12), color:"rgba(255,255,255,0.6)", lineHeight:1.3, textAlign:"center", wordBreak:"break-word", overflow:"hidden"}}>{book.title}</span></div>;
  }
  return(
    <div ref={ref} style={base}>
      <img src={url} alt={book.title} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}} onError={()=>setUrl("")}/>
    </div>
  );
}
