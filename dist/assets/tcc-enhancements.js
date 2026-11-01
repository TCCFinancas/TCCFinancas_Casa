(() => {
  const KEY = 'financas_acessibilidade';
  const readPrefs = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
  const applyColorVision = value => {
    document.documentElement.dataset.colorVision = value || 'none';
    const prefs = readPrefs(); prefs.colorVision = value || 'none';
    localStorage.setItem(KEY, JSON.stringify(prefs));
  };
  applyColorVision(readPrefs().colorVision || 'none');

  function openRename(currentName) {
    const overlay = document.createElement('div');
    overlay.className = 'mini-menu-overlay';
    overlay.innerHTML = `<form class="rename-mini-menu"><div class="rename-mini-menu-head"><h3>Renomear família</h3><button type="button" data-close aria-label="Fechar">×</button></div><label>Novo nome<input value="" maxlength="80" required></label><div class="rename-actions"><button type="button" data-close>Cancelar</button><button class="primary" type="submit">Salvar nome</button></div></form>`;
    const input = overlay.querySelector('input'); input.value = currentName;
    const close = () => overlay.remove();
    overlay.addEventListener('mousedown', event => { if (event.target === overlay) close(); });
    overlay.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', close));
    overlay.querySelector('form').addEventListener('submit', async event => {
      event.preventDefault(); const nome = input.value.trim(); if (!nome) return;
      const response = await fetch('/api/familias', { method:'PUT', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:JSON.stringify({nome}) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { alert(data.error || 'Não foi possível renomear a família.'); return; }
      location.reload();
    });
    document.body.appendChild(overlay); input.focus(); input.select();
  }

  function enhance() {
    document.querySelectorAll('.familybar').forEach(bar => {
      if (bar.dataset.renameEnhanced) return;
      const buttons = [...bar.querySelectorAll(':scope > button')];
      const rename = buttons.find(button => button.textContent.trim() === 'Renomear');
      const input = [...bar.querySelectorAll(':scope > input')].find(element => element.type === 'text' || !element.type);
      if (rename && input) {
        const currentName = () => input.value || bar.querySelector('.familyidentity b')?.textContent.trim() || '';
        input.style.display = 'none'; rename.textContent = 'Renomear família'; rename.classList.add('rename-family-button');
        const fresh = rename.cloneNode(true); rename.replaceWith(fresh);
        fresh.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); openRename(currentName()); });
        bar.dataset.renameEnhanced = 'true';
      }
    });
    document.querySelectorAll('.access-panel').forEach(panel => {
      if (panel.querySelector('.access-select')) return;
      const reset = panel.querySelector('.access-reset');
      const label = document.createElement('label'); label.className = 'access-select';
      label.innerHTML = '<span><b>Modo de daltonismo</b><small>Ajusta as cores para melhorar a distinção visual</small></span><select aria-label="Modo de daltonismo"><option value="none">Desativado</option><option value="protanopia">Protanopia</option><option value="deuteranopia">Deuteranopia</option><option value="tritanopia">Tritanopia</option></select>';
      const select = label.querySelector('select'); select.value = readPrefs().colorVision || 'none';
      select.addEventListener('change', () => applyColorVision(select.value));
      reset?.before(label);
      reset?.addEventListener('click', () => applyColorVision('none'));
    });
  }
  const observer = new MutationObserver(enhance); observer.observe(document.documentElement, {subtree:true, childList:true});
  document.addEventListener('DOMContentLoaded', enhance); enhance();
})();
