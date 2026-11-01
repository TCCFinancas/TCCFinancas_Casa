#!/usr/bin/env python3
import base64, hashlib, hmac, json, secrets, sqlite3, threading, time, re, os, ssl, smtplib
from datetime import datetime, timedelta
from http.cookies import SimpleCookie
from email.message import EmailMessage
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse
ROOT=Path(__file__).resolve().parent.parent; DB=ROOT/'backend/data/financas.db'; BACKUPS=ROOT/'backend/backups'; DIST=ROOT/'dist'; LOCK=threading.RLock(); SESSIONS={}; ATTEMPTS={}
ALL_PERMS=['visualizar','adicionar','editar','excluir_atual','excluir_anteriores','gerenciar_cadastros','alterar_fotos_responsaveis','gastos_fixos','relatorios','gerenciar_usuarios','alterar_propria_foto']
COMMON=['visualizar','adicionar','editar','excluir_atual','gastos_fixos','relatorios','alterar_propria_foto']
EMAIL_RE=re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')

def load_env():
 env={}
 path=ROOT/'.env'
 if path.exists():
  for raw in path.read_text(encoding='utf-8').splitlines():
   line=raw.strip()
   if line and not line.startswith('#') and '=' in line:
    key,value=line.split('=',1);env[key.strip()]=value.strip().strip('"').strip("'")
 return {**env,**os.environ}
ENV=load_env()
def setting(name,default=''):return ENV.get(name,default)
def smtp_enabled():return setting('SMTP_ENABLED','false').lower() in ('1','true','yes','on')
def public_base():return setting('APP_BASE_URL','http://127.0.0.1:3000').rstrip('/')
def send_email(to,subject,text,html=None):
 if not smtp_enabled():return {'sent':False,'reason':'SMTP desativado'}
 user=setting('SMTP_USER');password=setting('SMTP_APP_PASSWORD').replace(' ','');host=setting('SMTP_HOST','smtp.gmail.com');port=int(setting('SMTP_PORT','587'))
 if not user or not password or 'SEU_EMAIL' in user or 'SUA_SENHA' in password:raise RuntimeError('SMTP não configurado. Preencha SMTP_USER e SMTP_APP_PASSWORD no arquivo .env.')
 msg=EmailMessage();msg['Subject']=subject;msg['From']=f"{setting('SMTP_FROM_NAME','Finanças da Casa')} <{user}>";msg['To']=to;msg.set_content(text)
 if html:msg.add_alternative(html,subtype='html')
 context=ssl.create_default_context();security=setting('SMTP_SECURITY','starttls').lower()
 if security=='ssl':
  with smtplib.SMTP_SSL(host,port,context=context,timeout=20) as server:server.login(user,password);server.send_message(msg)
 else:
  with smtplib.SMTP(host,port,timeout=20) as server:server.ehlo();server.starttls(context=context);server.ehlo();server.login(user,password);server.send_message(msg)
 return {'sent':True}
def make_code():return f'{secrets.randbelow(1000000):06d}'
def token_hash(value):return hashlib.sha256(value.encode()).hexdigest()
def issue_token(c,user_id,kind,minutes=15):
 value=make_code();c.execute('DELETE FROM tokens_email WHERE usuario_id=? AND tipo=? AND usado_em IS NULL',(user_id,kind));c.execute('INSERT INTO tokens_email(id,usuario_id,tipo,token_hash,expira_em) VALUES(?,?,?,?,?)',('tok_'+secrets.token_hex(8),user_id,kind,token_hash(value),(datetime.now()+timedelta(minutes=minutes)).isoformat()));return value
def consume_token(c,email,kind,code):
 row=c.execute('SELECT t.*,u.id uid FROM tokens_email t JOIN usuarios u ON u.id=t.usuario_id WHERE lower(u.login)=? AND t.tipo=? AND t.token_hash=? AND t.usado_em IS NULL AND t.expira_em>? ORDER BY t.criado_em DESC LIMIT 1',(email.lower(),kind,token_hash(code),datetime.now().isoformat())).fetchone()
 if not row:raise ValueError('Código inválido ou expirado.')
 c.execute('UPDATE tokens_email SET usado_em=CURRENT_TIMESTAMP WHERE id=?',(row['id'],));return row['uid']
def throttle(key,limit=5,window=900):
 now=time.time();items=[x for x in ATTEMPTS.get(key,[]) if now-x<window]
 if len(items)>=limit:raise ValueError('Muitas tentativas. Aguarde alguns minutos.')
 items.append(now);ATTEMPTS[key]=items

def con():
 c=sqlite3.connect(DB,timeout=30);c.row_factory=sqlite3.Row;c.execute('PRAGMA journal_mode=WAL');c.execute('PRAGMA foreign_keys=ON');return c
def pwh(password,salt=None):
 salt=salt or secrets.token_bytes(16);d=hashlib.pbkdf2_hmac('sha256',password.encode(),salt,600000);return base64.b64encode(salt).decode()+':'+base64.b64encode(d).decode()
def pwok(password,stored):
 try:s,d=stored.split(':');return hmac.compare_digest(pwh(password,base64.b64decode(s)).split(':')[1],d)
 except:return False
def cols(c,table):return {r['name'] for r in c.execute(f'PRAGMA table_info({table})')}
def addcol(c,table,name,definition):
 if name not in cols(c,table):c.execute(f'ALTER TABLE {table} ADD COLUMN {name} {definition}')
def init():
 DB.parent.mkdir(parents=True,exist_ok=True);BACKUPS.mkdir(parents=True,exist_ok=True)
 with con() as c:
  c.executescript('''
  CREATE TABLE IF NOT EXISTS usuarios(id INTEGER PRIMARY KEY,login TEXT UNIQUE NOT NULL,senha_hash TEXT NOT NULL,nome TEXT NOT NULL,papel TEXT NOT NULL DEFAULT 'comum',permissoes TEXT NOT NULL DEFAULT '[]',avatar TEXT NOT NULL DEFAULT '',email_verificado INTEGER NOT NULL DEFAULT 1,criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,ultimo_acesso TEXT,ativo INTEGER NOT NULL DEFAULT 1);
  CREATE TABLE IF NOT EXISTS familias(id TEXT PRIMARY KEY,nome TEXT NOT NULL,slug TEXT UNIQUE NOT NULL,proprietario_id INTEGER NOT NULL,criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,ativa INTEGER NOT NULL DEFAULT 1,FOREIGN KEY(proprietario_id) REFERENCES usuarios(id));
  CREATE TABLE IF NOT EXISTS membros_familia(id INTEGER PRIMARY KEY,familia_id TEXT NOT NULL,usuario_id INTEGER NOT NULL,papel TEXT NOT NULL,permissoes TEXT NOT NULL DEFAULT '[]',status TEXT NOT NULL DEFAULT 'ativo',aceito_em TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(familia_id,usuario_id),FOREIGN KEY(familia_id) REFERENCES familias(id),FOREIGN KEY(usuario_id) REFERENCES usuarios(id));
  CREATE TABLE IF NOT EXISTS convites(id TEXT PRIMARY KEY,familia_id TEXT NOT NULL,email TEXT NOT NULL,papel TEXT NOT NULL,permissoes TEXT NOT NULL,token_hash TEXT UNIQUE NOT NULL,expira_em TEXT NOT NULL,aceito_em TEXT,criado_por INTEGER NOT NULL,FOREIGN KEY(familia_id) REFERENCES familias(id));
  CREATE TABLE IF NOT EXISTS responsaveis(id INTEGER PRIMARY KEY,nome TEXT NOT NULL,ordem INTEGER NOT NULL,avatar TEXT NOT NULL DEFAULT '',familia_id TEXT,UNIQUE(familia_id,nome));
  CREATE TABLE IF NOT EXISTS categorias(id INTEGER PRIMARY KEY,nome TEXT NOT NULL,ordem INTEGER NOT NULL,familia_id TEXT,UNIQUE(familia_id,nome));
  CREATE TABLE IF NOT EXISTS movimentacoes(id TEXT PRIMARY KEY,tipo TEXT NOT NULL,descricao TEXT NOT NULL,valor_centavos INTEGER NOT NULL,categoria TEXT NOT NULL,responsavel TEXT NOT NULL,data TEXT NOT NULL,gasto_fixo_ref TEXT,parcela_grupo TEXT,parcela_numero INTEGER,parcela_total INTEGER,familia_id TEXT);
  CREATE TABLE IF NOT EXISTS gastos_fixos(id TEXT PRIMARY KEY,descricao TEXT NOT NULL,valor_centavos INTEGER NOT NULL,categoria TEXT NOT NULL,responsavel TEXT NOT NULL,dia_vencimento INTEGER NOT NULL,pagamentos_json TEXT NOT NULL,familia_id TEXT);
  CREATE TABLE IF NOT EXISTS auditoria(id INTEGER PRIMARY KEY,familia_id TEXT,usuario_id INTEGER,acao TEXT NOT NULL,detalhes TEXT,criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS tokens_email(id TEXT PRIMARY KEY,usuario_id INTEGER NOT NULL,tipo TEXT NOT NULL,token_hash TEXT NOT NULL,expira_em TEXT NOT NULL,usado_em TEXT,criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(usuario_id) REFERENCES usuarios(id));
  ''')
  for name,definition in [('avatar',"TEXT NOT NULL DEFAULT ''"),('email_verificado','INTEGER NOT NULL DEFAULT 1'),('criado_em',"TEXT NOT NULL DEFAULT ''"),('ultimo_acesso','TEXT'),('ativo','INTEGER NOT NULL DEFAULT 1')]:addcol(c,'usuarios',name,definition)
  for table in ['responsaveis','categorias','movimentacoes','gastos_fixos']:addcol(c,table,'familia_id','TEXT')
  # Remove as restrições globais antigas de nome para permitir nomes iguais em famílias distintas.
  for table in ['responsaveis','categorias']:
   sql=(c.execute('SELECT sql FROM sqlite_master WHERE type="table" AND name=?',(table,)).fetchone()['sql'] or '')
   if 'nome TEXT UNIQUE' in sql:
    if table=='responsaveis':
     c.executescript('ALTER TABLE responsaveis RENAME TO responsaveis_antigos;CREATE TABLE responsaveis(id INTEGER PRIMARY KEY,nome TEXT NOT NULL,ordem INTEGER NOT NULL,avatar TEXT NOT NULL DEFAULT "",familia_id TEXT,UNIQUE(familia_id,nome));INSERT INTO responsaveis(id,nome,ordem,avatar,familia_id) SELECT id,nome,ordem,avatar,familia_id FROM responsaveis_antigos;DROP TABLE responsaveis_antigos;')
    else:c.executescript('ALTER TABLE categorias RENAME TO categorias_antigas;CREATE TABLE categorias(id INTEGER PRIMARY KEY,nome TEXT NOT NULL,ordem INTEGER NOT NULL,familia_id TEXT,UNIQUE(familia_id,nome));INSERT INTO categorias(id,nome,ordem,familia_id) SELECT id,nome,ordem,familia_id FROM categorias_antigas;DROP TABLE categorias_antigas;')
  for name,definition in [('parcela_grupo','TEXT'),('parcela_numero','INTEGER'),('parcela_total','INTEGER')]:addcol(c,'movimentacoes',name,definition)
  if not c.execute('SELECT COUNT(*) FROM usuarios').fetchone()[0]:
   c.executemany('INSERT INTO usuarios(login,senha_hash,nome,papel,permissoes) VALUES(?,?,?,?,?)',[('admin@local.casa',pwh('admin123'),'Administrador','admin',json.dumps(ALL_PERMS)),('usuario@local.casa',pwh('usuario123'),'Usuário da casa','comum',json.dumps(COMMON))])
  # Converte logins antigos em e-mails locais únicos sem invalidar as senhas existentes.
  for u in c.execute("SELECT id,login FROM usuarios WHERE login NOT LIKE '%@%'").fetchall():c.execute('UPDATE usuarios SET login=? WHERE id=?',(u['login'].lower()+'@local.casa',u['id']))
  if not c.execute('SELECT COUNT(*) FROM familias').fetchone()[0]:
   owner=c.execute("SELECT * FROM usuarios ORDER BY CASE WHEN papel='admin' THEN 0 ELSE 1 END,id LIMIT 1").fetchone();fid='fam_'+secrets.token_hex(6);c.execute('INSERT INTO familias(id,nome,slug,proprietario_id) VALUES(?,?,?,?)',(fid,'Minha Família','minha-familia-'+fid[-5:],owner['id']))
   for u in c.execute('SELECT * FROM usuarios').fetchall():
    papel='proprietario' if u['id']==owner['id'] else ('administrador' if u['papel']=='admin' else 'personalizado');perms=ALL_PERMS if papel in ('proprietario','administrador') else json.loads(u['permissoes'] or '[]');c.execute('INSERT INTO membros_familia(familia_id,usuario_id,papel,permissoes) VALUES(?,?,?,?)',(fid,u['id'],papel,json.dumps(perms)))
   for table in ['responsaveis','categorias','movimentacoes','gastos_fixos']:c.execute(f'UPDATE {table} SET familia_id=? WHERE familia_id IS NULL OR familia_id=""',(fid,))
  fid=c.execute('SELECT id FROM familias ORDER BY criado_em LIMIT 1').fetchone()['id']
  if not c.execute('SELECT COUNT(*) FROM responsaveis WHERE familia_id=?',(fid,)).fetchone()[0]:c.executemany('INSERT INTO responsaveis(nome,ordem,familia_id) VALUES(?,?,?)',[(x,i,fid) for i,x in enumerate(['Aline','Fernando','Gabriel','Lucas','Outros'])])
  if not c.execute('SELECT COUNT(*) FROM categorias WHERE familia_id=?',(fid,)).fetchone()[0]:c.executemany('INSERT INTO categorias(nome,ordem,familia_id) VALUES(?,?,?)',[(x,i,fid) for i,x in enumerate(['Alimentação','Mercado','Moradia','Água','Energia','Internet','Transporte','Saúde','Educação','Lazer','Salário','Outros'])])
def families_for(uid):return rows('SELECT f.id,f.nome,f.slug,m.papel,m.permissoes FROM familias f JOIN membros_familia m ON m.familia_id=f.id WHERE m.usuario_id=? AND m.status="ativo" AND f.ativa=1 ORDER BY f.nome',(uid,))
def rows(q,a=()):
 with con() as c:return [dict(x) for x in c.execute(q,a)]
def membership(uid,fid):
 with con() as c:return c.execute('SELECT m.*,f.nome familia_nome,f.proprietario_id FROM membros_familia m JOIN familias f ON f.id=m.familia_id WHERE m.usuario_id=? AND m.familia_id=? AND m.status="ativo" AND f.ativa=1',(uid,fid)).fetchone()
def public_user(u,m=None):
 perms=ALL_PERMS if m and m['papel'] in ('proprietario','administrador') else json.loads(m['permissoes'] or '[]') if m else []
 return {'id':u['id'],'email':u['login'],'login':u['login'],'nome':u['nome'],'avatar':u['avatar'] or '','papel':m['papel'] if m else None,'permissoes':perms,'familiaId':m['familia_id'] if m else None,'familiaNome':m['familia_nome'] if m else None}
def has(m,p):return bool(m and (m['papel'] in ('proprietario','administrador') or p in json.loads(m['permissoes'] or '[]')))
def audit(fid,uid,action,details=''):
 with con() as c:c.execute('INSERT INTO auditoria(familia_id,usuario_id,acao,detalhes) VALUES(?,?,?,?)',(fid,uid,action,details[:500]))
def boot(u,m):
 fid=m['familia_id'];tx=[{'id':r['id'],'tipo':r['tipo'],'descricao':r['descricao'],'valorCentavos':r['valor_centavos'],'categoria':r['categoria'],'responsavel':r['responsavel'],'data':r['data'],**({'fixedId':r['gasto_fixo_ref']} if r['gasto_fixo_ref'] else {}),**({'parcelaGrupo':r['parcela_grupo'],'parcelaNumero':r['parcela_numero'],'parcelaTotal':r['parcela_total']} if r['parcela_grupo'] else {})} for r in rows('SELECT * FROM movimentacoes WHERE familia_id=? ORDER BY data DESC',(fid,))];ps=rows('SELECT nome,avatar FROM responsaveis WHERE familia_id=? ORDER BY ordem,id',(fid,));fx=[{'id':r['id'],'descricao':r['descricao'],'valorCentavos':r['valor_centavos'],'categoria':r['categoria'],'responsavel':r['responsavel'],'diaVencimento':r['dia_vencimento'],'pagos':json.loads(r['pagamentos_json'])} for r in rows('SELECT * FROM gastos_fixos WHERE familia_id=?',(fid,))]
 return {'transactions':tx,'fixed':fx,'people':[x['nome'] for x in ps],'avatars':{x['nome']:x['avatar'] for x in ps if x['avatar']},'categories':[x['nome'] for x in rows('SELECT nome FROM categorias WHERE familia_id=? ORDER BY ordem,id',(fid,))],'user':public_user(u,m),'families':families_for(u['id'])}
def sync(kind,data,u,m):
 fid=m['familia_id'];uid=u['id']
 with LOCK,con() as c:
  if kind=='movimentacoes':
   old={r['id']:dict(r) for r in c.execute('SELECT * FROM movimentacoes WHERE familia_id=?',(fid,))};incoming={str(x['id']) for x in data};deleted=set(old)-incoming;current=datetime.now().strftime('%Y-%m');new=[x for x in data if str(x['id']) not in old]
   if new and not has(m,'adicionar'):raise PermissionError('Sem permissão para adicionar.')
   if any(str(x.get('data',''))[:7]<current for x in new) and m['papel'] not in ('proprietario','administrador'):raise PermissionError('Usuários comuns não podem adicionar em meses anteriores.')
   if any(old[x]['data'][:7]<current for x in deleted) and not has(m,'excluir_anteriores'):raise PermissionError('Sem permissão para excluir meses anteriores.')
   if any(old[x]['data'][:7]>=current for x in deleted) and not has(m,'excluir_atual'):raise PermissionError('Sem permissão para excluir.')
   c.execute('DELETE FROM movimentacoes WHERE familia_id=?',(fid,));c.executemany('INSERT INTO movimentacoes(id,tipo,descricao,valor_centavos,categoria,responsavel,data,gasto_fixo_ref,parcela_grupo,parcela_numero,parcela_total,familia_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',[(str(x['id']),x['tipo'],x['descricao'][:120],int(x['valorCentavos']),x['categoria'],x['responsavel'],x['data'],x.get('fixedId'),x.get('parcelaGrupo'),x.get('parcelaNumero'),x.get('parcelaTotal'),fid) for x in data])
  elif kind=='gastos-fixos':
   if not has(m,'gastos_fixos'):raise PermissionError('Sem permissão para gastos fixos.')
   c.execute('DELETE FROM gastos_fixos WHERE familia_id=?',(fid,));c.executemany('INSERT INTO gastos_fixos(id,descricao,valor_centavos,categoria,responsavel,dia_vencimento,pagamentos_json,familia_id) VALUES(?,?,?,?,?,?,?,?)',[(str(x['id']),x['descricao'][:120],int(x['valorCentavos']),x['categoria'],x['responsavel'],int(x['diaVencimento']),json.dumps(x.get('pagos',{}),ensure_ascii=False),fid) for x in data])
  elif kind in ('responsaveis','categorias'):
   if not has(m,'gerenciar_cadastros'):raise PermissionError('Sem permissão para cadastros.')
   old={r['nome']:r['avatar'] for r in c.execute('SELECT nome,avatar FROM responsaveis WHERE familia_id=?',(fid,))} if kind=='responsaveis' else {};c.execute(f'DELETE FROM {kind} WHERE familia_id=?',(fid,))
   if kind=='responsaveis':c.executemany('INSERT INTO responsaveis(nome,ordem,avatar,familia_id) VALUES(?,?,?,?)',[(str(x)[:60],i,old.get(str(x),''),fid) for i,x in enumerate(data)])
   else:c.executemany('INSERT INTO categorias(nome,ordem,familia_id) VALUES(?,?,?)',[(str(x)[:60],i,fid) for i,x in enumerate(data)])
  elif kind=='avatares':
   if not has(m,'alterar_fotos_responsaveis'):raise PermissionError('Sem permissão para fotos.')
   for n,v in data.items():c.execute('UPDATE responsaveis SET avatar=? WHERE familia_id=? AND nome=?',(v,fid,n))
  else:raise ValueError('Recurso inválido')
 audit(fid,uid,'sincronizar_'+kind)
def ensure_owner(c,fid,target,new_role):
 f=c.execute('SELECT proprietario_id FROM familias WHERE id=?',(fid,)).fetchone()
 if f and f['proprietario_id']==target and new_role!='proprietario':raise ValueError('Transfira a propriedade antes de alterar o proprietário.')
def backup(fid):
 f=BACKUPS/f"familia_{fid}_{datetime.now():%Y-%m-%d_%H-%M-%S}.db"
 with LOCK,con() as s,sqlite3.connect(f) as d:s.backup(d)
 return f.name
class H(SimpleHTTPRequestHandler):
 def __init__(self,*a,**k):super().__init__(*a,directory=str(DIST),**k)
 def out(self,x,status=200,cookie=None):
  b=json.dumps(x,ensure_ascii=False).encode();self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Cache-Control','no-store');
  if cookie:self.send_header('Set-Cookie',cookie)
  self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b)
 def body(self):
  n=int(self.headers.get('Content-Length','0'))
  if n>2_000_000:raise ValueError('Requisição muito grande')
  return json.loads(self.rfile.read(n) or b'null')
 def session(self):
  ck=SimpleCookie(self.headers.get('Cookie',''));t=ck.get('financas_session');s=SESSIONS.get(t.value) if t else None
  if not s or s['exp']<time.time():return None,None,s
  with con() as c:u=c.execute('SELECT * FROM usuarios WHERE id=? AND ativo=1',(s['uid'],)).fetchone()
  m=membership(s['uid'],s.get('fid')) if u and s.get('fid') else None
  return u,m,s
 def require(self,need_family=True):
  u,m,s=self.session()
  if not u:self.out({'error':'Autenticação obrigatória.'},401);return None,None,None
  if need_family and not m:self.out({'error':'Selecione uma família.'},409);return None,None,None
  return u,m,s
 def do_GET(self):
  p=urlparse(self.path).path
  if p=='/api/health':return self.out({'ok':True,'database':DB.exists()})
  if p=='/api/email/status':return self.out({'enabled':smtp_enabled(),'configured':bool(setting('SMTP_USER')) and bool(setting('SMTP_APP_PASSWORD'))})
  if p=='/api/session':
   u,m,s=self.session();return self.out({'authenticated':bool(u),'user':public_user(u,m) if u else None,'families':families_for(u['id']) if u else []})
  if p=='/api/bootstrap':
   u,m,s=self.require();return self.out(boot(u,m)) if u else None
  if p=='/api/membros':
   u,m,s=self.require()
   if not u or m['papel'] not in ('proprietario','administrador') and not has(m,'gerenciar_usuarios'):return self.out({'error':'Sem permissão.'},403)
   q="SELECT u.id,u.nome,u.login email,u.avatar,m.papel,m.permissoes FROM membros_familia m JOIN usuarios u ON u.id=m.usuario_id WHERE m.familia_id=? AND m.status='ativo' ORDER BY m.papel,u.nome";members=rows(q,(m['familia_id'],));return self.out({'members':[x|{'permissoes':ALL_PERMS if x['papel'] in ('proprietario','administrador') else json.loads(x['permissoes'] or '[]')} for x in members],'allPermissions':ALL_PERMS})
  if p.startswith('/api/'):return self.out({'error':'Rota não encontrada'},404)
  if not DIST.exists():return self.out({'error':'Execute npm install e npm run build'},503)
  if p!='/' and not (DIST/p.lstrip('/')).exists():self.path='/index.html'
  return super().do_GET()
 def do_POST(self):
  p=urlparse(self.path).path
  try:
   if p=='/api/cadastro':
    d=self.body();email=str(d.get('email','')).strip().lower();password=str(d.get('senha',''));name=str(d.get('nome','')).strip();family=str(d.get('familia','')).strip()
    if not EMAIL_RE.match(email):raise ValueError('E-mail inválido.');
    if len(password)<8:raise ValueError('A senha deve ter pelo menos 8 caracteres.')
    with con() as c:
     c.execute('INSERT INTO usuarios(login,senha_hash,nome,papel,permissoes,email_verificado) VALUES(?,?,?,?,?,0)',(email,pwh(password),name,'comum','[]'));uid=c.execute('SELECT last_insert_rowid()').fetchone()[0];fid='fam_'+secrets.token_hex(8);c.execute('INSERT INTO familias(id,nome,slug,proprietario_id) VALUES(?,?,?,?)',(fid,family or 'Minha Família',(family or 'familia').lower().replace(' ','-')+'-'+fid[-5:],uid));c.execute('INSERT INTO membros_familia(familia_id,usuario_id,papel,permissoes,status) VALUES(?,?,?,?,?)',(fid,uid,'proprietario',json.dumps(ALL_PERMS),'ativo'))
     c.executemany('INSERT INTO responsaveis(nome,ordem,familia_id) VALUES(?,?,?)',[(x,i,fid) for i,x in enumerate([name or 'Eu','Outros'])]);c.executemany('INSERT INTO categorias(nome,ordem,familia_id) VALUES(?,?,?)',[(x,i,fid) for i,x in enumerate(['Alimentação','Mercado','Moradia','Água','Energia','Internet','Transporte','Saúde','Educação','Lazer','Salário','Outros'])]);code=issue_token(c,uid,'confirmacao',30)
    sent=send_email(email,'Confirme seu e-mail - Finanças da Casa',f'Seu código de confirmação é: {code}\n\nEle expira em 30 minutos.',f'<h2>Confirme seu e-mail</h2><p>Seu código é:</p><p style="font-size:28px;font-weight:bold;letter-spacing:4px">{code}</p><p>Expira em 30 minutos.</p>')
    return self.out({'requiresVerification':True,'email':email,'emailSent':sent['sent'],**({'devCode':code} if not smtp_enabled() else {})},201)
   if p=='/api/email/confirmar':
    d=self.body();email=str(d.get('email','')).strip().lower();throttle('confirm:'+email)
    with con() as c:uid=consume_token(c,email,'confirmacao',str(d.get('codigo','')).strip());c.execute('UPDATE usuarios SET email_verificado=1 WHERE id=?',(uid,))
    return self.out({'ok':True})
   if p=='/api/email/reenviar':
    d=self.body();email=str(d.get('email','')).strip().lower();throttle('resend:'+email,3,1800);u=next(iter(rows('SELECT * FROM usuarios WHERE login=?',(email,))),None)
    if u and not u['email_verificado']:
     with con() as c:code=issue_token(c,u['id'],'confirmacao',30)
     result=send_email(email,'Novo código de confirmação - Finanças da Casa',f'Seu novo código é: {code}\n\nExpira em 30 minutos.')
     return self.out({'ok':True,'emailSent':result['sent'],**({'devCode':code} if not smtp_enabled() else {})})
    return self.out({'ok':True})
   if p=='/api/senha/solicitar':
    d=self.body();email=str(d.get('email','')).strip().lower();throttle('reset:'+email,3,1800);u=next(iter(rows('SELECT * FROM usuarios WHERE login=? AND ativo=1',(email,))),None)
    if u:
     with con() as c:code=issue_token(c,u['id'],'recuperacao',15)
     result=send_email(email,'Recuperação de senha - Finanças da Casa',f'Seu código de recuperação é: {code}\n\nEle expira em 15 minutos.',f'<h2>Recuperação de senha</h2><p>Use o código:</p><p style="font-size:28px;font-weight:bold;letter-spacing:4px">{code}</p><p>Expira em 15 minutos.</p>')
     return self.out({'ok':True,'emailSent':result['sent'],**({'devCode':code} if not smtp_enabled() else {})})
    return self.out({'ok':True})
   if p=='/api/senha/redefinir':
    d=self.body();email=str(d.get('email','')).strip().lower();password=str(d.get('senha',''));throttle('reset-confirm:'+email)
    if len(password)<8:raise ValueError('A senha deve ter pelo menos 8 caracteres.')
    with con() as c:uid=consume_token(c,email,'recuperacao',str(d.get('codigo','')).strip());c.execute('UPDATE usuarios SET senha_hash=? WHERE id=?',(pwh(password),uid))
    return self.out({'ok':True})
   if p=='/api/login':
    d=self.body();email=str(d.get('email') or d.get('login','')).strip().lower();u=next(iter(rows('SELECT * FROM usuarios WHERE login=? AND ativo=1',(email,))),None)
    if not u or not pwok(str(d.get('senha','')),u['senha_hash']):time.sleep(.4);return self.out({'error':'E-mail ou senha inválidos.'},401)
    if not u['email_verificado']:return self.out({'error':'Confirme seu e-mail antes de entrar.','requiresVerification':True,'email':email},403)
    fs=families_for(u['id']);fid=fs[0]['id'] if len(fs)==1 else None;token=secrets.token_urlsafe(32);SESSIONS[token]={'uid':u['id'],'fid':fid,'exp':time.time()+86400}
    with con() as c:c.execute('UPDATE usuarios SET ultimo_acesso=CURRENT_TIMESTAMP WHERE id=?',(u['id'],))
    return self.out({'user':public_user(u,membership(u['id'],fid)),'families':fs},cookie=f'financas_session={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400')
   if p=='/api/logout':return self.out({'ok':True},cookie='financas_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0')
   if p=='/api/familias':
    u,m,s=self.require(False);d=self.body();name=str(d.get('nome','')).strip();fid='fam_'+secrets.token_hex(8)
    with con() as c:
     c.execute('INSERT INTO familias(id,nome,slug,proprietario_id) VALUES(?,?,?,?)',(fid,name,name.lower().replace(' ','-')+'-'+fid[-5:],u['id']));c.execute('INSERT INTO membros_familia(familia_id,usuario_id,papel,permissoes) VALUES(?,?,?,?)',(fid,u['id'],'proprietario',json.dumps(ALL_PERMS)))
     c.executemany('INSERT INTO responsaveis(nome,ordem,familia_id) VALUES(?,?,?)',[(u['nome'],0,fid),('Outros',1,fid)]);c.executemany('INSERT INTO categorias(nome,ordem,familia_id) VALUES(?,?,?)',[(x,i,fid) for i,x in enumerate(['Alimentação','Mercado','Moradia','Água','Energia','Internet','Transporte','Saúde','Educação','Lazer','Salário','Outros'])])
    s['fid']=fid;return self.out({'familyId':fid,'families':families_for(u['id'])},201)
   if p=='/api/convites':
    u,m,s=self.require();
    if not u or m['papel'] not in ('proprietario','administrador'):return self.out({'error':'Sem permissão.'},403)
    d=self.body();alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';token=''.join(secrets.choice(alphabet) for _ in range(8));tid='inv_'+secrets.token_hex(8);role=d.get('papel','personalizado');perms=ALL_PERMS if role=='administrador' else [x for x in d.get('permissoes',[]) if x in ALL_PERMS];exp=(datetime.now()+timedelta(days=7)).isoformat()
    invite_email=str(d['email']).strip().lower()
    with con() as c:c.execute('INSERT INTO convites(id,familia_id,email,papel,permissoes,token_hash,expira_em,criado_por) VALUES(?,?,?,?,?,?,?,?)',(tid,m['familia_id'],invite_email,role,json.dumps(perms),hashlib.sha256(token.encode()).hexdigest(),exp,u['id']))
    accept_url=public_base()+'/';result=send_email(invite_email,f'Convite para {m["familia_nome"]} - Finanças da Casa',f'Você foi convidado para participar de {m["familia_nome"]}.\n\nCódigo: {token}\n\nEntre em {accept_url} com este e-mail e use o código. O convite expira em 7 dias.',f'<h2>Convite para {m["familia_nome"]}</h2><p>Código do convite:</p><p style="font-size:20px;font-weight:bold;overflow-wrap:anywhere">{token}</p><p><a href="{accept_url}">Abrir Finanças da Casa</a></p><p>Válido por 7 dias.</p>')
    return self.out({'emailSent':result['sent'],'expiraEm':exp,**({'token':token} if not result['sent'] else {})},201)
   if p=='/api/convites/aceitar':
    u,m,s=self.require(False);d=self.body();th=hashlib.sha256(str(d.get('token','')).encode()).hexdigest()
    with con() as c:
     inv=c.execute('SELECT * FROM convites WHERE token_hash=? AND aceito_em IS NULL AND expira_em>?',(th,datetime.now().isoformat())).fetchone()
     if not inv or inv['email']!=u['login'].lower():raise ValueError('Convite inválido ou destinado a outro e-mail.')
     c.execute('INSERT OR REPLACE INTO membros_familia(familia_id,usuario_id,papel,permissoes,status) VALUES(?,?,?,?,"ativo")',(inv['familia_id'],u['id'],inv['papel'],inv['permissoes']));c.execute('UPDATE convites SET aceito_em=CURRENT_TIMESTAMP WHERE id=?',(inv['id'],));s['fid']=inv['familia_id']
    return self.out({'ok':True})
   if p=='/api/email/teste':
    u,m,s=self.require()
    if not u or m['papel']!='proprietario':return self.out({'error':'Somente o proprietário pode testar o e-mail.'},403)
    result=send_email(u['login'],'Teste SMTP - Finanças da Casa','Configuração SMTP funcionando corretamente.')
    return self.out({'ok':True,'emailSent':result['sent']})
   if p=='/api/backup':
    u,m,s=self.require();return self.out({'arquivo':backup(m['familia_id'])},201) if u else None
   self.out({'error':'Rota não encontrada'},404)
  except sqlite3.IntegrityError:return self.out({'error':'Este e-mail já está cadastrado.'},409)
  except Exception as e:self.out({'error':str(e)},400)
 def do_PUT(self):
  p=urlparse(self.path).path
  try:
   if p=='/api/familia-selecionada':
    u,m,s=self.require(False);fid=str(self.body().get('familiaId'));newm=membership(u['id'],fid)
    if not newm:return self.out({'error':'Você não participa desta família.'},403)
    s['fid']=fid;return self.out({'user':public_user(u,newm)})
   u,m,s=self.require()
   if not u:return
   if p.startswith('/api/') and p.endswith('/sincronizar'):sync(p.split('/')[2],self.body(),u,m);return self.out({'ok':True})
   if p=='/api/minha-foto':
    if not has(m,'alterar_propria_foto'):return self.out({'error':'Sem permissão.'},403)
    avatar=str(self.body().get('avatar',''))
    with con() as c:c.execute('UPDATE usuarios SET avatar=? WHERE id=?',(avatar,u['id']))
    return self.out({'ok':True})
   if p=='/api/membros':
    if m['papel'] not in ('proprietario','administrador') and not has(m,'gerenciar_usuarios'):return self.out({'error':'Sem permissão.'},403)
    d=self.body();target=int(d['id']);role=d.get('papel','personalizado');ensure_owner(con(),m['familia_id'],target,role);perms=ALL_PERMS if role in ('proprietario','administrador') else [x for x in d.get('permissoes',[]) if x in ALL_PERMS]
    with con() as c:c.execute('UPDATE membros_familia SET papel=?,permissoes=? WHERE familia_id=? AND usuario_id=?',(role,json.dumps(perms),m['familia_id'],target))
    return self.out({'ok':True})
   if p=='/api/familias':
    if m['papel']!='proprietario':return self.out({'error':'Somente o proprietário pode alterar a família.'},403)
    d=self.body()
    with con() as c:
     if d.get('novoProprietarioId'):
      nid=int(d['novoProprietarioId']);candidate=c.execute('SELECT 1 FROM membros_familia WHERE familia_id=? AND usuario_id=?',(m['familia_id'],nid)).fetchone()
      if not candidate:raise ValueError('O novo proprietário deve ser membro da família.')
      c.execute('UPDATE familias SET proprietario_id=? WHERE id=?',(nid,m['familia_id']));c.execute('UPDATE membros_familia SET papel="administrador",permissoes=? WHERE familia_id=? AND usuario_id=?',(json.dumps(ALL_PERMS),m['familia_id'],u['id']));c.execute('UPDATE membros_familia SET papel="proprietario",permissoes=? WHERE familia_id=? AND usuario_id=?',(json.dumps(ALL_PERMS),m['familia_id'],nid))
     if d.get('nome'):c.execute('UPDATE familias SET nome=? WHERE id=?',(str(d['nome']).strip(),m['familia_id']))
    return self.out({'ok':True})
   self.out({'error':'Rota não encontrada'},404)
  except PermissionError as e:self.out({'error':str(e)},403)
  except Exception as e:self.out({'error':str(e)},400)

 def do_DELETE(self):
  p=urlparse(self.path).path
  try:
   u,m,session=self.require()
   if not u:return
   if p.startswith('/api/membros/'):
    if m['papel'] not in ('proprietario','administrador'):return self.out({'error':'Somente proprietário e administradores podem remover membros.'},403)
    try:target=int(p.rsplit('/',1)[1])
    except:raise ValueError('Membro inválido.')
    if target==u['id']:raise ValueError('Use a opção Sair da família para remover a própria participação.')
    with con() as c:
     victim=c.execute('SELECT papel FROM membros_familia WHERE familia_id=? AND usuario_id=? AND status="ativo"',(m['familia_id'],target)).fetchone()
     if not victim:raise ValueError('Membro não encontrado nesta família.')
     if victim['papel']=='proprietario':return self.out({'error':'O proprietário não pode ser removido. Transfira a propriedade primeiro.'},403)
     c.execute('DELETE FROM membros_familia WHERE familia_id=? AND usuario_id=?',(m['familia_id'],target))
    audit(m['familia_id'],u['id'],'remover_membro',{'usuario_id':target})
    return self.out({'ok':True})
   if p!='/api/familias/participacao':return self.out({'error':'Rota não encontrada'},404)
   if m['papel']=='proprietario':return self.out({'error':'O proprietário precisa transferir a propriedade antes de sair da família.'},400)
   fid=m['familia_id']
   with con() as c:c.execute('DELETE FROM membros_familia WHERE familia_id=? AND usuario_id=?',(fid,u['id']))
   remaining=families_for(u['id']);session['fid']=remaining[0]['id'] if len(remaining)==1 else None;audit(fid,u['id'],'sair_familia')
   return self.out({'ok':True,'families':remaining,'selectedFamilyId':session['fid']})
  except Exception as e:self.out({'error':str(e)},400)

if __name__=='__main__':init();print('Finanças da Casa: http://127.0.0.1:3000');ThreadingHTTPServer(('0.0.0.0',3000),H).serve_forever()
