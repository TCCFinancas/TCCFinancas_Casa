import { CheckCircle2, Circle, Pencil, Plus, Trash2 } from "lucide-react";
import { formatMoney, maskMoney, parseMoneyToCents, centsToInput } from "../utils/money";
import { Box, Empty } from "./UI";
import { useState } from "react";

const empty = (categories, people) => ({ descricao: "", valor: "", categoria: categories[0] || "Outros", responsavel: people[0] || "Outros", diaVencimento: 10 });

export default function FixedExpenses({ items, setItems, categories, people, month, setNotice, createTransaction }) {
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(() => empty(categories, people));
  const [open, setOpen] = useState(false);
  const monthKey = month;
  function start(item) { setEditing(item?.id ?? null); setForm(item ? { ...item, valor: centsToInput(item.valorCentavos) } : empty(categories, people)); setOpen(true); }
  function save(event) {
    event.preventDefault(); const cents = parseMoneyToCents(form.valor);
    if (!form.descricao.trim() || cents <= 0) return setNotice("Preencha descrição e valor corretamente.");
    const value = { ...form, descricao: form.descricao.trim(), valorCentavos: cents, pagos: form.pagos || {} };
    setItems((current) => editing ? current.map((item) => item.id === editing ? { ...value, id: editing } : item) : [...current, { ...value, id: Date.now() }]);
    setOpen(false); setNotice(editing ? "Gasto fixo atualizado." : "Gasto fixo adicionado.");
  }
  function togglePaid(item) {
    const paid = !item.pagos?.[monthKey];
    setItems((current) => current.map((value) => value.id === item.id ? { ...value, pagos: { ...(value.pagos || {}), [monthKey]: paid } } : value));
    if (paid) createTransaction(item);
    setNotice(paid ? "Gasto marcado como pago e lançado no mês." : "Gasto marcado como pendente.");
  }
  return <Box title="Gastos fixos" actions={<button className="smallprimary" onClick={() => start()}><Plus aria-hidden="true" />Adicionar gasto fixo</button>}>
    {items.length ? <div className="fixedlist">{items.map((item) => { const paid = Boolean(item.pagos?.[monthKey]); return <div className="fixedrow" key={item.id}>
      <button className={`pay ${paid ? "paid" : ""}`} onClick={() => togglePaid(item)} aria-label={paid ? `Marcar ${item.descricao} como pendente` : `Marcar ${item.descricao} como pago`}>{paid ? <CheckCircle2 /> : <Circle />}</button>
      <span><b>{item.descricao}</b><small>Vence dia {item.diaVencimento} • {item.categoria} • {item.responsavel}</small></span><strong>{formatMoney(item.valorCentavos)}</strong><em>{paid ? "Pago" : "Pendente"}</em>
      <div className="rowactions"><button onClick={() => start(item)} aria-label={`Editar ${item.descricao}`}><Pencil /></button><button onClick={() => setItems((current) => current.filter((value) => value.id !== item.id))} aria-label={`Excluir ${item.descricao}`}><Trash2 /></button></div>
    </div>; })}</div> : <Empty text="Nenhum gasto fixo cadastrado." />}
    {open && <div className="overlay" onMouseDown={() => setOpen(false)}><form className="modalform compact" role="dialog" aria-modal="true" onSubmit={save} onMouseDown={(event) => event.stopPropagation()}><div className="formhead"><div><h2>{editing ? "Editar" : "Novo"} gasto fixo</h2><p>O pagamento pode ser controlado mês a mês.</p></div></div><div className="formgrid"><label className="wide">Descrição<input required value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></label><label>Valor<div className="moneyinput"><span>R$</span><input inputMode="numeric" value={form.valor} onChange={(e) => setForm({ ...form, valor: maskMoney(e.target.value) })} /></div></label><label>Dia do vencimento<input type="number" min="1" max="31" value={form.diaVencimento} onChange={(e) => setForm({ ...form, diaVencimento: Number(e.target.value) })} /></label><label>Categoria<select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label><label>Responsável<select value={form.responsavel} onChange={(e) => setForm({ ...form, responsavel: e.target.value })}>{people.map((item) => <option key={item}>{item}</option>)}</select></label></div><div className="actions"><button type="button" onClick={() => setOpen(false)}>Cancelar</button><button className="primary">Salvar</button></div></form></div>}
  </Box>;
}
