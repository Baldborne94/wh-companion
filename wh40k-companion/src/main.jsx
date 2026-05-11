import { useState, useEffect, StrictMode } from 'react';

// Re-apply tablet viewport scaling after orientation change
function applyTabletViewport(){
  if(navigator.maxTouchPoints < 1) return;
  const w = window.innerWidth;
  if(w <= 520) return;
  const s = Math.min(1.9, w / 430);
  const el = document.querySelector('meta[name=viewport]');
  if(el) el.content = `width=430,initial-scale=${s.toFixed(2)},user-scalable=no`;
}
window.addEventListener('orientationchange', () => setTimeout(applyTabletViewport, 150));
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import LoginGate from './components/LoginGate.jsx';
import { supabase } from './lib/supabase.js';

function Root() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => {
      setUser(s?.user ?? null);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (loading) return null;
  if (!user) return <LoginGate />;
  return <App />;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>
);