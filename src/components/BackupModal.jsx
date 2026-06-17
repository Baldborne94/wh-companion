import { useRef, useState } from "react";
import { useLang } from "../lib/i18n.jsx";

// Backup / restore of the user's locally-stored data (reading statuses, ratings,
// notes, bookmarks, progress, painting timestamps, …). Everything lives in
// localStorage under the `wh40k_` prefix; the cover cache is excluded because it
// is large and regenerates itself.

const C = {
  bg: "#0a0905", surface: "#111009", card: "#16140f", border: "#2a2518",
  gold: "#c9a84c", goldDim: "#7a6330", red: "#b03030", green: "#4aaa6a",
  text: "#d4cbb8", muted: "#7a7060", dim: "#3a3428",
};

const COVER_PREFIX = "wh40k_cover_";

function gatherUserData() {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith("wh40k_") && !k.startsWith(COVER_PREFIX)) {
      out[k] = localStorage.getItem(k);
    }
  }
  return out;
}

export default function BackupModal({ user, onClose }) {
  const { t } = useLang();
  const fileRef = useRef(null);
  const [msg, setMsg] = useState(null);
  const [pending, setPending] = useState(null); // parsed backup awaiting confirmation

  const doExport = () => {
    const data = gatherUserData();
    const payload = {
      app: "wh-companion",
      version: 1,
      exportedAt: new Date().toISOString(),
      userId: user?.id || "anon",
      count: Object.keys(data).length,
      data,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wh40k-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setMsg({ type: "ok", text: t("backup.exportOk").replace("{n}", Object.keys(data).length) });
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (parsed?.app !== "wh-companion" || !parsed.data || typeof parsed.data !== "object") {
        throw new Error("bad");
      }
      setMsg(null);
      setPending(parsed);
    } catch {
      setMsg({ type: "err", text: t("backup.invalidFile") });
    }
  };

  const applyImport = () => {
    const oldUid = pending.userId;
    const newUid = user?.id || "anon";
    let n = 0;
    Object.entries(pending.data).forEach(([k, v]) => {
      const key = oldUid && oldUid !== newUid ? k.split(oldUid).join(newUid) : k;
      try { localStorage.setItem(key, v); n++; } catch {}
    });
    setPending(null);
    setMsg({ type: "ok", text: t("backup.importOk").replace("{n}", n) });
    setTimeout(() => window.location.reload(), 1200);
  };

  const btn = (extra) => ({
    border: `1px solid ${C.gold}`, borderRadius: 8, padding: "12px 16px",
    fontFamily: "'Cinzel',serif", fontSize: 12, letterSpacing: 1, cursor: "pointer",
    background: `${C.gold}18`, color: C.gold, width: "100%", textAlign: "center",
    ...extra,
  });

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 950, background: "rgba(0,0,0,0.88)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 380, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
        <div style={{ padding: "16px 16px 12px", background: C.surface, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Cinzel',serif", fontSize: 8, letterSpacing: 4, color: C.goldDim, textTransform: "uppercase", marginBottom: 3 }}>{t("backup.eyebrow")}</div>
            <div style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: 18, color: C.text }}>{t("backup.title")}</div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: `1px solid ${C.dim}`, borderRadius: 8, color: C.muted, padding: "6px 14px", fontFamily: "'Cinzel',serif", fontSize: 12, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          {!pending && <>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
              {t("backup.introPre")}<b style={{ color: C.text }}>{t("backup.introBold")}</b>{t("backup.introPost")}
            </div>

            <button onClick={doExport} style={btn()}>{t("backup.exportBtn")}</button>

            <input ref={fileRef} type="file" accept="application/json,.json" onChange={onFile} style={{ display: "none" }} />
            <button onClick={() => fileRef.current?.click()} style={btn({ background: "transparent", color: C.text, borderColor: C.dim })}>{t("backup.importBtn")}</button>

            {msg && (
              <div style={{ fontSize: 12, color: msg.type === "err" ? "#e05050" : C.green, fontFamily: "'Cinzel',serif", letterSpacing: 0.5 }}>
                {msg.text}
              </div>
            )}
          </>}

          {pending && <>
            <div style={{ fontSize: 12, color: C.text, lineHeight: 1.6 }}>
              {t("backup.pendingInfo")
                .replace("{date}", pending.exportedAt ? new Date(pending.exportedAt).toLocaleString() : t("backup.pendingDateUnknown"))
                .replace("{n}", Object.keys(pending.data).length)}
            </div>
            <div style={{ fontSize: 12, color: "#e0a050", lineHeight: 1.6, background: `${C.red}11`, border: `1px solid ${C.red}44`, borderRadius: 8, padding: "10px 12px" }}>
              {t("backup.overwriteWarnPre")}<b>{t("backup.overwriteWarnBold")}</b>{t("backup.overwriteWarnPost")}
            </div>
            <button onClick={applyImport} style={btn({ background: `${C.green}18`, color: C.green, borderColor: C.green })}>{t("backup.confirmBtn")}</button>
            <button onClick={() => setPending(null)} style={btn({ background: "transparent", color: C.muted, borderColor: C.dim })}>{t("backup.cancelBtn")}</button>
          </>}
        </div>
      </div>
    </div>
  );
}
