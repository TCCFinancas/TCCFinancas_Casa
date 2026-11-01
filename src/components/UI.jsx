import { ArrowDownCircle, ArrowUpCircle, Pencil, Trash2 } from "lucide-react";
import { formatDateBR } from "../utils/date";
import { formatMoney } from "../utils/money";

export function Card({ title, value, icon, color = "purple", detail }) {
  return <div className="card"><span><small>{title}</small><b>{value}</b>{detail && <em>{detail}</em>}</span>{icon && <i className={color} aria-hidden="true">{icon}</i>}</div>;
}

export function Box({ title, actions, children }) {
  return <section className="box"><div className="boxhead"><h2>{title}</h2>{actions}</div>{children}</section>;
}

export function Empty({ text = "Nenhuma movimentação encontrada." }) {
  return <p className="empty">{text}</p>;
}

export function TransactionList({ items, onEdit, onDelete }) {
  if (!items.length) return <Empty />;
  return <div className="list">{items.map((item) => (
    <div className="row" key={item.id}>
      <i className={item.tipo} aria-hidden="true">{item.tipo === "receita" ? <ArrowUpCircle /> : <ArrowDownCircle />}</i>
      <span className="rowinfo"><b>{item.descricao}</b><small>{item.categoria} • {formatDateBR(item.data)} • {item.responsavel}</small></span>
      <strong className={item.tipo}>{item.tipo === "receita" ? "+" : "-"}{formatMoney(item.valorCentavos)}</strong>
      <div className="rowactions">
        <button type="button" onClick={() => onEdit(item)} aria-label={`Editar ${item.descricao}`} title="Editar"><Pencil aria-hidden="true" /></button>
        <button type="button" onClick={() => onDelete(item)} aria-label={`Excluir ${item.descricao}`} title="Excluir"><Trash2 aria-hidden="true" /></button>
      </div>
    </div>
  ))}</div>;
}
