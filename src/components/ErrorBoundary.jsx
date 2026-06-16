import { Component } from 'react';

function isChunkError(error) {
  const msg = error?.message ?? '';
  return msg.includes('dynamically imported module') || msg.includes('Loading chunk') || msg.includes('Loading CSS chunk');
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
    // Stale service worker served old chunk hashes — force reload to pick up new build
    if (isChunkError(error)) {
      window.location.reload();
    }
  }
  render() {
    if (this.state.hasError) {
      const chunkErr = isChunkError(this.state.error);
      return (
        <div style={{
          display:'flex', flexDirection:'column', alignItems:'center',
          justifyContent:'center', minHeight:'40vh', gap:16, padding:32, textAlign:'center',
        }}>
          <div style={{fontSize:48}}>⚙</div>
          <div style={{fontFamily:"'Cinzel Decorative',serif", fontSize:18, color:'#c9a84c'}}>
            {this.props.title || 'Something went wrong'}
          </div>
          <div style={{fontSize:13, color:'#7a7060', lineHeight:1.6, maxWidth:280}}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </div>
          <button
            onClick={() => chunkErr ? window.location.reload() : this.setState({ hasError:false, error:null })}
            style={{background:'transparent', border:'1px solid #c9a84c55', borderRadius:8,
                    padding:'8px 20px', color:'#c9a84c', fontFamily:"'Cinzel',serif",
                    fontSize:11, letterSpacing:2, cursor:'pointer', textTransform:'uppercase'}}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
