const KEYS = {
  transactions: "financas-casa",
  fixed: "financas-casa-fixos",
  people: "financas-casa-responsaveis",
  categories: "financas-casa-categorias",
};

export function load(key, fallback) {
  try {
    const value = localStorage.getItem(KEYS[key]);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  localStorage.setItem(KEYS[key], JSON.stringify(value));
}

export function migrateTransactions(items) {
  return items.map((item) => ({
    ...item,
    valorCentavos: item.valorCentavos ?? Math.round(Number(item.valor || 0) * 100),
    valor: undefined,
  }));
}
