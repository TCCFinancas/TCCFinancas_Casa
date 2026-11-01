import { useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, CalendarDays, ChevronLeft, ChevronRight, Download, FileText, Home, Plus, Search, Settings as SettingsIcon, TrendingDown, TrendingUp, WalletCards } from "lucide-react";
import { financeRepository } from "./services/financeRepository";
import { changeMonth, localDateISO, monthTitle } from "./utils/date";
import { centsToInput, formatMoney, parseMoneyToCents } from "./utils/money";
import { exportCsv, exportPdf } from "./utils/export";
import { Box, Card, Empty, TransactionList } from "./components/UI";
import TransactionModal from "./components/TransactionModal";
import FixedExpenses from "./components/FixedExpenses";
import Settings from "./components/Settings";
import { Login, FamilyChooser, FamilyPanel } from "./components/Auth";

const today = localDateISO();
const initialForm = (categories, people, type = "despesa") => ({ tipo: type, descricao: "", valor: "", categoria: type === "receita" && categories.includes("Salário") ? "Salário" : categories.includes("Mercado") ? "Mercado" : categories[0], responsavel: people[0], data: today, parcelas: 1 });
const total = (items, type) => items.filter((item) => !type || item.tipo === type).reduce((sum, item) => sum + item.valorCentavos, 0);

export default function App() {
  const [auth, setAuth] = useState(undefined);
  const [familyPanel, setFamilyPanel] = useState(false);
  const [choosingFamily, setChoosingFamily] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [families, setFamilies] = useState([]);
  const [avatars, setAvatars] = useState({});
  const [transactions, setTransactions] = useState([]);
  const [fixed, setFixed] = useState([]);
  const [people, setPeople] = useState(["Outros"]);
  const [categories, setCategories] = useState(["Outros"]);
  const [loading, setLoading] = useState(true);
  const [serverError, setServerError] = useState("");
  const hydrated = useRef(false);
  const [tab, setTab] = useState("Visão geral");
  const [modal, setModal] = useState(false);
  const [settings, setSettings] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [person, setPerson] = useState("Todos");
  const [type, setType] = useState("Todos");
  const [month, setMonth] = useState(today.slice(0, 7));
  const [notice, setNotice] = useState("");
  const [deleted, setDeleted] = useState(null);
  const [form, setForm] = useState(() => initialForm(categories, people));

  useEffect(() => { financeRepository.session().then((data) => { setAuth(data.user || null); setFamilies(data.families || []); }).catch(() => setAuth(null)); }, []);
  useEffect(() => {
    if (!auth) return;
    financeRepository.bootstrap().then((data) => {
      setTransactions(data.transactions);
      setFixed(data.fixed);
      setPeople(data.people);
      setCategories(data.categories);
      setAvatars(data.avatars || {});
      setAuth(data.user);
      setFamilies(data.families || []);
      setForm(initialForm(data.categories, data.people));
      hydrated.current = true;
      setLoading(false);
    }).catch(() => { setServerError("Não foi possível conectar ao servidor."); setLoading(false); });
  }, [auth?.id]);
  useEffect(() => { if (hydrated.current) financeRepository.saveTransactions(transactions).catch(() => setNotice("Erro ao salvar movimentações.")); }, [transactions]);
  useEffect(() => { if (hydrated.current) financeRepository.saveFixedExpenses(fixed).catch(() => setNotice("Erro ao salvar gastos fixos.")); }, [fixed]);
  useEffect(() => { if (hydrated.current) financeRepository.savePeople(people).catch(() => setNotice("Erro ao salvar responsáveis.")); }, [people]);
  useEffect(() => { if (hydrated.current) financeRepository.saveCategories(categories).catch(() => setNotice("Erro ao salvar categorias.")); }, [categories]);
  useEffect(() => { if (hydrated.current && auth?.permissoes.includes("gerenciar_cadastros")) financeRepository.saveAvatars(avatars).catch(() => setNotice("Erro ao salvar fotos.")); }, [avatars]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => { setNotice(""); setDeleted(null); }, 4200); return () => clearTimeout(timer); }, [notice]);

  const monthly = useMemo(() => transactions.filter((item) => item.data?.slice(0, 7) === month), [transactions, month]);
  const filtered = useMemo(() => monthly.filter((item) => person === "Todos" || item.responsavel === person).filter((item) => type === "Todos" || item.tipo === type).filter((item) => `${item.descricao}${item.categoria}${item.responsavel}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => b.data.localeCompare(a.data)), [monthly, person, type, search]);
  const previousMonth = changeMonth(month, -1);
  const previous = transactions.filter((item) => item.data?.slice(0, 7) === previousMonth);
  const income = total(monthly, "receita");
  const expenses = total(monthly, "despesa");
  const balance = income - expenses;
  const previousExpenses = total(previous, "despesa");
  const expenseChange = previousExpenses ? ((expenses - previousExpenses) / previousExpenses) * 100 : null;
  const dailyAverage = expenses / Math.max(1, new Set(monthly.filter((item) => item.tipo === "despesa").map((item) => item.data)).size);
  const savingsRate = income ? (balance / income) * 100 : 0;
  const biggest = [...monthly.filter((item) => item.tipo === "despesa")].sort((a, b) => b.valorCentavos - a.valorCentavos)[0];
  const byPerson = people.map((name) => ({ name, value: total(monthly.filter((item) => item.responsavel === name), "despesa") })).filter((item) => item.value > 0).sort((a, b) => b.value - a.value);
  const maxPerson = Math.max(...byPerson.map((item) => item.value), 1);
  const byCategory = Object.entries(monthly.filter((item) => item.tipo === "despesa").reduce((result, item) => ({ ...result, [item.categoria]: (result[item.categoria] || 0) + item.valorCentavos }), {})).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  const maxCategory = byCategory[0]?.value || 1;
  const title = monthTitle(month);
  const filterActive = search || person !== "Todos" || type !== "Todos";

  function openNew(transactionType = "despesa") { setEditing(null); setForm(initialForm(categories, people, transactionType)); setModal(true); }
  function openEdit(item) { setEditing(item.id); setForm({ ...item, valor: centsToInput(item.valorCentavos) }); setModal(true); }
  function saveTransaction(event) { event.preventDefault(); const value = parseMoneyToCents(form.valor); if (!form.descricao.trim() || value <= 0 || !form.data) return setNotice("Preencha descrição, valor e data corretamente."); if (!editing && auth.papel !== "admin" && form.data.slice(0,7) < today.slice(0,7)) return setNotice("Usuários comuns não podem adicionar despesas em meses anteriores."); const item = { tipo: form.tipo, descricao: form.descricao.trim(), valorCentavos: value, categoria: form.categoria, responsavel: form.responsavel, data: form.data }; const count=Math.min(100,Math.max(1,Number(form.parcelas||1))); setTransactions((current)=>{if(editing)return current.map(v=>v.id===editing?{...item,id:editing}:v);if(count===1)return[{...item,id:Date.now()},...current];const group=`parcelas-${Date.now()}`,[y,m,d]=item.data.split("-").map(Number),base=Math.floor(value/count),rest=value%count;const parts=Array.from({length:count},(_,i)=>{const date=new Date(y,m-1+i,d);return{...item,id:`${group}-${i+1}`,descricao:`${item.descricao} (${i+1}/${count})`,valorCentavos:base+(i<rest?1:0),data:`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`,parcelaGrupo:group,parcelaNumero:i+1,parcelaTotal:count}});return[...parts,...current]}); setModal(false); setNotice(editing ? "Movimentação atualizada." : count>1?`${count} parcelas criadas.`:"Movimentação adicionada."); }
  function removeTransaction(item) { const old=item.data.slice(0,7)<today.slice(0,7); if (old && !auth?.permissoes.includes("excluir_anteriores")) return setNotice("Sem permissão para excluir transações de meses anteriores."); if (!old && !auth?.permissoes.includes("excluir_atual")) return setNotice("Sem permissão para excluir esta transação."); setTransactions((current) => current.filter((value) => value.id !== item.id)); setDeleted(item); setNotice(`“${item.descricao}” foi excluída.`); }
  function undoDelete() { if (!deleted) return; setTransactions((current) => [deleted, ...current]); setDeleted(null); setNotice("Exclusão desfeita."); }
  function createFixedTransaction(item) { const day = String(Math.min(item.diaVencimento, new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate())).padStart(2, "0"); const fixedId = `${item.id}-${month}`; if (transactions.some((value) => value.fixedId === fixedId)) return; setTransactions((current) => [{ id: Date.now(), fixedId, tipo: "despesa", descricao: item.descricao, valorCentavos: item.valorCentavos, categoria: item.categoria, responsavel: item.responsavel, data: `${month}-${day}` }, ...current]); }

  async function switchFamily(id) {
    setLoading(true); setServerError(""); hydrated.current = false; setFamilyPanel(false); setChoosingFamily(false);
    try { const selected = await financeRepository.selectFamily(id); setAuth(selected.user); const data = await financeRepository.bootstrap(); setTransactions(data.transactions); setFixed(data.fixed); setPeople(data.people); setCategories(data.categories); setAvatars(data.avatars || {}); setFamilies(data.families || []); setForm(initialForm(data.categories, data.people)); hydrated.current = true; setLoading(false); }
    catch (error) { setServerError(error.message); setLoading(false); }
  }
  async function leaveCurrentFamily() { try { const data = await financeRepository.leaveFamily(); hydrated.current=false; setFamilies(data.families||[]); setFamilyPanel(false); setChoosingFamily(true); setAuth((current)=>({...current,familiaId:null,familiaNome:null,papel:null,permissoes:[]})); setTransactions([]); setFixed([]); } catch(error) { setNotice(error.message); } }
  async function logout() { await financeRepository.logout(); hydrated.current=false; setAuth(null); setFamilies([]); setTransactions([]); setFixed([]); }

  if (auth === undefined) return <div className="serverstate"><b>Verificando acesso...</b></div>;
  if (!auth) return <Login onAuthenticated={(data) => { setAuth(data.user); setFamilies(data.families || []); setLoading(true); }} />;
  if (!auth.familiaId || choosingFamily) return <FamilyChooser families={families} onChoose={switchFamily} onCreate={async (nome) => { await financeRepository.createFamily(nome); location.reload(); }} onLogout={() => setConfirmAction({title:"Sair da conta?",text:"Você precisará informar e-mail e senha novamente para acessar o sistema.",confirm:"Sair da conta",danger:true,onConfirm:logout})} />;
  if (loading) return <div className="serverstate"><b>Carregando Finanças da Casa...</b></div>;
  if (serverError) return <div className="serverstate"><b>{serverError}</b><button onClick={() => location.reload()}>Tentar novamente</button></div>;
  return <div>
    {notice && <div className="toast" role="status" aria-live="polite"><span>{notice}</span>{deleted && <button onClick={undoDelete}>Desfazer</button>}</div>}
    <header><div className="brand"><i><img src="/logo-financas.png" alt="" /></i><div><b>Finanças da Casa</b><small>Controle familiar compartilhado</small></div></div><div className="headeractions"><div className="accountgroup"><button className="userchip" onClick={() => setFamilyPanel(true)}><b>{auth.nome}</b><small>{auth.familiaNome} · {auth.papel}</small></button><button className="logoutbutton" onClick={() => setConfirmAction({title:"Sair da conta?",text:"Você continuará participando de todas as famílias, mas precisará entrar novamente.",confirm:"Sair da conta",danger:true,onConfirm:logout})}>Sair</button></div>{(auth.permissoes.includes("gerenciar_cadastros") || auth.permissoes.includes("alterar_fotos_responsaveis")) && <button className="iconbutton" onClick={() => setSettings(true)} aria-label="Gerenciar categorias e responsáveis" title="Cadastros"><SettingsIcon aria-hidden="true" /></button>}{auth.permissoes.includes("adicionar") && <button className="primary" onClick={() => openNew()}><Plus aria-hidden="true" /><span>Nova movimentação</span></button>}</div></header>
    <main>
      <div className="toolbar"><nav role="tablist">{["Visão geral", "Movimentações", ...(auth.permissoes.includes("gastos_fixos") ? ["Gastos fixos"] : []), ...(auth.permissoes.includes("relatorios") ? ["Relatórios"] : [])].map((item) => <button key={item} role="tab" aria-selected={tab === item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>)}</nav><div className="month"><button onClick={() => setMonth(changeMonth(month, -1))} aria-label="Mês anterior"><ChevronLeft /></button><CalendarDays aria-hidden="true" /><b>{title}</b><button onClick={() => setMonth(changeMonth(month, 1))} aria-label="Próximo mês"><ChevronRight /></button></div></div>
      <section className="cards"><Card title="Saldo do mês" value={formatMoney(balance)} icon={<WalletCards />} color={balance >= 0 ? "purple" : "red"} /><Card title="Receitas" value={formatMoney(income)} icon={<TrendingUp />} color="green" /><Card title="Despesas" value={formatMoney(expenses)} icon={<TrendingDown />} color="red" detail={expenseChange === null ? "Sem base no mês anterior" : `${expenseChange >= 0 ? "+" : ""}${expenseChange.toFixed(1)}% vs. mês anterior`} /><Card title="Movimentações" value={monthly.length} icon={<BarChart3 />} color="yellow" /></section>

      {tab === "Visão geral" && <><section className="indicators"><div><small>Média diária de gastos</small><b>{formatMoney(dailyAverage)}</b></div><div><small>Taxa de economia</small><b>{savingsRate.toFixed(1)}%</b></div><div><small>Maior despesa</small><b>{biggest ? formatMoney(biggest.valorCentavos) : formatMoney(0)}</b><em>{biggest?.descricao || "Sem despesas"}</em></div><div><small>Comparação mensal</small><b>{expenseChange === null ? "Sem dados" : `${expenseChange >= 0 ? "+" : ""}${expenseChange.toFixed(1)}%`}</b><em>nas despesas</em></div></section><section className="grid"><Box title="Gastos por categoria"><div className="bars">{byCategory.length ? byCategory.slice(0, 6).map((item) => <div key={item.name}><span><b>{item.name}</b><b>{formatMoney(item.value)}</b></span><em><i style={{ width: `${Math.max(6, item.value / maxCategory * 100)}%` }} /></em></div>) : <Empty />}</div></Box><Box title="Por responsável"><div className="people">{byPerson.map((item) => <div key={item.name}><strong>{item.name[0]}</strong><span><i><b>{item.name}</b><b>{formatMoney(item.value)}</b></i><em><u style={{ width: `${item.value / maxPerson * 100}%` }} /></em></span></div>)}</div></Box></section><Box title="Movimentações recentes"><TransactionList items={filtered.slice(0, 6)} onEdit={openEdit} onDelete={removeTransaction} /></Box></>}

      {tab === "Movimentações" && <Box title="Todas as movimentações"><div className="filters"><label><Search aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar..." aria-label="Buscar movimentações" /></label><select value={person} onChange={(event) => setPerson(event.target.value)} aria-label="Filtrar por responsável"><option>Todos</option>{people.map((item) => <option key={item}>{item}</option>)}</select><select value={type} onChange={(event) => setType(event.target.value)} aria-label="Filtrar por tipo"><option>Todos</option><option value="receita">Receitas</option><option value="despesa">Despesas</option></select></div><TransactionList items={filtered} onEdit={openEdit} onDelete={removeTransaction} /></Box>}

      {tab === "Gastos fixos" && <FixedExpenses items={fixed} setItems={setFixed} categories={categories} people={people} month={month} setNotice={setNotice} createTransaction={createFixedTransaction} />}

      {tab === "Relatórios" && <section className="report"><Box title={`Resumo de ${title}`}><div className="minis reportsummary"><Card title="Entradas" value={formatMoney(income)} color="green" /><Card title="Saídas" value={formatMoney(expenses)} color="red" /><Card title="Resultado" value={formatMoney(balance)} color="purple" /><Card title="Média diária" value={formatMoney(dailyAverage)} /><Card title="Maior despesa" value={biggest ? formatMoney(biggest.valorCentavos) : formatMoney(0)} detail={biggest?.descricao || "Sem despesas"}/><Card title="Comparação mensal" value={expenseChange===null?"Sem dados":`${expenseChange>=0?"+":""}${expenseChange.toFixed(1)}%`} /></div></Box><aside><Download aria-hidden="true" /><h2>Exportar relatório</h2><p>Escolha o relatório completo do mês ou apenas os filtros atuais.</p><button onClick={() => exportCsv(monthly, month, "completo")}>CSV completo</button><button className="secondaryexport" disabled={!filterActive} onClick={() => exportCsv(filtered, month, "filtrado")}>CSV filtrado {filterActive ? `(${filtered.length})` : ""}</button><button className="pdfbutton" onClick={() => exportPdf({ items: monthly, monthTitle: title, totals: { receitas: income, despesas: expenses, saldo: balance }, indicators: { mediaDiaria: dailyAverage, maiorDespesa: biggest?.valorCentavos || 0, comparacaoMensal: expenseChange === null ? "Sem dados" : `${expenseChange >= 0 ? "+" : ""}${expenseChange.toFixed(1)}%` } })}><FileText aria-hidden="true" />Baixar PDF</button>{!filterActive && <small>Para o CSV filtrado, aplique filtros na aba Movimentações.</small>}</aside></section>}
    </main>
    {modal && <TransactionModal form={form} setForm={setForm} editing={editing} categories={categories} people={people} onClose={() => setModal(false)} onSave={saveTransaction} />}
    {settings && <Settings onClose={() => setSettings(false)} people={people} setPeople={setPeople} categories={categories} setCategories={setCategories} transactions={transactions} fixed={fixed} setNotice={setNotice} avatars={avatars} setAvatars={setAvatars} canManage={auth.permissoes.includes("gerenciar_cadastros")} canPhotos={auth.permissoes.includes("alterar_fotos_responsaveis")} />}
    {familyPanel && <FamilyPanel current={auth} families={families} onClose={() => setFamilyPanel(false)} onChanged={setAuth} onSwitch={switchFamily} onShowChooser={() => { setFamilyPanel(false); setChoosingFamily(true); }} onLeave={() => setConfirmAction({title:"Sair desta família?",text:`Você perderá o acesso a ${auth.familiaNome}, mas os dados da família serão preservados.`,confirm:"Sair da família",danger:true,onConfirm:leaveCurrentFamily})} />}
    {confirmAction && <ConfirmDialog data={confirmAction} onClose={() => setConfirmAction(null)} />}
  </div>;
}

function ConfirmDialog({data,onClose}) { async function confirm(){onClose();await data.onConfirm();} return <div className="overlay confirmoverlay" onMouseDown={onClose}><section className="confirmdialog" role="alertdialog" aria-modal="true" onMouseDown={(e)=>e.stopPropagation()}><h2>{data.title}</h2><p>{data.text}</p><div className="confirmactions"><button onClick={onClose}>Cancelar</button><button className={data.danger?"dangerbutton":"primary"} onClick={confirm}>{data.confirm||"Confirmar"}</button></div></section></div>}
