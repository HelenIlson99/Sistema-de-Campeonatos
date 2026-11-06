// Sistema de Campeonatos — dados no Supabase (Postgres); login com Supabase Auth
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/+esm";
 
// >>> Cole aqui a URL e a chave pública do projeto (Supabase → Project Settings → API Keys)
const SUPABASE_URL = "https://fanjwleaowatlpwzchtt.supabase.co";
const SUPABASE_KEY = "sb_publishable_V87Iknit0d6oE_HC4jEJCg_jvnqFceP";
const configurado = SUPABASE_URL.startsWith("https://");
 
const KEY = "campeonatosV2"; // só leitura: dados antigos deste navegador, usados na importação
const db = { camps: [], conq: [] };
let sel = null;
let selEquipe = null;
let usuario = null;
let erroNuvem = configurado ? "" : "Supabase ainda não configurado: cole a URL e a chave no início do script.js.";
let gravadoC = {}, gravadoQ = {}; // último JSON enviado de cada item (envia só o que mudou)
 
const $ = id => document.getElementById(id);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const sb = configurado ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;
const podeEditar = () => !!usuario;

// Cria elementos HTML de forma segura
const h = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const k in props) (k.startsWith("on") || k in e) ? (e[k] = props[k]) : e.setAttribute(k, props[k]);
  e.append(...kids.flat().filter(v => v != null && v !== false));
  return e;
};
 
// ---------- Login (Supabase Auth) ----------
function renderAuth() {
  $("area-login").hidden = podeEditar();
  $("area-criar").hidden = !podeEditar();
}
$("form-login").onsubmit = async e => {
  e.preventDefault();
  const erro = $("login-erro");
  if (!sb) { erro.textContent = "Supabase ainda não configurado."; erro.hidden = false; return; }
  const { error } = await sb.auth.signInWithPassword({ email: $("login-usuario").value.trim(), password: $("login-senha").value });
  erro.textContent = !error ? "" : (error.code === "invalid_credentials" || error.status === 400)
    ? "E-mail ou senha incorretos." : "Não foi possível entrar (" + error.message + ").";
  erro.hidden = !error;
  $("login-senha").value = "";
};
$("btn-sair").onclick = () => sb.auth.signOut();
if (sb) sb.auth.onAuthStateChange((_evento, sessao) => { usuario = sessao ? sessao.user : null; renderAuth(); render(); });
 
// ---------- Nuvem (Supabase): uma linha por campeonato e uma por conquista ----------
let fila = Promise.resolve();
const save = () => {
  render();
  if (podeEditar()) fila = fila.then(persistir).catch(err => {
    console.error(err);
    alert("Não foi possível salvar na nuvem: " + (err.message || err.code));
  });
};
 
async function persistir() {
  const sets = { campeonatos: [], conquistas: [] }, dels = { campeonatos: [], conquistas: [] };
  const novoC = {}, novoQ = {};
  const dif = (itens, antes, novo, tabela, campo) => {
    const ids = new Set(itens.map(x => x.id));
    itens.forEach(x => {
      const json = JSON.stringify(x);
      novo[x.id] = json;
      if (antes[x.id] !== json) sets[tabela].push({ id: x.id, [campo]: x[campo] ?? null, dados: JSON.parse(json) });
    });
    Object.keys(antes).filter(id => !ids.has(id)).forEach(id => dels[tabela].push(id));
  };
  dif(db.camps, gravadoC, novoC, "campeonatos", "criado");
  dif(db.conq, gravadoQ, novoQ, "conquistas", "ordem");
  for (const t of ["campeonatos", "conquistas"]) {
    if (sets[t].length) { const { error } = await sb.from(t).upsert(sets[t]); if (error) throw error; }
    if (dels[t].length) { const { error } = await sb.from(t).delete().in("id", dels[t]); if (error) throw error; }
  }
  gravadoC = novoC; gravadoQ = novoQ;
}
 
async function carregar() {
  if (!sb) return render();
  try {
    const [rc, rq] = await Promise.all([
      sb.from("campeonatos").select("id, dados").order("criado"),
      sb.from("conquistas").select("id, dados").order("ordem")]);
    if (rc.error) throw rc.error;
    if (rq.error) throw rq.error;
    db.camps = rc.data.map(r => ({ ...r.dados, id: r.id }));
    db.conq = rq.data.map(r => ({ ...r.dados, id: r.id }));
    gravadoC = Object.fromEntries(db.camps.map(c => [c.id, JSON.stringify(c)]));
    gravadoQ = Object.fromEntries(db.conq.map(x => [x.id, JSON.stringify(x)]));
  } catch (err) {
    console.error(err);
    erroNuvem = "Não foi possível carregar os dados da nuvem (" + (err.message || err.code) + ").";
  }
  render();
}
 
// Logos viram miniaturas de até 96 px (deixa os dados leves)
function reduzirLogo(src, max = 96) {
  return new Promise(ok => {
    const img = new Image();
    img.onload = () => {
      if (!img.width || !img.height) return ok(src);
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const cv = document.createElement("canvas");
      cv.width = Math.max(1, Math.round(img.width * k));
      cv.height = Math.max(1, Math.round(img.height * k));
      cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
      ok(cv.toDataURL("image/png"));
    };
    img.onerror = () => ok(src);
    img.src = src;
  });
}
 
// ---------- Importar dados antigos (do localStorage deste navegador ou de um arquivo .json) ----------
async function importar(texto) {
  let dados;
  try { dados = JSON.parse(texto); } catch (e) { return alert("Esse arquivo não é um JSON válido."); }
  const camps = (dados.camps || []).filter(c => c && c.id && c.nome);
  const conq = (dados.conq || []).filter(x => x && x.camp);
  if (!camps.length && !conq.length) return alert("Não encontrei campeonatos nesses dados.");
  const base = Date.now(), chave = x => [x.camp, x.campeao, x.vice, x.data].join("|");
  let nc = 0, nq = 0;
  for (const [i, c] of camps.entries()) {
    if (db.camps.some(x => x.id === c.id)) continue;
    c.equipes ||= []; c.fases ||= [];
    for (const e of c.equipes) if (e.logo && e.logo.length > 20000) e.logo = await reduzirLogo(e.logo);
    c.criado ||= base + i;
    db.camps.push(c); nc++;
  }
  conq.forEach((x, i) => {
    if (db.conq.some(y => chave(y) === chave(x))) return;
    x.id ||= uid(); x.ordem ||= base + i;
    db.conq.push(x); nq++;
  });
  save();
  alert("Importado: " + nc + " campeonato(s) e " + nq + " conquista(s).");
}
$("btn-importar").onclick = () => {
  const local = localStorage.getItem(KEY);
  if (local && confirm("Encontrei dados salvos neste navegador. Importar para a nuvem?\n\nOK = importar estes dados\nCancelar = escolher um arquivo .json")) return importar(local);
  $("arq-importar").click();
};
$("arq-importar").onchange = async e => {
  const f = e.target.files[0];
  e.target.value = "";
  if (f) importar(await f.text());
};
 
const num = v => (v === "" || isNaN(Number(v))) ? null : Math.max(0, Math.floor(Number(v)));
const embaralhar = a => {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
 
// ---------- Regras ----------
// Confronto: a x b. Jogos guardam gols de A e de B (ida: mando de A; volta: mando de B).
const confronto = (a, b, o = {}) => ({
  a, b, unico: !!o.unico, liga: !!o.liga, titulo: o.titulo || "",
  jogos: o.unico ? [{}] : [{}, {}], pen: {}
});
 
function placar(x) {
  let ta = 0, tb = 0;
  for (const j of x.jogos) {
    if (j.a == null || j.b == null) return null;
    ta += j.a; tb += j.b;
  }
  return { ta, tb };
}
 
// Vencedor (agregado; se empatar, pênaltis). Devolve null se faltar algo.
function decidido(x) {
  const p = placar(x);
  if (!p) return null;
  if (p.ta !== p.tb) return { ...p, v: p.ta > p.tb ? x.a : x.b, p: p.ta > p.tb ? x.b : x.a };
  const { a, b } = x.pen;
  if (a == null || b == null || a === b) return null;
  return { ...p, v: a > b ? x.a : x.b, p: a > b ? x.b : x.a };
}
 
const completo = x => x.liga ? placar(x) !== null : !!decidido(x);
 
function tabela(c) {
  const t = {};
  c.equipes.forEach(e => t[e.nome] = { nome: e.nome, P: 0, J: 0, V: 0, E: 0, D: 0, GP: 0, GC: 0 });
  c.fases.flatMap(f => f.confrontos).filter(x => x.liga).forEach(x => {
    const p = placar(x);
    if (!p) return;
    const A = t[x.a], B = t[x.b];
    A.J++; B.J++; A.GP += p.ta; A.GC += p.tb; B.GP += p.tb; B.GC += p.ta;
    if (p.ta > p.tb) { A.V++; A.P += 3; B.D++; }
    else if (p.ta < p.tb) { B.V++; B.P += 3; A.D++; }
    else { A.E++; B.E++; A.P++; B.P++; }
  });
  return Object.values(t).sort((x, y) =>
    y.P - x.P || y.V - x.V || (y.GP - y.GC) - (x.GP - x.GC) || y.GP - x.GP);
}
 
// Abre a próxima fase a partir de uma lista de equipes
function abrir(c, l) {
  if (l.length === 2) {
    c.fases.push({ nome: "Decisão", confrontos: [confronto(l[0], l[1], { unico: true, titulo: "Grande final" })] });
  } else if (l.length === 4) {
    c.fases.push({ nome: "Semifinais", confrontos: [
      confronto(l[0], l[3], { unico: true, titulo: "Semifinal 1" }),
      confronto(l[1], l[2], { unico: true, titulo: "Semifinal 2" })] });
  } else {
    const r = [...l];
    const bye = r.length % 2 ? r.pop() : null; // número ímpar: uma equipe avança direto
    const n = c.fases.filter(f => f.nome.startsWith("Rodada")).length + 1;
    c.fases.push({ nome: "Rodada " + n, bye, confrontos:
      Array.from({ length: r.length / 2 }, (_, i) => confronto(r[2 * i], r[2 * i + 1], { titulo: "Confronto " + (i + 1) })) });
  }
}
 
function iniciar(c) {
  if (c.equipes.length < 2) return alert("Cadastre pelo menos 2 equipes.");
  const nomes = c.equipes.map(e => e.nome);
  if (c.formato === "liga") {
    const cs = [];
    for (let i = 0; i < nomes.length; i++)
      for (let j = i + 1; j < nomes.length; j++)
        cs.push(confronto(nomes[i], nomes[j], { unico: true, liga: true }));
    c.fases = [{ nome: "Pontos corridos", confrontos: embaralhar(cs) }];
  } else {
    abrir(c, embaralhar(nomes));
  }
  save();
}
 
function avancar(c) {
  const f = c.fases.at(-1);
  if (f.nome === "Pontos corridos") {
    const t = tabela(c).map(e => e.nome);
    abrir(c, t.length >= 4 ? t.slice(0, 4) : t.slice(0, 2));
  } else {
    const rs = f.confrontos.map(decidido);
    if (f.nome === "Semifinais") {
      c.fases.push({ nome: "Decisão", confrontos: [
        confronto(rs[0].v, rs[1].v, { unico: true, titulo: "Grande final" }),
        confronto(rs[0].p, rs[1].p, { unico: true, titulo: "Disputa do 3º lugar" })] });
    } else {
      abrir(c, embaralhar([...rs.map(r => r.v), ...(f.bye ? [f.bye] : [])]));
    }
  }
  save();
}
 
function concluir(c) {
  const [fin, ter] = c.fases.at(-1).confrontos.map(decidido);
  c.status = "finalizado";
  db.conq.push({ id: uid(), ordem: Date.now(), camp: c.nome, campeao: fin.v, vice: fin.p, terceiro: ter ? ter.v : null,
    data: new Date().toLocaleDateString("pt-BR") });
  save();
}
 
function ranking() {
  const r = {};
  const g = n => r[n] || (r[n] = { nome: n, t: 0, v: 0, b: 0, j: 0 });
  db.conq.forEach(x => {
    g(x.campeao).t++; g(x.campeao).j++;
    g(x.vice).v++; g(x.vice).j++;
    if (x.terceiro) { g(x.terceiro).b++; g(x.terceiro).j++; }
  });
  return Object.values(r).sort((a, b) => b.t - a.t || b.v - a.v || b.b - a.b);
}
 
// ---------- Telas ----------
const tm = (c, n) => {
  const e = c.equipes.find(x => x.nome === n);
  return h("span", { className: "tm" }, e && e.logo && h("img", { src: e.logo, alt: "" }), n);
};
 
function render() { renderLista(); renderPainel(); renderSala(); }
 
function renderLista() {
  const ul = $("lista");
  ul.replaceChildren();
  if (erroNuvem) ul.append(h("li", { className: "aviso" }, erroNuvem));
  if (!db.camps.length) ul.append(h("li", { className: "vazio" }, podeEditar() ? "Nenhum campeonato ainda. Crie o primeiro acima." : "Nenhum campeonato ainda."));
  db.camps.forEach(c => ul.append(h("li", { className: c.id === sel ? "ativo" : "" },
    h("span", {}, h("strong", {}, c.nome), " (" + (c.formato === "liga" ? "pontos corridos" : "eliminatório") + (c.status === "finalizado" ? ", finalizado" : "") + ")"),
    h("span", { className: "acoes" },
      h("button", { onclick: () => { sel = c.id; render(); } }, "Abrir"),
      podeEditar() && h("button", { className: "sec", onclick: () => {
        if (!confirm('Excluir "' + c.nome + '"?')) return;
        db.camps = db.camps.filter(x => x.id !== c.id);
        if (sel === c.id) sel = null;
        save();
      } }, "Excluir")))));
}
 
function renderPainel() {
  const p = $("painel"), c = db.camps.find(x => x.id === sel);
  p.hidden = !c;
  if (!c) return;
  p.replaceChildren();
  const fim = c.status === "finalizado", ini = c.fases.length > 0;
  p.append(h("h2", {}, c.nome), h("h3", {}, "Equipes (" + c.equipes.length + ")"),
    h("ul", { className: "equipes" }, c.equipes.map(e => h("li", {}, tm(c, e.nome),
      !ini && podeEditar() && h("button", { className: "x", title: "Remover equipe", onclick: () => { c.equipes = c.equipes.filter(y => y !== e); save(); } }, "×")))));
 
  if (!ini && podeEditar()) {
    const inNome = h("input", { placeholder: "Nome da equipe" });
    const inLogo = h("input", { type: "file", accept: "image/*" });
    const add = logo => {
      const nome = inNome.value.trim();
      if (!nome) return alert("Digite o nome da equipe.");
      if (c.equipes.some(e => e.nome.toLowerCase() === nome.toLowerCase())) return alert("Essa equipe já está cadastrada.");
      c.equipes.push({ nome, logo });
      save();
    };
    p.append(h("div", { className: "linha" }, inNome, inLogo,
      h("button", { onclick: () => {
        const f = inLogo.files[0];
        if (!f) return add("");
        if (f.size > 300000) return alert("A logo deve ter no máximo 300 KB.");
        const r = new FileReader();
        r.onload = async () => add(await reduzirLogo(r.result));
        r.readAsDataURL(f);
      } }, "Adicionar equipe")),
      h("button", { className: "destaque", onclick: () => iniciar(c) }, c.formato === "liga" ? "Gerar jogos" : "Sortear chave"));
  }
 
  if (c.formato === "liga" && ini) p.append(tabelaEl(c));
  c.fases.forEach((f, i) => p.append(faseEl(c, f, i === c.fases.length - 1)));
 
  if (ini && !fim && podeEditar()) p.append(acaoEl(c));
  if (fim) p.append(h("p", { className: "ok" }, "Campeonato finalizado. O resultado está na Sala de conquistas."));
}
 
function tabelaEl(c) {
  const tb = h("tbody");
  tabela(c).forEach((e, i) => tb.append(h("tr", { className: i < 4 ? "top" : "" },
    [i + 1, e.nome, e.P, e.J, e.V, e.E, e.D, e.GP, e.GC, e.GP - e.GC].map(x => h("td", {}, String(x))))));
  return h("div", { className: "rolar" }, h("h3", {}, "Classificação"),
    h("table", {}, h("thead", {}, h("tr", {}, ["#", "Equipe", "PTS", "J", "V", "E", "D", "GP", "GC", "SG"].map(x => h("th", {}, x)))), tb));
}
 
function faseEl(c, f, aberta) {
  const d = h("details", { className: "fase", open: aberta },
    h("summary", {}, f.nome + (f.bye ? " (avança direto: " + f.bye + ")" : "")));
  f.confrontos.forEach(x => d.append(confrontoEl(c, x)));
  return d;
}
 
function confrontoEl(c, x) {
  const fim = c.status === "finalizado" || !podeEditar(), box = h("div", { className: "conf" });
  if (x.titulo) box.append(h("strong", {}, x.titulo));
  const gol = (j, k) => h("input", { type: "number", min: 0, value: j[k] ?? "", disabled: fim,
    "aria-label": "Gols de " + x[k], onchange: e => { j[k] = num(e.target.value); save(); } });
  x.jogos.forEach((j, i) => {
    const [m, v] = i === 1 ? ["b", "a"] : ["a", "b"]; // na volta, B é o mandante
    box.append(h("div", { className: "jogo" }, !x.unico && h("small", {}, i === 1 ? "Volta" : "Ida"),
      tm(c, x[m]), gol(j, m), "x", gol(j, v), tm(c, x[v])));
  });
  if (!x.liga) {
    const pl = placar(x);
    if (pl && pl.ta === pl.tb) {
      const pen = k => h("input", { type: "number", min: 0, value: x.pen[k] ?? "", disabled: fim,
        "aria-label": "Pênaltis de " + x[k], onchange: e => { x.pen[k] = num(e.target.value); save(); } });
      box.append(h("div", { className: "jogo" }, h("small", {}, "Pênaltis"), tm(c, x.a), pen("a"), "x", pen("b"), tm(c, x.b)));
      if (x.pen.a != null && x.pen.a === x.pen.b) box.append(h("p", { className: "aviso" }, "Os pênaltis não podem terminar empatados."));
    }
    const r = decidido(x);
    if (r) box.append(h("p", { className: "ok" }, "Classificado: " + r.v + " (agregado " + r.ta + " x " + r.tb + ")"));
  }
  return box;
}
 
// O botão é desenhado a partir dos dados salvos: aparece sozinho quando a fase termina.
function acaoEl(c) {
  const f = c.fases.at(-1);
  if (!f.confrontos.every(completo))
    return h("p", { className: "dica" }, "Preencha todos os resultados (e os pênaltis, nos empates) para liberar a próxima etapa.");
  if (f.nome === "Decisão")
    return h("button", { className: "destaque", onclick: () => concluir(c) }, "Concluir campeonato");
  return h("button", { className: "destaque", onclick: () => avancar(c) },
    f.nome === "Pontos corridos" ? "Avançar para o mata-mata" : "Avançar para próxima fase");
}
 
function renderSala() {
  const s = $("sala");
  s.replaceChildren();
  if (!db.conq.length) return s.append(h("p", { className: "vazio" }, "Nenhum campeonato finalizado ainda."));
  if (selEquipe) return s.append(historicoEquipeEl(selEquipe));
  let pos = 1;
  const cards = ranking().map((r, i, l) => {
    const ant = l[i - 1];
    if (ant && (r.t !== ant.t || r.v !== ant.v || r.b !== ant.b)) pos = i + 1; // empates dividem a posição
    return h("article", { className: "rk" },
      h("h3", {}, pos + "º lugar — ⚽ ",
        h("a", { href: "#", onclick: e => { e.preventDefault(); selEquipe = r.nome; renderSala(); } }, r.nome)),
      h("p", {}, "🏆 Títulos: " + r.t),
      h("p", {}, "🥈 Vice-campeonatos: " + r.v),
      h("p", {}, "🥉 Terceiros lugares: " + r.b),
      h("p", {}, "📋 Campeonatos disputados: " + r.j));
  });
  s.append(
    h("div", { className: "conquistas" }, db.conq.slice().reverse().map(x => h("article", { className: "cq" },
      h("h3", {}, "🏆 " + x.camp),
      h("p", {}, "🥇 Campeão: " + x.campeao),
      h("p", {}, "🥈 Vice-campeão: " + x.vice),
      x.terceiro && h("p", {}, "🥉 3º lugar: " + x.terceiro),
      h("p", {}, "📅 Data: " + x.data)))),
    h("hr"),
    estatisticasEl(),
    h("hr"),
    h("h3", { className: "rk-titulo" }, "📊 Ranking Histórico das Equipes"),
    h("div", { className: "ranking" }, cards));
}
 
// Equipes com mais títulos, vices e terceiros lugares (empates aparecem juntos)
function estatisticasEl() {
  const r = ranking();
  const lider = (campo, icone, titulo, texto) => {
    const max = Math.max(...r.map(e => e[campo]));
    const lista = max > 0 ? r.filter(e => e[campo] === max) : [];
    return h("article", { className: "cq est" },
      h("h3", {}, icone + " " + titulo),
      lista.length
        ? lista.map(e => h("p", {}, "⚽ " + e.nome + " — " + icone + " " + e[campo] + " " + texto))
        : h("p", { className: "vazio" }, "Nenhuma equipe nesta categoria ainda."));
  };
  return h("div", {},
    h("h3", { className: "rk-titulo" }, "📈 Estatísticas Gerais"),
    h("div", { className: "banner" }, "🏆 Campeonatos finalizados: " + db.conq.length),
    h("div", { className: "conquistas" },
      lider("t", "🏆", "Equipe(s) com mais títulos:", "título(s)"),
      lider("v", "🥈", "Equipe(s) com mais vice-campeonatos:", "vice-campeonato(s)"),
      lider("b", "🥉", "Equipe(s) com mais terceiros lugares:", "terceiro(s) lugar(es)")));
}
 
function historicoEquipeEl(nome) {
  const r = ranking().find(x => x.nome === nome);
  const itens = db.conq.flatMap(x =>
    x.campeao === nome ? [["🏆", "1º lugar", x]] :
    x.vice === nome ? [["🥈", "2º lugar", x]] :
    x.terceiro === nome ? [["🥉", "3º lugar", x]] : []);
  return h("div", {},
    h("button", { className: "sec", onclick: () => { selEquipe = null; renderSala(); } }, "↩️ Voltar ao ranking"),
    h("h3", { className: "rk-titulo" }, "🏆 Histórico da equipe: " + nome),
    h("article", { className: "rk" },
      h("p", {}, "🏆 Títulos: " + r.t), h("p", {}, "🥈 Vice-campeonatos: " + r.v),
      h("p", {}, "🥉 Terceiros lugares: " + r.b), h("p", {}, "🏅 Total de pódios: " + (r.t + r.v + r.b))),
    h("ul", { className: "itens" }, itens.map(([m, col, x]) => h("li", {},
      h("span", {}, m + " " + col + " — " + x.camp), h("small", {}, x.data)))));
}
 
$("criar").onclick = () => {
  if (!podeEditar()) return alert("Faça login para criar um campeonato.");
  const nome = $("nome").value.trim();
  if (!nome) return alert("Digite o nome do campeonato.");
  if (db.camps.some(c => c.nome.toLowerCase() === nome.toLowerCase())) return alert("Já existe um campeonato com esse nome.");
  const c = { id: uid(), criado: Date.now(), nome, formato: $("formato").value, equipes: [], fases: [], status: "andamento" };
  db.camps.push(c);
  sel = c.id;
  $("nome").value = "";
  save();
};
 
render();
renderAuth();
carregar();