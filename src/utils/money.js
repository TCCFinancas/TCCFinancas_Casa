export function formatMoney(cents = 0) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export function parseMoneyToCents(value) {
  const clean = String(value ?? "").replace(/[^\d,.-]/g, "").trim();
  if (!clean) return 0;
  let normalized;
  if (clean.includes(",")) normalized = clean.replace(/\./g, "").replace(",", ".");
  else normalized = clean;
  const number = Number(normalized);
  return Number.isFinite(number) ? Math.round(number * 100) : 0;
}

export function centsToInput(cents = 0) {
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function maskMoney(value) {
  const digits = String(value).replace(/\D/g, "").slice(0, 12);
  if (!digits) return "";
  return (Number(digits) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
