import { ArrowDownCircle, ArrowUpCircle, X } from "lucide-react";
import { maskMoney } from "../utils/money";

export default function TransactionModal({ form, setForm, editing, categories, people, onClose, onSave }) {
  return <div className="overlay" onMouseDown={onClose}>
    <form className="modalform" role="dialog" aria-modal="true" aria-labelledby="transaction-title" onSubmit={onSave} onMouseDown={(event) => event.stopPropagation()}>
      <div className="formhead"><div><h2 id="transaction-title">{editing ? "Editar" : "Nova"} movimentação</h2><p>Preencha os dados do lançamento</p></div><button type="button" onClick={onClose} aria-label="Fechar janela"><X aria-hidden="true" /></button></div>
      <div className="switch">
        <button type="button" className={form.tipo === "despesa" ? "sel red" : ""} onClick={() => setForm({ ...form, tipo: "despesa", categoria: categories.includes("Mercado") ? "Mercado" : categories[0] })}><ArrowDownCircle aria-hidden="true" />Despesa</button>
        <button type="button" className={form.tipo === "receita" ? "sel green" : ""} onClick={() => setForm({ ...form, tipo: "receita", categoria: categories.includes("Salário") ? "Salário" : categories[0] })}><ArrowUpCircle aria-hidden="true" />Receita</button>
      </div>
      <div className="formgrid">
        <label className="wide">Descrição<input autoFocus maxLength="80" required value={form.descricao} onChange={(event) => setForm({ ...form, descricao: event.target.value })} placeholder="Ex.: Compra do mês" /></label>
        <label>Valor<div className="moneyinput"><span>R$</span><input inputMode="numeric" required value={form.valor} onChange={(event) => setForm({ ...form, valor: maskMoney(event.target.value) })} placeholder="0,00" /></div></label>
        <label>Data<input type="date" required value={form.data} onChange={(event) => setForm({ ...form, data: event.target.value })} /></label>
        <label>Categoria<select required value={form.categoria} onChange={(event) => setForm({ ...form, categoria: event.target.value })}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Responsável<select required value={form.responsavel} onChange={(event) => setForm({ ...form, responsavel: event.target.value })}>{people.map((item) => <option key={item}>{item}</option>)}</select></label>
        {!editing && form.tipo === "despesa" && <label>Parcelas<select value={form.parcelas || 1} onChange={(event) => setForm({ ...form, parcelas: Number(event.target.value) })}>{Array.from({length:100},(_,i)=>i+1).map(n=><option key={n} value={n}>{n===1?"À vista":`${n} meses`}</option>)}</select></label>}
      </div>
      <div className="actions"><button type="button" onClick={onClose}>Cancelar</button><button className="primary">{editing ? "Salvar" : "Adicionar"}</button></div>
    </form>
  </div>;
}
