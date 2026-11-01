import jsPDF from "jspdf";
import { formatDateBR } from "./date";
import { formatMoney } from "./money";

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function exportCsv(items, month, suffix = "completo") {
  const rows = [
    ["Data", "Tipo", "Descrição", "Categoria", "Responsável", "Valor"],
    ...items.map((item) => [formatDateBR(item.data), item.tipo, item.descricao, item.categoria, item.responsavel, (item.valorCentavos / 100).toFixed(2).replace(".", ",")]),
  ];
  const csv = "\uFEFF" + rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";")).join("\n");
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `financas-${month}-${suffix}.csv`);
}

export function exportPdf({ items, monthTitle, totals, indicators = {} }) {
  const doc = new jsPDF();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Finanças da Casa", 14, 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Relatório: ${monthTitle}`, 14, 27);
  doc.text(`Receitas: ${formatMoney(totals.receitas)}`, 14, 38);
  doc.text(`Despesas: ${formatMoney(totals.despesas)}`, 14, 45);
  doc.text(`Saldo: ${formatMoney(totals.saldo)}`, 14, 52);
  doc.text(`Movimentações: ${items.length}`, 14, 59);
  doc.text(`Média diária: ${formatMoney(indicators.mediaDiaria || 0)}`, 105, 38);
  doc.text(`Maior despesa: ${formatMoney(indicators.maiorDespesa || 0)}`, 105, 45);
  doc.text(`Comparação mensal: ${indicators.comparacaoMensal || "Sem dados"}`, 105, 52);
  doc.line(14, 65, 196, 65);
  let y = 73;
  doc.setFontSize(9);
  items.forEach((item, index) => {
    if (y > 278) { doc.addPage(); y = 18; }
    const description = `${formatDateBR(item.data)} | ${item.descricao} | ${item.categoria} | ${item.responsavel}`;
    doc.text(description.slice(0, 80), 14, y);
    doc.text(`${item.tipo === "receita" ? "+" : "-"} ${formatMoney(item.valorCentavos)}`, 196, y, { align: "right" });
    y += 7;
    if (index < items.length - 1) doc.setDrawColor(225).line(14, y - 3, 196, y - 3);
  });
  doc.save(`relatorio-financas-${monthTitle.replaceAll(" ", "-")}.pdf`);
}
