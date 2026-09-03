// Content script do web.whatsapp.com.
//  - injeta a wa-js + wa-inject.js no contexto da página
//  - mostra um cartão flutuante ("Amor In") com a turma vinculada à conversa aberta
//    e um seletor pra vincular/trocar (DM pelo telefone, grupo pelo nome)
//  - orquestra a varredura: manda as mensagens novas da conversa vinculada.
(function () {
  'use strict';
  const CFG = window.AMORIN_CONFIG;
  const TAG = '[AmorIn]';
  const log = (...a) => console.log(TAG, ...a);

  // ---- injeta scripts no contexto da página ----
  function injetar(arquivo) {
    return new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = chrome.runtime.getURL(arquivo);
      s.onload = () => { s.remove(); resolve(); };
      (document.head || document.documentElement).appendChild(s);
    });
  }

  // ---- ponte com a página ----
  const pendentes = new Map();
  let seq = 0;
  window.addEventListener('message', (ev) => {
    if (ev.source !== window || !ev.data) return;
    if (ev.data.__amorin === 'res') {
      const p = pendentes.get(ev.data.reqId);
      if (p) {
        pendentes.delete(ev.data.reqId);
        ev.data.erro ? p.reject(new Error(ev.data.erro)) : p.resolve(ev.data.payload);
      }
    }
    if (ev.data.__amorin === 'evt' && ev.data.evt === 'chat_mudou') {
      clearTimeout(window.__amorinDebounce);
      window.__amorinDebounce = setTimeout(() => { atualizarChat(); }, 1200);
    }
    if (ev.data.__amorin === 'evt' && ev.data.evt === 'pronto') paginaPronta = true;
  });
  let paginaPronta = false;
  function pedir(req, params) {
    return new Promise((resolve, reject) => {
      const reqId = `${Date.now()}-${seq++}`;
      pendentes.set(reqId, { resolve, reject });
      window.postMessage({ __amorin: 'req', reqId, req, params }, '*');
      setTimeout(() => {
        if (pendentes.has(reqId)) { pendentes.delete(reqId); reject(new Error('timeout ' + req)); }
      }, 60000);
    });
  }
  const bg = (cmd, dados) =>
    new Promise((resolve) => chrome.runtime.sendMessage({ cmd, ...dados }, resolve));

  // ---- estado local ----
  async function getEstado() {
    const { amorin_estado } = await chrome.storage.local.get('amorin_estado');
    return amorin_estado || { sincronizadoAte: {}, salvasHoje: 0, dia: '', ultimaSync: null };
  }
  async function setEstado(e) { await chrome.storage.local.set({ amorin_estado: e }); }

  // ---- cache de turmas ----
  let turmasCache = null;
  async function getTurmas() {
    if (turmasCache) return turmasCache;
    const r = await bg('wa_turmas');
    turmasCache = (r && r.turmas) || [];
    return turmasCache;
  }

  // ---- cache de mensagens padrão ----
  let mensagensPadraoCache = null;
  async function getMensagensPadrao() {
    if (mensagensPadraoCache) return mensagensPadraoCache;
    const r = await bg('wa_mensagens_padrao');
    mensagensPadraoCache = (r && r.mensagens) || [];
    return mensagensPadraoCache;
  }

  // =========================================================================
  //  PAINEL  (sidebar completa, estilo Moskit, dentro do próprio WhatsApp Web)
  // =========================================================================
  const host = document.createElement('div');
  host.id = 'amorin-wa-widget';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      *{box-sizing:border-box;font-family:-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.45}
      .aba{position:fixed;top:45%;right:0;transform:translateY(-50%);writing-mode:vertical-rl;text-orientation:mixed;
        background:#f97316;color:#fff;padding:14px 8px;border-radius:10px 0 0 10px;font-size:12px;font-weight:800;
        cursor:pointer;letter-spacing:1px;box-shadow:-3px 0 14px rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.25);
        z-index:2147483000}
      .aba:hover{padding-right:12px}
      .painel{position:fixed;top:0;right:-360px;width:340px;height:100vh;background:#0a0f14;color:#f8fafc;
        box-shadow:-4px 0 24px rgba(0,0,0,.45);transition:right .22s ease;display:flex;flex-direction:column;
        z-index:2147483000;font-size:12px}
      .painel.aberto{right:0}
      header{background:#f97316;color:#fff;padding:12px 14px;display:flex;align-items:center;gap:8px;font-weight:700;flex:none}
      header .x{margin-left:auto;cursor:pointer;font-size:18px;line-height:1;opacity:.9}
      .body{padding:14px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:12px}
      .chat{font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:13px}
      .tag{font-size:10px;color:#94a3b8}
      .link{display:flex;align-items:center;gap:6px;padding:8px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.08);
        background:rgba(255,255,255,.03)}
      .link.ok{border-color:#34d39955;background:#34d39914}
      .link.no{border-color:#f59e0b55;background:#f59e0b14}
      .dot{width:8px;height:8px;border-radius:50%;flex:none}
      .ok .dot{background:#34d399}.no .dot{background:#f59e0b}
      .link span{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      button{border:0;border-radius:10px;cursor:pointer;font-weight:600;font-size:12px;padding:9px 10px;transition:filter .12s}
      button:hover{filter:brightness(1.08)}
      button:disabled{opacity:.5;cursor:default;filter:none}
      .b{background:#f97316;color:#fff;width:100%}
      .g{background:rgba(255,255,255,.05);color:#e2e8f0;border:1px solid rgba(255,255,255,.08);width:100%}
      .pill{width:100%;border-radius:10px;font-weight:600;padding:10px;border:1px solid;background:transparent}
      .pill-orange{color:#fb923c;border-color:#f9731655;background:#f9731614}
      .pill-red{color:#f87171;border-color:#f8717155;background:#f8717114}
      input,select{width:100%;padding:8px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.08);
        background:rgba(255,255,255,.04);color:#f8fafc;font-family:inherit;font-size:12px}
      select{cursor:pointer}
      .lista{max-height:260px;overflow-y:auto;display:flex;flex-direction:column;gap:5px}
      .item{padding:9px 10px;border-radius:8px;cursor:pointer;color:#d4d4d8;white-space:nowrap;overflow:hidden;
        text-overflow:ellipsis;line-height:1.3}
      .item:hover{background:rgba(255,255,255,.06);color:#fff}
      .row{display:flex;gap:8px}
      .msgs{max-height:280px;overflow-y:auto;display:flex;flex-direction:column;gap:5px}
      .msg{padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06)}
      .msg.mim{background:#f9731618;border-color:#f9731633}
      .msg .qm{color:#94a3b8;font-size:10px;margin-bottom:2px}
      .msg .tx{color:#e2e8f0;white-space:pre-wrap;word-break:break-word}
      .muted{color:#71717a;font-size:10px}
      .sec{border-top:1px solid rgba(255,255,255,.06);padding-top:12px;display:flex;flex-direction:column;gap:7px}
      .sec .titulo{font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px}
      .linha2{display:flex;justify-content:space-between;font-size:11px;color:#94a3b8;padding:4px 0;
        border-bottom:1px solid rgba(255,255,255,.05)}
      .linha2 b{color:#f8fafc;font-weight:600}
      .linha2.alerta{color:#fbbf24;border-color:#78350f55}
      .prob{display:flex;align-items:center;gap:8px;padding:2px 0}
      .prob .barra{flex:1;height:6px;border-radius:99px;background:rgba(255,255,255,.08);overflow:hidden}
      .prob .barra i{display:block;height:100%;background:linear-gradient(90deg,#f97316,#fb923c);border-radius:99px}
      .prob b{font-size:12px;color:#fff;min-width:32px;text-align:right}
      .padrao{display:flex;flex-direction:column;gap:5px;max-height:180px;overflow-y:auto}
      .padrao .item2{padding:8px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);cursor:pointer}
      .padrao .item2:hover{border-color:#f9731688;background:#f9731610}
      .padrao .item2 .t{font-weight:600;color:#fff;font-size:11px}
      .padrao .item2 .p{color:#8a8a93;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
      textarea{width:100%;padding:8px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.08);
        background:rgba(255,255,255,.04);color:#f8fafc;font-family:inherit;font-size:12px;resize:vertical}
      .stageCard{border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:8px 10px;margin-bottom:6px;
        background:rgba(255,255,255,.02)}
      .stageCard.atual{border-color:#f9731688;background:#f9731612}
      .stageTop{display:flex;align-items:center;gap:6px;font-size:11px;color:#f8fafc;font-weight:600;margin-bottom:4px}
      .stageTop .badge{background:#f97316;color:#fff;font-size:9px;font-weight:800;padding:2px 6px;border-radius:99px;
        letter-spacing:.4px}
      .stageTop .contagem{margin-left:auto;color:#94a3b8;font-weight:600;font-size:10px}
      .itemCk{display:flex;gap:6px;align-items:flex-start;padding:3px 0;cursor:pointer;font-size:11px;color:#cbd5e1}
      .itemCk input{width:auto;margin-top:2px;flex:none}
      .itemCk span{flex:1}
      summary{outline:none}
      [hidden]{display:none!important}
    </style>
    <div class="aba" id="aba">🪶 AMOR IN</div>
    <div class="painel aberto" id="painel">
      <header>🪶 Amor In <span class="x" id="fechar">&times;</span></header>
      <div class="body" id="body"><span class="muted">Abrindo…</span></div>
    </div>
  `;
  const $ = (id) => root.getElementById(id);
  const painelEl = $('painel');

  // Empurra o WhatsApp Web (não só cobre por cima) — o app deles usa
  // #app { position:absolute; inset:0; width:100% } (testado de verdade no
  // web.whatsapp.com). Só mudar `right` não basta: como width também tá
  // explícito, a caixa fica "over-constrained" e o CSS ignora o `right` —
  // precisa sobrescrever width também (calc(100% - Npx)).
  const LARGURA_PAINEL = 340;
  const estiloEmpurrar = document.createElement('style');
  estiloEmpurrar.textContent = `
    #app { transition: right .22s ease, width .22s ease; }
    html.amorin-painel-aberto #app { right: ${LARGURA_PAINEL}px !important; width: calc(100% - ${LARGURA_PAINEL}px) !important; }
  `;
  (document.head || document.documentElement).appendChild(estiloEmpurrar);

  function abrirPainel() {
    painelEl.classList.add('aberto');
    document.documentElement.classList.add('amorin-painel-aberto');
    render();
  }
  function fecharPainel() {
    painelEl.classList.remove('aberto');
    document.documentElement.classList.remove('amorin-painel-aberto');
  }
  $('aba').onclick = abrirPainel;
  $('fechar').onclick = fecharPainel;

  let chatAtual = null;   // { id, isGroup, nome, telefone }
  let vinculoAtual = null; // resposta do resolver
  let infoChat = null;     // resposta do chat_info (arquivadas, última)
  let metricas = null;     // resposta do turma_metricas (status, dias na fase, próxima reunião...)
  let modoSeletor = false;
  let modoSeletorAcao = 'vincular'; // 'vincular' | 'contato'
  let modoConversa = false;
  let mensagensConversa = null;
  let filtro = '';

  function formatarQuando(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm} ${hh}:${mi}`;
  }

  function render() {
    // Enquanto o vendedor está digitando/preenchendo algum campo (observações,
    // agendar reunião...), não reconstrói o painel embaixo do dedo — senão
    // perde o texto e o foco (mesma classe de bug do campo de busca de turma,
    // corrigida antes).
    // document.activeElement não vê dentro de shadow DOM aberto (retorna o
    // host) — precisa perguntar pro próprio shadow root quem tá focado nele.
    const ae = root.activeElement;
    if (ae && ae.tagName === 'TEXTAREA') return;
    if (ae && ae.tagName === 'INPUT' && ae.type !== 'checkbox') return;
    const b = $('body');
    if (!chatAtual) {
      b.innerHTML = `<span class="muted">Abra uma conversa pra vincular a uma turma.</span>`;
      return;
    }
    const nome = (chatAtual.nome || 'Conversa').replace(/</g, '&lt;');
    const tipo = chatAtual.isGroup ? 'Grupo' : 'Pessoa';
    const via = chatAtual.isGroup ? 'pelo nome do grupo' : 'pelo telefone';

    if (modoConversa) {
      const lista = mensagensConversa === null
        ? '<span class="muted">Carregando…</span>'
        : (mensagensConversa.length
          ? mensagensConversa.map((m) => `
              <div class="msg ${m.de_mim ? 'mim' : ''}">
                <div class="qm">${m.de_mim ? 'Eu' : (m.autor_nome || 'Contato').replace(/</g, '&lt;')} · ${formatarQuando(m.enviada_em)}${m.transcrito ? ' · 🎤 áudio' : ''}</div>
                <div class="tx">${(m.texto || '(sem texto)').replace(/</g, '&lt;')}</div>
              </div>
            `).join('')
          : '<span class="muted">Nada arquivado ainda.</span>');
      b.innerHTML = `
        <div class="chat">${nome}</div>
        <div class="tag">Conversa arquivada</div>
        <div class="msgs" id="msgs">${lista}</div>
        <button class="g" id="voltar" style="width:100%">Voltar</button>
      `;
      $('voltar').onclick = () => { modoConversa = false; render(); };
      return;
    }

    if (modoSeletor) {
      const legenda = modoSeletorAcao === 'contato'
        ? 'Criar contato pra essa pessoa e escolher a turma'
        : `${tipo} · vínculo ${via}`;
      b.innerHTML = `
        <div class="chat">${nome}</div>
        <div class="tag">${legenda}</div>
        <input id="busca" placeholder="Buscar turma…" value="${filtro.replace(/"/g, '&quot;')}" />
        <div class="lista" id="lista"></div>
        <div class="row">
          <button class="g" id="cancelar" style="flex:1">Cancelar</button>
          ${modoSeletorAcao === 'vincular' ? '<button class="g" id="naoturma" style="flex:1">Não é de turma</button>' : ''}
        </div>
      `;
      // A lista é re-renderizada a cada letra digitada, mas o <input> em si
      // nunca é recriado — senão perde o foco a cada tecla (só aceitava uma
      // letra por vez porque o re-render trocava o elemento debaixo do dedo).
      const renderLista = () => {
        const turmas = (turmasCache || []).filter((t) =>
          !filtro || t.nome.toLowerCase().includes(filtro.toLowerCase()),
        );
        $('lista').innerHTML =
          turmas.slice(0, 60).map((t) => `<div class="item" data-id="${t.id}">${t.nome.replace(/</g, '&lt;')}</div>`).join('') ||
          '<span class="muted">Nenhuma turma.</span>';
        $('lista').querySelectorAll('.item').forEach((el) => {
          el.onclick = () => (modoSeletorAcao === 'contato' ? criarContato(el.getAttribute('data-id')) : vincular(el.getAttribute('data-id')));
        });
      };
      renderLista();
      const busca = $('busca');
      busca.oninput = () => { filtro = busca.value; renderLista(); };
      busca.focus();
      busca.setSelectionRange(filtro.length, filtro.length);
      $('cancelar').onclick = () => { modoSeletor = false; render(); };
      if ($('naoturma')) $('naoturma').onclick = () => vincular(null, true);
      return;
    }

    const v = vinculoAtual;
    const temTurma = v && v.turma_id && !v.vincular;
    const nomeTurma = temTurma ? (turmaNomePorId(v.turma_id) || 'turma vinculada') : null;
    const temContato = !!(v && v.contato_id);
    const semContatoAindaDM = !chatAtual.isGroup && !temContato;
    const infoLinha = infoChat && infoChat.arquivadas > 0
      ? `<div class="tag">${infoChat.arquivadas} mensagem${infoChat.arquivadas === 1 ? '' : 's'} arquivada${infoChat.arquivadas === 1 ? '' : 's'}${infoChat.ultima ? ' · última ' + formatarQuando(infoChat.ultima) : ''}</div>`
      : '';
    const sincronizandoAgora = sincronizandoChatId === chatAtual.id;
    b.innerHTML = `
      <div class="chat">${nome}</div>
      <div class="tag">${tipo} · vínculo ${via}</div>
      <div class="link ${temTurma ? 'ok' : 'no'}">
        <span class="dot"></span>
        <span>${temTurma ? nomeTurma.replace(/</g, '&lt;') : (v && v.ignorar ? 'Marcada como "não é de turma"' : 'Não vinculada')}</span>
      </div>
      ${sincronizandoAgora ? '<div class="tag">🔄 Sincronizando mensagens…</div>' : ''}
      ${infoLinha}
      <button class="b" id="vincular">${temTurma ? 'Trocar turma' : 'Vincular a uma turma'}</button>
      ${semContatoAindaDM ? '<button class="g" id="criarcontato" style="width:100%">Criar contato + vincular</button>' : ''}
      ${infoChat && infoChat.arquivadas > 0 ? '<button class="g" id="verconversa" style="width:100%">Ver conversa arquivada</button>' : ''}
      ${temTurma ? '' : '<span class="muted">Enquanto não vincular, nada dessa conversa é salvo.</span>'}
      ${temTurma ? `
      <div class="sec">
        <div class="titulo">Turma no funil</div>
        ${metricasSecaoHtml(v.turma_id)}
      </div>
      <div class="sec">
        <div class="titulo">Etapa e checklist</div>
        ${etapaSecaoHtml(v.turma_id)}
      </div>
      <div class="sec">
        <div class="titulo">Agendar reunião</div>
        ${agendarSecaoHtml()}
      </div>
      <div class="sec">
        <div class="titulo">Observações da turma</div>
        <textarea id="obs" rows="3" placeholder="Escreva aqui — salva direto na turma…"></textarea>
        <button class="g" id="salvarObs" style="width:100%">Salvar observações</button>
      </div>` : ''}
      <div class="sec">
        <div class="titulo">Mensagens padrão</div>
        <div class="padrao" id="padrao"><span class="muted">Carregando…</span></div>
      </div>
    `;
    $('vincular').onclick = async () => { await getTurmas(); modoSeletor = true; modoSeletorAcao = 'vincular'; filtro = ''; render(); };
    if ($('criarcontato')) $('criarcontato').onclick = async () => { await getTurmas(); modoSeletor = true; modoSeletorAcao = 'contato'; filtro = ''; render(); };
    if ($('verconversa')) $('verconversa').onclick = verConversa;
    if ($('salvarObs')) $('salvarObs').onclick = () => salvarObservacoes(v.turma_id);
    if ($('obs') && metricas && metricas.__turmaId === v.turma_id) $('obs').value = metricas.observacoes || '';
    ligarEtapaSecao(v.turma_id);
    ligarAgendarSecao(v.turma_id);
    renderMensagensPadrao();
  }

  async function salvarObservacoes(turmaId) {
    const campo = $('obs');
    const botao = $('salvarObs');
    if (!campo || !botao) return;
    const texto = campo.value;
    botao.textContent = 'Salvando…';
    botao.disabled = true;
    const r = await bg('wa_atualizar_observacoes', { payload: { turma_id: turmaId, observacoes: texto } });
    botao.disabled = false;
    botao.textContent = r && r.ok ? '✓ Salvo' : 'Erro — tentar de novo';
    if (r && r.ok && metricas) metricas.observacoes = texto;
    setTimeout(() => { if ($('salvarObs')) $('salvarObs').textContent = 'Salvar observações'; }, 2000);
  }

  async function renderMensagensPadrao() {
    const idAlvo = chatAtual && chatAtual.id;
    const lista = await getMensagensPadrao();
    const alvo = $('padrao');
    if (!alvo || !chatAtual || chatAtual.id !== idAlvo) return; // conversa trocou enquanto carregava
    if (!lista.length) {
      alvo.innerHTML = '<span class="muted">Nenhuma cadastrada ainda (Admin → WhatsApp Comercial).</span>';
      return;
    }
    alvo.innerHTML = lista.map((m) => `
      <div class="item2" data-id="${m.id}">
        <div class="t">${(m.titulo || '').replace(/</g, '&lt;')}</div>
        <div class="p">${(m.texto || '').replace(/</g, '&lt;')}</div>
      </div>
    `).join('');
    alvo.querySelectorAll('.item2').forEach((el) => {
      el.onclick = () => {
        const m = lista.find((x) => x.id === el.getAttribute('data-id'));
        if (m) enviarMensagemPadrao(m.texto);
      };
    });
  }

  async function enviarMensagemPadrao(texto) {
    if (!chatAtual || !texto) return;
    const alvo = $('padrao');
    if (alvo) alvo.innerHTML = '<span class="muted">Enviando…</span>';
    try {
      await pedir('enviar', { chatId: chatAtual.id, texto });
      setTimeout(varrer, 800); // arquiva a mensagem que acabou de sair
    } catch (e) {
      log('enviar falhou', e);
    } finally {
      renderMensagensPadrao();
    }
  }

  function turmaNomePorId(id) {
    const t = (turmasCache || []).find((x) => x.id === id);
    return t ? t.nome : null;
  }

  function turmaStatusPorId(id) {
    const t = (turmasCache || []).find((x) => x.id === id);
    return t ? t.funil_status : null;
  }

  function formatarData(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  let metricasCarregandoPara = null;
  async function carregarMetricas(turmaId) {
    if (metricasCarregandoPara === turmaId) return; // já tem um fetch em andamento pra essa turma
    metricasCarregandoPara = turmaId;
    const r = await bg('wa_turma_metricas', { payload: { turma_id: turmaId } });
    metricasCarregandoPara = null;
    if (!chatAtual || !vinculoAtual || vinculoAtual.turma_id !== turmaId) return; // trocou de conversa enquanto carregava
    metricas = r && r.ok ? { ...r, __turmaId: turmaId } : null;
    render();
  }

  function metricasSecaoHtml(turmaId) {
    if (!metricas || metricas.__turmaId !== turmaId) {
      setTimeout(() => carregarMetricas(turmaId), 0); // dispara fora do render, dedupe por metricasCarregandoPara
      return '<span class="muted">Carregando…</span>';
    }
    const m = metricas;
    const partes = [];
    if (m.probabilidade != null) {
      partes.push(`
        <div class="prob">
          <span class="muted" style="flex:none">Probabilidade</span>
          <span class="barra"><i style="width:${Math.max(0, Math.min(100, m.probabilidade))}%"></i></span>
          <b>${m.probabilidade}%</b>
        </div>
      `);
    }
    const status = turmaStatusPorId(turmaId);
    if (status) partes.push(`<div class="linha2"><span>Status no funil</span><b>${status.replace(/</g, '&lt;')}</b></div>`);
    if (m.diasNaFase != null) partes.push(`<div class="linha2"><span>Dias na fase</span><b>${m.diasNaFase}</b></div>`);
    if (m.diasSemInteracao != null) partes.push(`<div class="linha2"><span>Dias sem interação</span><b>${m.diasSemInteracao}</b></div>`);
    if (m.semResposta) partes.push(`<div class="linha2 alerta"><span>⚠ Marcada como sem resposta</span></div>`);
    (m.reunioes || []).forEach((r, i) => {
      const rotulo = i === 0 ? 'Próxima reunião' : 'Depois';
      partes.push(`<div class="linha2"><span>${rotulo}${r.tipo_reuniao ? ' · ' + r.tipo_reuniao.replace(/</g, '&lt;') : ''}</span><b>${formatarData(r.inicio)}</b></div>`);
    });
    return partes.join('') || '<span class="muted">Sem dados de funil pra essa turma.</span>';
  }

  // =========================================================================
  //  ETAPA DO FUNIL + CHECKLIST (ver e mudar, sem sair do WhatsApp Web)
  // =========================================================================
  const STAGE_KEYS = ['stage-1', 'stage-2', 'stage-3', 'stage-4', 'stage-5'];
  const STAGE_NOMES = {
    'stage-1': 'Prospecção', 'stage-2': 'Qualificação/Contato', 'stage-3': 'Reunião Comissão',
    'stage-4': 'Reunião Turma', 'stage-5': 'Decisão', 'stage-6': 'Fechou ou Perdeu',
  };
  let checklistData = null; // { __turmaId, stage, stageNome, itens, checklist }
  let checklistCarregandoPara = null;
  let motivosPerdaCache = null;

  async function getMotivosPerda() {
    if (motivosPerdaCache) return motivosPerdaCache;
    const r = await bg('wa_motivos_perda');
    motivosPerdaCache = (r && r.motivos) || [];
    return motivosPerdaCache;
  }

  async function carregarChecklist(turmaId) {
    if (checklistCarregandoPara === turmaId) return;
    checklistCarregandoPara = turmaId;
    const r = await bg('wa_turma_checklist', { payload: { turma_id: turmaId } });
    checklistCarregandoPara = null;
    if (!chatAtual || !vinculoAtual || vinculoAtual.turma_id !== turmaId) return;
    checklistData = r && r.ok ? { ...r, __turmaId: turmaId } : null;
    render();
  }

  function etapaSecaoHtml(turmaId) {
    if (!checklistData || checklistData.__turmaId !== turmaId) {
      setTimeout(() => carregarChecklist(turmaId), 0);
      return '<span class="muted">Carregando…</span>';
    }
    const c = checklistData;
    if (!c.stage) return '<span class="muted">Essa turma não tem um card no Funil ainda.</span>';
    if (c.stage === 'stage-6') {
      return `
        <div class="stageCard atual">
          <div class="stageTop"><b>Fechou ou Perdeu</b><span class="badge">ATUAL</span></div>
        </div>
        <button class="g" id="reabrirEtapa" style="width:100%">Reabrir (voltar pra Decisão)</button>
      `;
    }
    let html = `<div class="lista" id="stagesLista" style="max-height:320px">`;
    html += (c.stages || []).map((st) => `
      <div class="stageCard ${st.atual ? 'atual' : ''}">
        <div class="stageTop">
          <b>${st.nome}</b>
          ${st.atual ? '<span class="badge">ATUAL</span>' : ''}
          <span class="contagem">${st.concluidos}/${st.total}</span>
        </div>
        ${st.itens.map((it) => `
          <label class="itemCk">
            <input type="checkbox" data-item="${it.id}" ${it.checked ? 'checked' : ''} />
            <span>${it.label.replace(/</g, '&lt;')}</span>
          </label>
        `).join('')}
      </div>
    `).join('');
    html += `</div>`;
    html += `<div class="row">
      <button class="pill pill-orange" id="btnGanhou" style="flex:1">🏆 Ganhou</button>
      <button class="pill pill-red" id="btnPerdeu" style="flex:1">❌ Perdeu</button>
    </div>`;
    html += `<details style="margin-top:2px">
      <summary class="muted" style="cursor:pointer">Mudar etapa manualmente</summary>
      <select id="selStage" style="margin-top:4px">${STAGE_KEYS.map((k) => `<option value="${k}" ${k === c.stage ? 'selected' : ''}>${STAGE_NOMES[k]}</option>`).join('')}</select>
    </details>`;
    return html;
  }

  function ligarEtapaSecao(turmaId) {
    const sel = $('selStage');
    if (sel) sel.onchange = async () => { await mudarEtapa(turmaId, sel.value); };
    const lista = $('stagesLista');
    if (lista) {
      lista.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        cb.onchange = async () => { await toggleChecklistItem(turmaId, cb.getAttribute('data-item'), cb.checked); };
      });
    }
    const reabrir = $('reabrirEtapa');
    if (reabrir) reabrir.onclick = () => mudarEtapa(turmaId, 'stage-5');
    const btnGanhou = $('btnGanhou');
    if (btnGanhou) btnGanhou.onclick = () => marcarResultado(turmaId, 'ganho');
    const btnPerdeu = $('btnPerdeu');
    if (btnPerdeu) {
      btnPerdeu.onclick = async () => {
        const motivos = await getMotivosPerda();
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;flex-direction:column;gap:4px;flex:1';
        wrap.innerHTML = `
          <select id="selMotivoPerda"><option value="">Motivo da perda…</option>${motivos.map((m) => `<option value="${m.replace(/"/g, '&quot;')}">${m.replace(/</g, '&lt;')}</option>`).join('')}</select>
          <button class="b" id="confirmarPerdeu" style="width:100%">Confirmar</button>
        `;
        btnPerdeu.replaceWith(wrap);
        $('confirmarPerdeu').onclick = () => marcarResultado(turmaId, 'perdido', $('selMotivoPerda').value);
      };
    }
  }

  async function mudarEtapa(turmaId, novoStage) {
    checklistData = null;
    metricas = null;
    render();
    await bg('wa_mudar_etapa', { payload: { turma_id: turmaId, stage: novoStage } });
    carregarChecklist(turmaId);
    carregarMetricas(turmaId);
  }

  async function toggleChecklistItem(turmaId, itemId, checked) {
    const r = await bg('wa_checklist_toggle', { payload: { turma_id: turmaId, item_id: itemId, checked } });
    checklistData = null;
    metricas = null;
    render();
    if (r && r.avancou) log('checklist completo — avançou de etapa sozinho');
  }

  async function marcarResultado(turmaId, outcome, lostReason) {
    await bg('wa_marcar_resultado', { payload: { turma_id: turmaId, outcome, lost_reason: lostReason || null } });
    checklistData = null;
    metricas = null;
    render();
  }

  // =========================================================================
  //  AGENDAR REUNIÃO (usa a mesma função que já sincroniza com o Google Agenda)
  // =========================================================================
  function agendarSecaoHtml() {
    return `
      <select id="agModalidade">
        <option value="ON">Online</option>
        <option value="PR-S">Presencial no estúdio</option>
        <option value="PR-F">Presencial fora do estúdio</option>
      </select>
      <input id="agTipo" placeholder="Tipo (ex: Comissão, Turma)" />
      <input id="agQuando" type="datetime-local" />
      <button class="pill pill-orange" id="agEnviar">📅 Agendar reunião</button>
      <span id="agStatus" style="font-size:11px;color:#94a3b8"></span>
    `;
  }

  function ligarAgendarSecao(turmaId) {
    const btn = $('agEnviar');
    if (!btn) return;
    btn.onclick = async () => {
      const status = $('agStatus');
      try {
        const modalidade = $('agModalidade').value;
        const tipo = $('agTipo').value.trim() || 'Turma';
        const quando = $('agQuando').value; // "YYYY-MM-DDTHH:mm" local
        if (!quando) { status.style.color = '#fbbf24'; status.textContent = '⚠ Escolha data e hora antes de agendar.'; return; }
        const inicio = new Date(quando);
        if (isNaN(inicio.getTime())) { status.style.color = '#fbbf24'; status.textContent = '⚠ Data/hora inválida.'; return; }
        const fim = new Date(inicio.getTime() + 60 * 60000);
        btn.disabled = true;
        status.style.color = '#94a3b8';
        status.textContent = 'Agendando…';
        const r = await bg('wa_agendar_reuniao', {
          payload: { turma_id: turmaId, tipo_reuniao: tipo, modalidade, inicio: inicio.toISOString(), fim: fim.toISOString() },
        });
        btn.disabled = false;
        if (r && r.ok) {
          status.style.color = '#34d399';
          status.textContent = '✓ Agendada e sincronizada com o Google Agenda';
          $('agTipo').value = '';
          $('agQuando').value = '';
          metricas = null;
          render();
        } else {
          status.style.color = '#f87171';
          status.textContent = 'Erro: ' + ((r && r.erro) || (r && r.error) || 'tentar de novo');
          log('agendar reunião falhou', r);
        }
      } catch (e) {
        btn.disabled = false;
        status.style.color = '#f87171';
        status.textContent = 'Erro inesperado: ' + e;
        log('agendar reunião — exceção', e);
      }
    };
  }

  async function verConversa() {
    if (!chatAtual) return;
    modoConversa = true;
    mensagensConversa = null;
    render();
    const idAlvo = chatAtual.id;
    const r = await bg('wa_chat_mensagens', { payload: { chat_wa_id: idAlvo, limite: 40 } });
    if (!chatAtual || chatAtual.id !== idAlvo) return;
    mensagensConversa = (r && r.mensagens) || [];
    render();
  }

  async function criarContato(turmaId) {
    if (!chatAtual || chatAtual.isGroup || !turmaId) return;
    $('body').innerHTML = '<span class="muted">Criando contato…</span>';
    const r = await bg('wa_criar_contato', {
      payload: { nome: chatAtual.nome, telefone: chatAtual.telefone, chat_wa_id: chatAtual.id, turma_id: turmaId },
    });
    modoSeletor = false;
    if (r && r.ok) {
      vinculoAtual = { turma_id: r.turma_id, contato_id: r.contato_id, origem: 'dm', vinculo: 'contato' };
      render();
      setTimeout(varrer, 500);
    } else {
      log('criar_contato erro', r && r.erro);
      atualizarChat();
    }
  }

  async function vincular(turmaId, ignorar) {
    if (!chatAtual) return;
    const payload = chatAtual.isGroup
      ? { tipo: 'grupo', grupo_wa_id: chatAtual.id, grupo_nome: chatAtual.nome, turma_id: turmaId, ignorar: !!ignorar }
      : { tipo: 'dm', telefone: chatAtual.telefone, chat_wa_id: chatAtual.id, nome: chatAtual.nome, turma_id: turmaId, ignorar: !!ignorar };
    $('body').innerHTML = '<span class="muted">Salvando…</span>';
    const r = await bg('wa_vincular', { payload });
    modoSeletor = false;
    if (r && r.ok) {
      vinculoAtual = ignorar
        ? { ignorar: true }
        : { turma_id: turmaId, origem: chatAtual.isGroup ? 'grupo' : 'dm' };
      render();
      if (turmaId) setTimeout(varrer, 500); // já arquiva o histórico recente
    } else {
      vinculoAtual = null;
      render();
      log('vincular erro', r && r.erro);
    }
  }

  // resolve a conversa aberta e atualiza o widget
  async function atualizarChat() {
    try {
      const ativo = await pedir('ativo').catch(() => null);
      const novoChat = ativo && ativo.id ? ativo : null;
      if (!novoChat || !chatAtual || novoChat.id !== chatAtual.id) {
        modoSeletor = false;
        modoConversa = false;
        infoChat = null;
        metricas = null;
        checklistData = null;
      }
      chatAtual = novoChat;
      if (!chatAtual) { render(); return; }
      const resolver = chatAtual.isGroup
        ? { grupo_wa_id: chatAtual.id, grupo_nome: chatAtual.nome }
        : { telefone: chatAtual.telefone };
      const r = await bg('resolver', { payload: resolver });
      vinculoAtual = r && !r.erro ? r : null;
      if (vinculoAtual && vinculoAtual.turma_id) getTurmas(); // pré-carrega nomes
      render();
      atualizarInfoChat(chatAtual.id);
    } catch (e) {
      log('atualizarChat', e);
    }
  }

  function atualizarInfoChat(idAlvo) {
    bg('wa_chat_info', { payload: { chat_wa_id: idAlvo } }).then((info) => {
      if (chatAtual && chatAtual.id === idAlvo && info && info.ok) { infoChat = info; render(); }
    });
  }

  // =========================================================================
  //  VARREDURA
  // =========================================================================
  let varrendo = false;
  let sincronizandoChatId = null; // chat_wa_id que está baixando/salvando mensagens agora (pro indicador no painel)
  async function varrer() {
    if (varrendo) return;
    varrendo = true;
    try {
      try {
        const st = await pedir('status');
        const e0 = await getEstado();
        e0.waPronto = !!(st && st.pronto);
        e0.waAutenticado = !!(st && st.autenticado);
        e0.waVistoEm = new Date().toISOString();
        await setEstado(e0);
      } catch (_) {}

      const cfg = await bg('config', {});
      if (!cfg || !cfg.temSessao) return;
      if (cfg.autoSync === false) return;

      const ativo = chatAtual || (await pedir('ativo').catch(() => null));
      if (!ativo || !ativo.id) return;

      let r = vinculoAtual;
      if (!r || (chatAtual && r && r.__paraChat && r.__paraChat !== ativo.id)) {
        const resolver = ativo.isGroup
          ? { grupo_wa_id: ativo.id, grupo_nome: ativo.nome }
          : { telefone: ativo.telefone };
        r = await bg('resolver', { payload: resolver });
      }
      if (!r || r.erro || r.ignorar) return;
      if (r.vincular || !r.turma_id) return; // aguardando vínculo manual no widget

      const estado = await getEstado();
      const desde = estado.sincronizadoAte[ativo.id] || 0;
      sincronizandoChatId = ativo.id;
      if (chatAtual && chatAtual.id === ativo.id) render();
      const msgs = await pedir('mensagens', {
        chatId: ativo.id, count: CFG.MAX_MSGS_POR_SYNC, desde, comAudio: true,
      });
      if (!msgs || !msgs.length) return;

      const mensagens = msgs
        .filter((m) => m.wa_msg_id)
        .map((m) => ({
          ...m,
          turma_id: r.turma_id,
          contato_id: r.contato_id || null,
          origem: ativo.isGroup ? 'grupo' : 'dm',
          chat_wa_id: ativo.id,
          grupo_nome: ativo.isGroup ? ativo.nome : null,
        }));

      const resp = await bg('salvar', {
        payload: { acao: 'salvar', chat_wa_id: ativo.id, mensagens },
      });
      if (resp && resp.ok) {
        const maxT = msgs.reduce((mx, m) => Math.max(mx, Date.parse(m.enviada_em) || 0), desde);
        estado.sincronizadoAte[ativo.id] = maxT;
        const hoje = new Date().toISOString().slice(0, 10);
        if (estado.dia !== hoje) { estado.dia = hoje; estado.salvasHoje = 0; }
        estado.salvasHoje += resp.salvas || 0;
        estado.ultimaSync = new Date().toISOString();
        await setEstado(estado);
        if (resp.salvas) log(`+${resp.salvas} mensagens arquivadas (${ativo.nome})`);
        if (resp.salvas && chatAtual && chatAtual.id === ativo.id) {
          atualizarInfoChat(ativo.id); // contagem/última mensagem mudou, atualiza na hora
        }
      }
    } catch (e) {
      log('varrer falhou', e);
    } finally {
      varrendo = false;
      const eraOChatAberto = chatAtual && chatAtual.id === sincronizandoChatId;
      sincronizandoChatId = null;
      if (eraOChatAberto) render();
    }
  }

  // ---- bootstrap ----
  (async () => {
    await injetar('vendor/wppconnect-wa.js');
    await injetar('wa-inject.js');
    const montar = () => {
      if (!document.body) return setTimeout(montar, 500);
      document.body.appendChild(host);
      document.documentElement.classList.add('amorin-painel-aberto'); // painel já começa aberto
      render();
      atualizarChat();
    };
    montar();
    setInterval(varrer, CFG.INTERVALO_SYNC_MS);
    setInterval(atualizarChat, 20000);
    setTimeout(varrer, 15000);
  })();

  chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
    if (msg && msg.cmd === 'varrer_agora') { varrer().then(() => sendResponse({ ok: true })); return true; }
  });
})();
