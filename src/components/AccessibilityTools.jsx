import { Accessibility, Contrast, Moon, RotateCcw, Sun, Type, X, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useState } from "react";

const KEY = "financas_acessibilidade";
const defaults = { theme: "light", zoom: 100, contrast: false, readable: false, reduceMotion: false, colorVision: "none" };

function loadPrefs() {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; }
  catch { return defaults; }
}

export default function AccessibilityTools() {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState(loadPrefs);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = prefs.theme;
    root.classList.toggle("high-contrast", prefs.contrast);
    root.classList.toggle("readable-font", prefs.readable);
    root.classList.toggle("reduce-motion", prefs.reduceMotion);
    root.dataset.colorVision = prefs.colorVision;
    root.style.setProperty("--access-zoom", `${prefs.zoom / 100}`);
    localStorage.setItem(KEY, JSON.stringify(prefs));
  }, [prefs]);

  const update = (name, value) => setPrefs((current) => ({ ...current, [name]: value }));
  const zoom = (delta) => update("zoom", Math.min(130, Math.max(90, prefs.zoom + delta)));
  const reset = () => setPrefs(defaults);

  return <>
    <button className="access-fab" onClick={() => setOpen(true)} aria-label="Abrir opções de acessibilidade" title="Acessibilidade">
      <Accessibility aria-hidden="true" />
    </button>
    {open && <div className="access-overlay" onMouseDown={() => setOpen(false)}>
      <section className="access-panel" role="dialog" aria-modal="true" aria-labelledby="access-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="access-head"><div><h2 id="access-title">Acessibilidade</h2><p>Personalize a visualização deste aparelho.</p></div><button onClick={() => setOpen(false)} aria-label="Fechar"><X /></button></div>
        <div className="access-option"><div><ZoomIn /><span><b>Tamanho da tela</b><small>Zoom atual: {prefs.zoom}%</small></span></div><div className="zoom-controls"><button onClick={() => zoom(-10)} disabled={prefs.zoom <= 90} aria-label="Diminuir zoom"><ZoomOut /></button><output>{prefs.zoom}%</output><button onClick={() => zoom(10)} disabled={prefs.zoom >= 130} aria-label="Aumentar zoom"><ZoomIn /></button></div></div>
        <button className="access-toggle" onClick={() => update("theme", prefs.theme === "dark" ? "light" : "dark")} aria-pressed={prefs.theme === "dark"}><span>{prefs.theme === "dark" ? <Sun /> : <Moon />}<span><b>Modo escuro</b><small>Reduz o brilho da interface</small></span></span><i>{prefs.theme === "dark" ? "Ativado" : "Desativado"}</i></button>
        <button className="access-toggle" onClick={() => update("contrast", !prefs.contrast)} aria-pressed={prefs.contrast}><span><Contrast /><span><b>Alto contraste</b><small>Destaca textos, botões e bordas</small></span></span><i>{prefs.contrast ? "Ativado" : "Desativado"}</i></button>
        <button className="access-toggle" onClick={() => update("readable", !prefs.readable)} aria-pressed={prefs.readable}><span><Type /><span><b>Fonte legível</b><small>Usa letras mais espaçadas</small></span></span><i>{prefs.readable ? "Ativado" : "Desativado"}</i></button>
        <button className="access-toggle" onClick={() => update("reduceMotion", !prefs.reduceMotion)} aria-pressed={prefs.reduceMotion}><span><Accessibility /><span><b>Reduzir animações</b><small>Evita movimentos desnecessários</small></span></span><i>{prefs.reduceMotion ? "Ativado" : "Desativado"}</i></button>
        <label className="access-select"><span><Contrast /><span><b>Modo de daltonismo</b><small>Ajusta as cores para melhorar a distinção visual</small></span></span><select value={prefs.colorVision} onChange={(event) => update("colorVision", event.target.value)} aria-label="Modo de daltonismo"><option value="none">Desativado</option><option value="protanopia">Protanopia</option><option value="deuteranopia">Deuteranopia</option><option value="tritanopia">Tritanopia</option></select></label>
        <button className="access-reset" onClick={reset}><RotateCcw /> Restaurar padrão</button>
      </section>
    </div>}
  </>;
}
