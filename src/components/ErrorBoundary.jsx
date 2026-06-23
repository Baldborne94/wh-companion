import { Component } from 'react';
import { TRANSLATIONS } from '../data/i18n/translations';

function isChunkError(error) {
  const msg = error?.message ?? '';
  return msg.includes('dynamically imported module') || msg.includes('Loading chunk') || msg.includes('Loading CSS chunk');
}

// A stale service worker can strand a freshly-hashed lazy chunk (the section loads
// forever / renders blank). Purge caches + unregister the SW, then reload to pull a
// clean build. Guarded by the caller: only when online and only once per session.
async function healStaleCacheAndReload() {
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
    if (navigator.serviceWorker) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
  } catch { /* fall through to a plain reload */ }
  window.location.reload();
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info);
    // Stale service worker stranded a chunk hash. Self-heal once: clear caches +
    // unregister the SW, then reload for a clean build. Only when online — an
    // offline cache-miss must keep the error UI instead of nuking the offline cache.
    if (isChunkError(error) && navigator.onLine && !sessionStorage.getItem('wh_chunk_heal')) {
      try { sessionStorage.setItem('wh_chunk_heal', '1'); } catch {}
      healStaleCacheAndReload();
    }
  }
  render() {
    if (this.state.hasError) {
      const chunkErr = isChunkError(this.state.error);
      const lang = (typeof localStorage !== 'undefined' && localStorage.getItem('wh_language')) === 'it' ? 'it' : 'en';
      const tr = TRANSLATIONS[lang].login.error;
      return (
        <div style={{
          display:'flex', flexDirection:'column', alignItems:'center',
          justifyContent:'center', minHeight:'40vh', gap:16, padding:32, textAlign:'center',
        }}>
          <div style={{fontSize:48}}>⚙</div>
          <div style={{fontFamily:"'Cinzel Decorative',serif", fontSize:18, color:'#c9a84c'}}>
            {this.props.title || tr.title}
          </div>
          <div style={{fontSize:13, color:'#7a7060', lineHeight:1.6, maxWidth:280}}>
            {this.state.error?.message || tr.generic}
          </div>
          <button
            onClick={() => chunkErr ? healStaleCacheAndReload() : this.setState({ hasError:false, error:null })}
            style={{background:'transparent', border:'1px solid #c9a84c55', borderRadius:8,
                    padding:'8px 20px', color:'#c9a84c', fontFamily:"'Cinzel',serif",
                    fontSize:11, letterSpacing:2, cursor:'pointer', textTransform:'uppercase'}}
          >
            {tr.retry}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
