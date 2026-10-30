/*
 * LP Eva × Caju: solicitação de contrato.
 *
 * Em `mode: 'prototype'` nada sai da página: os envios são simulados e o
 * painel "o que seria registrado na AC" mostra o payload de cada envio.
 * Para ligar à ActiveCampaign, trocar `mode` para 'live' (ver funil/tasks/T017_fluxo-comercial-caju.md).
 * `?envio=real` na URL liga o envio só naquela visita, para o teste de ponta a ponta.
 *
 * Fluxo da trilha de contrato (um cartão, etapas curtas):
 *   1 Você -> 2 Empresa + Termo (envia a solicitação) -> confirmação
 *   -> 3 Contrato, opcional: dados jurídicos -> assinatura/financeiro
 */
var CONFIG = {
  mode: 'live',
  // prazo de envio do contrato (pendente de confirmação com a Nathália)
  sla: '2 dias úteis',
  termoVersao: 'v0 · rascunho em revisão jurídica (13/10/2026)',
  origem: 'Caju',
  ac: {
    endpoint: 'https://bastasentir.activehosted.com/proc.php',
    // `or` muda se o formulário for salvo de novo
    solicitacao: { u: '6AE4D98022FE1', f: '17', or: '40145aa3-1531-4f70-952c-45a43881cbc6' }, // aba "Solicitar contrato" -> etapa 26
    especialista: { u: '6AE4D99954E95', f: '18', or: '987f0162-5b73-4a74-be1d-e590a8f28e8f' }, // aba "Falar com especialista" -> etapa 14
    contrato: { u: '6AE4D99AACE57', f: '19', or: 'fe80f479-b391-4d87-91b5-8da5b2dab0eb' },    // etapa opcional: só atualiza o contato
    // nome no payload -> nome no formulário; campos vazios não são enviados, para não apagar valores
    fields: {
      fullname: 'fullname', email: 'email', phone: 'phone',
      nome_da_empresa: 'field[49]', porte: 'field[50]', cargo_na_empresa: 'field[51]',
      utm_medium: 'field[26]', utm_campaign: 'field[27]', utm_source: 'field[28]', utm_content: 'field[57]',
      b2b_funil_origem: 'field[81]', b2b_cnpj: 'field[82]', b2b_headcount: 'field[83]',
      b2b_plano_interesse: 'field[84]', b2b_consultor_codigo: 'field[85]',
      b2b_termo_versao: 'field[86]', b2b_termo_aceite_em: 'field[87]',
      b2b_razao_social: 'field[88]', b2b_endereco: 'field[89]',
      b2b_signatario_nome: 'field[90]', b2b_signatario_cargo: 'field[91]', b2b_signatario_email: 'field[92]',
      b2b_financeiro_email: 'field[93]', b2b_inicio_previsto: 'field[94]', b2b_observacoes: 'field[95]'
    }
  }
};

if (/[?&]envio=real\b/.test(window.location.search)) CONFIG.mode = 'live';

(function () {
  'use strict';

  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
  var desktop = window.matchMedia('(min-width: 1100px)');

  var store = {
    get: function (k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } },
    set: function (k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sem storage */ } }
  };

  // eventos para GA/Meta quando a medição for ligada
  function track(acao, extra) {
    window.dataLayer = window.dataLayer || [];
    var ev = { event: 'caju_lp', acao: acao };
    if (extra) Object.keys(extra).forEach(function (k) { ev[k] = extra[k]; });
    window.dataLayer.push(ev);
  }

  /* ---------- atribuição: consultor e UTMs da URL ---------- */
  var ATTR_KEYS = ['consultor', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  var attr = (function () {
    var saved = store.get('caju_lp_attr') || {};
    var qs = new URLSearchParams(window.location.search);
    var fromUrl = {};
    ATTR_KEYS.forEach(function (k) {
      var v = (qs.get(k) || '').trim();
      if (v) fromUrl[k] = v.slice(0, 120);
    });
    var out = Object.keys(fromUrl).length ? fromUrl : saved;
    store.set('caju_lp_attr', out);
    return out;
  })();

  /* ---------- textos configuráveis ---------- */
  function preencherSla(scope) { $$('[data-sla]', scope).forEach(function (el) { el.textContent = CONFIG.sla; }); }
  preencherSla();
  $$('[data-termo-versao]').forEach(function (el) { el.textContent = 'Versão ' + CONFIG.termoVersao; });
  if (CONFIG.mode === 'prototype') {
    $('#proto-flag').hidden = false;
    $('.fc-foot').insertAdjacentHTML('beforeend', '<span class="fc-proto">Protótipo: nada é enviado.</span>');
  }

  /* ---------- topo e barra do celular ---------- */
  var top = $('.top');
  var card = $('#solicitar');
  var barra = $('#barra');
  var heroVisivel = true, cardVisivel = true;
  function syncBarra() { barra.classList.toggle('on', !desktop.matches && !heroVisivel && !cardVisivel); }
  window.addEventListener('scroll', function () { top.classList.toggle('rolou', window.scrollY > 8); }, { passive: true });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { heroVisivel = es[0].isIntersecting; syncBarra(); }).observe($('.hero'));
    new IntersectionObserver(function (es) { cardVisivel = es[0].isIntersecting; syncBarra(); }, { threshold: 0.15 }).observe(card);
  }

  // chama atenção para o cartão (desktop: ele já está na tela; celular: rola até ele)
  function realcar(foco) {
    card.classList.remove('realce');
    void card.offsetWidth;
    card.classList.add('realce');
    if (!desktop.matches) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (foco) foco.focus({ preventScroll: true });
  }

  /* ---------- abas ---------- */
  var tabs = { contrato: $('#tab-contrato'), conversa: $('#tab-conversa') };
  var paineis = { contrato: $('#painel-contrato'), conversa: $('#painel-conversa') };
  function abrirAba(nome, foco) {
    Object.keys(tabs).forEach(function (k) {
      var on = k === nome;
      tabs[k].setAttribute('aria-selected', on ? 'true' : 'false');
      tabs[k].tabIndex = on ? 0 : -1;
      paineis[k].hidden = !on;
    });
    if (foco) tabs[nome].focus();
  }
  tabs.contrato.addEventListener('click', function () { abrirAba('contrato'); });
  tabs.conversa.addEventListener('click', function () { abrirAba('conversa'); track('aba_especialista'); });
  $('.tabs').addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    abrirAba(tabs.contrato.getAttribute('aria-selected') === 'true' ? 'conversa' : 'contrato', true);
  });

  // links "falar com um especialista" no corpo da página
  $$('a[data-modo]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var modo = a.getAttribute('data-modo');
      abrirAba(modo);
      if (desktop.matches) e.preventDefault();
      var alvo = modo === 'conversa' ? $('#f-conversa').elements.nome : null;
      realcar(alvo);
    });
  });

  /* ---------- máscaras e validação ---------- */
  function digits(v) { return (v || '').replace(/\D/g, ''); }
  function maskCnpj(v) {
    var d = digits(v).slice(0, 14);
    return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
  }
  function maskFone(v) {
    var d = digits(v).slice(0, 11);
    if (d.length > 7) return '(' + d.slice(0, 2) + ') ' + d.slice(2, d.length - 4) + '-' + d.slice(-4);
    if (d.length > 2) return '(' + d.slice(0, 2) + ') ' + d.slice(2);
    return d;
  }
  function maskCep(v) { var d = digits(v).slice(0, 8); return d.length > 5 ? d.slice(0, 5) + '-' + d.slice(5) : d; }
  function bind(sel, fn) { $$(sel).forEach(function (el) { el.addEventListener('input', function () { el.value = fn(el.value); }); }); }
  bind('input[name="cnpj"]', maskCnpj);
  bind('input[name="whatsapp"]', maskFone);
  bind('input[name="cep"]', maskCep);
  bind('input[name="headcount"]', function (v) { return digits(v).slice(0, 7); });

  function cnpjValido(v) {
    var c = digits(v);
    if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
    function dv(base) {
      var pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      var s = 0;
      for (var i = 0; i < base.length; i++) s += +base[i] * pesos[i];
      var r = s % 11;
      return r < 2 ? 0 : 11 - r;
    }
    var d1 = dv(c.slice(0, 12));
    return +c[12] === d1 && +c[13] === dv(c.slice(0, 12) + d1);
  }
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var nomeOk = function (v) { return v.length >= 2; };
  var emailOk = function (v) { return EMAIL_RE.test(v); };
  var foneOk = function (v) { return !v || [10, 11].indexOf(digits(v).length) > -1; };
  var opcEmail = function (v) { return !v || EMAIL_RE.test(v); };

  function setErro(input, msg) {
    var id = input.form.id + '-' + input.name + '-err';
    var el = document.getElementById(id);
    if (msg) {
      if (!el) {
        el = document.createElement('span');
        el.id = id;
        el.className = 'field-err';
        input.insertAdjacentElement('afterend', el);
      }
      el.textContent = msg;
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', id);
    } else {
      if (el) el.remove();
      input.removeAttribute('aria-invalid');
      input.removeAttribute('aria-describedby');
    }
  }
  function validar(form, regras) {
    var primeiro = null;
    regras.forEach(function (r) {
      var input = form.elements[r[0]];
      var msg = r[1](input.value.trim()) ? '' : r[2];
      setErro(input, msg);
      if (msg && !primeiro) primeiro = input;
    });
    return primeiro;
  }
  function revalidarNoBlur(form, regras) {
    regras.forEach(function (r) {
      var input = form.elements[r[0]];
      input.addEventListener('blur', function () {
        if (input.getAttribute('aria-invalid') === 'true') validar(form, [r]);
      });
    });
  }
  function erroGeral(form, msg) {
    var el = $('.form-erro', form);
    if (!el) return;
    el.textContent = msg || '';
    el.hidden = !msg;
  }

  /* ---------- envio ---------- */
  var payloads = [];
  function enviar(form, etapa, dados) {
    if (CONFIG.mode === 'prototype') {
      payloads.push('// ' + etapa + '\n' + JSON.stringify(dados, null, 2));
      var box = $('#proto-payload');
      box.hidden = false;
      $('pre', box).textContent = payloads.join('\n\n');
      return new Promise(function (resolve) { setTimeout(resolve, 650); });
    }
    // JSONP no proc.php, como o embed oficial da AC: ela responde chamando funções globais
    return new Promise(function (resolve, reject) {
      var cfg = CONFIG.ac[form];
      if (!cfg || !cfg.f) { reject(new Error('config')); return; }
      var pares = [['u', cfg.u], ['f', cfg.f], ['s', ''], ['c', '0'], ['m', '0'], ['act', 'sub'], ['v', '2'], ['or', cfg.or]];
      Object.keys(dados.contato).forEach(function (k) {
        if (dados.contato[k] && CONFIG.ac.fields[k]) pares.push([CONFIG.ac.fields[k], dados.contato[k]]);
      });
      var fim = false, timer, s = document.createElement('script');
      function acabou(fn, arg) { if (fim) return; fim = true; clearTimeout(timer); s.remove(); fn(arg); }
      window._show_thank_you = function () { acabou(resolve); };
      window._show_unsubscribe = function () { acabou(resolve); };
      window._show_error = function (id, msg) { acabou(reject, new Error(String(msg || ''))); };
      s.src = CONFIG.ac.endpoint + '?' + pares.map(function (x) {
        return encodeURIComponent(x[0]) + '=' + encodeURIComponent(x[1]);
      }).join('&') + '&jsonp=true';
      s.onerror = function () { acabou(reject, new Error('rede')); };
      timer = setTimeout(function () { acabou(reject, new Error('tempo')); }, 15000);
      document.head.appendChild(s);
    });
  }
  function travar(btn) { btn.disabled = true; btn.dataset.txt = btn.innerHTML; btn.textContent = 'Enviando…'; }
  function destravar(btn) { btn.disabled = false; if (btn.dataset.txt) btn.innerHTML = btn.dataset.txt; }

  function atribuicao() {
    return {
      b2b_funil_origem: CONFIG.origem,
      b2b_consultor_codigo: attr.consultor || '',
      utm_source: attr.utm_source || '', utm_medium: attr.utm_medium || '',
      utm_campaign: attr.utm_campaign || '', utm_content: attr.utm_content || ''
    };
  }
  // faixa do campo 50, a mesma dos outros formulários: é o que o job usa para classificar
  function faixaPorte(n) {
    var faixas = [[1, 'Apenas eu / Autônomo(a)'], [5, '2 a 5 funcionários'], [10, '6 a 10 funcionários'], [20, '11 a 20 funcionários'],
      [50, '21 a 50 funcionários'], [100, '51 a 100 funcionários'], [250, '101 a 250 funcionários'], [500, '251 a 500 funcionários'],
      [1000, '501 a 1.000 funcionários']];
    for (var i = 0; i < faixas.length; i++) if (n <= faixas[i][0]) return faixas[i][1];
    return 'Mais de 1.000 funcionários';
  }
  function merge(a, b) { Object.keys(b).forEach(function (k) { a[k] = b[k]; }); return a; }

  /* ---------- etapas da trilha de contrato ---------- */
  var ETAPAS = {
    'f-voce': { n: 1, t: 'Etapa 1 de 3 · Você' },
    'f-empresa': { n: 2, t: 'Etapa 2 de 3 · Empresa' },
    'ok-solicitacao': { n: 3, t: 'Solicitação enviada · etapa 3 é opcional', feito: 2 },
    'f-juridico': { n: 3, t: 'Etapa 3 de 3 · Dados do contrato (opcional)', feito: 2 },
    'f-assinatura': { n: 3, t: 'Etapa 3 de 3 · Assinatura e financeiro (opcional)', feito: 2 },
    'ok-final': { n: 3, t: 'Tudo certo', feito: 3 }
  };
  var atual = 'f-voce';
  var iniciou = false;
  function mostrarEtapa(id) {
    atual = id;
    Object.keys(ETAPAS).forEach(function (k) { $('#' + k).hidden = k !== id; });
    var e = ETAPAS[id];
    var feito = e.feito || e.n - 1;
    $$('#prog span').forEach(function (s, i) {
      s.className = i < feito ? 'done' : (i === e.n - 1 ? 'on' : '');
    });
    $('#prog-t').textContent = e.t;
    $('#barra-t').textContent = id === 'f-voce' ? 'Solicitar contrato'
      : (id === 'ok-final' ? 'Ver minha solicitação' : 'Continuar solicitação');
    var alvo = $('#' + id);
    var campo = alvo.querySelector('input:not([type=radio]):not([type=checkbox]), button');
    $('.fc-body').scrollTop = 0;
    if (campo && alvo.tagName === 'FORM') campo.focus({ preventScroll: true });
    else alvo.focus({ preventScroll: true });
    if (!desktop.matches) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    track('etapa', { etapa: id });
  }

  var contato = {};
  function preencherConfirmacao(scope) {
    $$('[data-nome]', scope).forEach(function (el) { el.textContent = contato.nome ? ', ' + contato.nome.split(' ')[0] : ''; });
    $$('[data-email]', scope).forEach(function (el) { el.textContent = contato.email || 'seu e-mail'; });
  }
  function valorRadio(form, nome) {
    var r = form.querySelector('input[name="' + nome + '"]:checked');
    return r ? r.value : '';
  }

  // primeiro toque no formulário (medição de início)
  $('#painel-contrato').addEventListener('focusin', function () {
    if (!iniciou) { iniciou = true; track('inicio_formulario'); }
  });

  /* passo 1: você */
  var fVoce = $('#f-voce');
  var regrasVoce = [
    ['nome', nomeOk, 'Conte pra gente o seu nome.'],
    ['email', emailOk, 'Confira o e-mail.'],
    ['whatsapp', foneOk, 'Informe o WhatsApp com DDD.']
  ];
  revalidarNoBlur(fVoce, regrasVoce);
  fVoce.addEventListener('submit', function (e) {
    e.preventDefault();
    var p = validar(fVoce, regrasVoce);
    if (p) { p.focus(); return; }
    var v = function (n) { return fVoce.elements[n].value.trim(); };
    contato = { nome: v('nome'), email: v('email'), cargo: v('cargo'), whatsapp: v('whatsapp') };
    mostrarEtapa('f-empresa');
  });

  /* passo 2: empresa + termo -> envia a solicitação (F-A) */
  var fEmp = $('#f-empresa');
  var regrasEmp = [
    ['empresa', nomeOk, 'Informe o nome da empresa.'],
    ['cnpj', cnpjValido, 'Confira o CNPJ: são 14 dígitos válidos.'],
    ['headcount', function (v) { return +digits(v) >= 1; }, 'Informe um número aproximado.']
  ];
  revalidarNoBlur(fEmp, regrasEmp);
  fEmp.addEventListener('submit', function (e) {
    e.preventDefault();
    erroGeral(fEmp);
    var p = validar(fEmp, regrasEmp);
    var aceite = fEmp.elements.aceite;
    aceite.closest('.aceite').classList.toggle('erro', !aceite.checked);
    if (p) { p.focus(); return; }
    if (!aceite.checked) {
      erroGeral(fEmp, 'Para enviar, é preciso aceitar o Termo de Solicitação.');
      aceite.focus();
      return;
    }
    var v = function (n) { return fEmp.elements[n].value.trim(); };
    contato.empresa = v('empresa');
    contato.cnpj = digits(v('cnpj'));
    var dados = {
      contato: merge({
        fullname: contato.nome,
        email: contato.email,
        phone: contato.whatsapp ? '+55' + digits(contato.whatsapp) : '',
        cargo_na_empresa: contato.cargo,
        nome_da_empresa: contato.empresa,
        b2b_cnpj: contato.cnpj,
        b2b_headcount: digits(v('headcount')),
        porte: faixaPorte(+digits(v('headcount'))),
        b2b_plano_interesse: valorRadio(fEmp, 'plano'),
        b2b_termo_versao: CONFIG.termoVersao,
        b2b_termo_aceite_em: new Date().toISOString()
      }, atribuicao()),
      negocio: { pipeline: 'Funil Eva Maternidade', estagio: 'Contrato solicitado' },
      automacao: 'cria o negócio, avisa a Eva e envia a confirmação com o Termo'
    };
    var btn = $('button[type="submit"]', fEmp);
    travar(btn);
    enviar('solicitacao', 'Solicitação de contrato', dados).then(function () {
      destravar(btn);
      preencherConfirmacao($('#ok-solicitacao'));
      track('solicitacao_enviada', { plano: dados.contato.b2b_plano_interesse || 'nao_informado' });
      mostrarEtapa('ok-solicitacao');
    }, function () {
      destravar(btn);
      erroGeral(fEmp, 'Não conseguimos enviar agora. Tente de novo em instantes.');
    });
  });

  $$('[data-voltar]').forEach(function (b) {
    b.addEventListener('click', function () { mostrarEtapa(b.getAttribute('data-voltar')); });
  });

  /* passo 3 (opcional): dados do contrato */
  var fJur = $('#f-juridico');
  var fAss = $('#f-assinatura');
  var juridico = {};

  (function mesesInicio() {
    var sel = $('#f-inicio');
    var nomes = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    var d = new Date();
    for (var i = 0; i < 6; i++) {
      var m = new Date(d.getFullYear(), d.getMonth() + i, 1);
      var t = nomes[m.getMonth()] + ' de ' + m.getFullYear();
      sel.add(new Option(t.charAt(0).toUpperCase() + t.slice(1), t));
    }
    sel.add(new Option('Ainda não sei', 'ainda não sei'));
  })();

  function preencherSeVazio(nome, valor) {
    var el = fJur.elements[nome];
    if (el && !el.value && valor) el.value = valor;
  }
  function buscarCnpj() {
    var status = $('#cnpj-status');
    if (!contato.cnpj || !window.fetch) return;
    status.textContent = 'Buscando os dados da empresa pelo CNPJ…';
    var ctrl = 'AbortController' in window ? new AbortController() : null;
    var t = setTimeout(function () { if (ctrl) ctrl.abort(); }, 6000);
    fetch('https://brasilapi.com.br/api/cnpj/v1/' + contato.cnpj, ctrl ? { signal: ctrl.signal } : {})
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) {
        clearTimeout(t);
        var rua = [j.descricao_tipo_de_logradouro, j.logradouro].filter(Boolean).join(' ');
        preencherSeVazio('razao_social', j.razao_social);
        preencherSeVazio('endereco', [rua, j.numero, j.complemento, j.bairro].filter(Boolean).join(', '));
        preencherSeVazio('cep', j.cep ? maskCep(String(j.cep)) : '');
        preencherSeVazio('cidade_uf', j.municipio ? j.municipio + (j.uf ? ' / ' + j.uf : '') : '');
        status.textContent = 'Preenchemos com os dados públicos do CNPJ. Confira e corrija se precisar.';
      })
      .catch(function () {
        clearTimeout(t);
        status.textContent = 'Não conseguimos buscar os dados pelo CNPJ. Preencha à mão ou pule.';
      });
  }

  $('#ir-contrato').addEventListener('click', function () {
    mostrarEtapa('f-juridico');
    buscarCnpj();
  });

  fJur.addEventListener('submit', function (e) {
    e.preventDefault();
    var v = function (n) { return fJur.elements[n].value.trim(); };
    juridico = {
      b2b_razao_social: v('razao_social'),
      b2b_endereco: [v('endereco'), v('cidade_uf'), v('cep')].filter(Boolean).join(' · ')
    };
    mostrarEtapa('f-assinatura');
  });

  $$('input[name="signatario"]', fAss).forEach(function (r) {
    r.addEventListener('change', function () { $('#sig-campos').hidden = valorRadio(fAss, 'signatario') !== 'Outra pessoa'; });
  });

  function finalizar(completo) {
    var fim = $('#ok-final');
    $('[data-final-msg]', fim).textContent = completo
      ? 'Já temos o que precisamos para montar o contrato.'
      : 'Sem problema. A equipe da Eva pede o que faltar quando enviar o contrato.';
    preencherConfirmacao(fim);
    preencherSla(fim);
    mostrarEtapa('ok-final');
  }

  function enviarContrato(extra, btn) {
    var dados = {
      contato: merge(merge({ email: contato.email }, juridico), extra || {}),
      automacao: 'atualiza o contato e avisa a Eva'
    };
    if (btn) travar(btn);
    return enviar('contrato', 'Dados do contrato', dados).then(function () {
      if (btn) destravar(btn);
      track('contrato_completo');
      finalizar(true);
    }, function () {
      if (btn) destravar(btn);
      erroGeral(fAss, 'Não conseguimos enviar agora. Tente de novo em instantes.');
    });
  }

  var regrasAss = [
    ['sig_email', opcEmail, 'Confira o e-mail de quem assina.'],
    ['fin_email', opcEmail, 'Confira o e-mail do financeiro.']
  ];
  revalidarNoBlur(fAss, regrasAss);
  fAss.addEventListener('submit', function (e) {
    e.preventDefault();
    erroGeral(fAss);
    var p = validar(fAss, regrasAss);
    if (p) { p.focus(); return; }
    var v = function (n) { return fAss.elements[n].value.trim(); };
    var outra = valorRadio(fAss, 'signatario') === 'Outra pessoa';
    enviarContrato({
      b2b_signatario_nome: outra ? v('sig_nome') : contato.nome,
      b2b_signatario_cargo: outra ? v('sig_cargo') : contato.cargo,
      b2b_signatario_email: outra ? v('sig_email') : contato.email,
      b2b_financeiro_email: v('fin_email'),
      b2b_inicio_previsto: v('inicio'),
      b2b_observacoes: v('obs')
    }, $('button[type="submit"]', fAss));
  });

  // "pular": da confirmação encerra; dos dados jurídicos vai à assinatura;
  // da assinatura envia o que já foi preenchido (se houver)
  $$('[data-pular]').forEach(function (b) {
    b.addEventListener('click', function () {
      track('pulou', { etapa: atual });
      if (atual === 'f-juridico') { juridico = {}; mostrarEtapa('f-assinatura'); return; }
      if (atual === 'f-assinatura' && (juridico.b2b_razao_social || juridico.b2b_endereco)) { enviarContrato(null, null); return; }
      finalizar(false);
    });
  });

  /* ---------- planos: escolhe o plano no formulário ---------- */
  $$('[data-plano]').forEach(function (b) {
    b.addEventListener('click', function () {
      var r = $('#f-empresa input[name="plano"][value="' + b.getAttribute('data-plano') + '"]');
      if (r) r.checked = true;
      abrirAba('contrato');
      track('plano_escolhido', { plano: b.getAttribute('data-plano') });
      var foco = null;
      if (atual === 'f-voce') foco = fVoce.elements.nome.value ? fVoce.querySelector('button[type=submit]') : fVoce.elements.nome;
      else if (atual === 'f-empresa') foco = fEmp.elements.empresa;
      realcar(foco);
    });
  });

  /* ---------- falar com especialista ---------- */
  var fConv = $('#f-conversa');
  var regrasConv = [
    ['nome', nomeOk, 'Conte pra gente o seu nome.'],
    ['email', emailOk, 'Confira o e-mail.'],
    ['empresa', nomeOk, 'Informe o nome da empresa.'],
    ['whatsapp', foneOk, 'Informe o WhatsApp com DDD.']
  ];
  revalidarNoBlur(fConv, regrasConv);
  fConv.addEventListener('submit', function (e) {
    e.preventDefault();
    erroGeral(fConv);
    var p = validar(fConv, regrasConv);
    if (p) { p.focus(); return; }
    var v = function (n) { return fConv.elements[n].value.trim(); };
    contato = merge(contato, { nome: v('nome'), email: v('email'), empresa: v('empresa'), whatsapp: v('whatsapp') });
    var dados = {
      contato: merge({
        fullname: contato.nome,
        email: contato.email,
        phone: contato.whatsapp ? '+55' + digits(contato.whatsapp) : '',
        nome_da_empresa: contato.empresa,
        b2b_observacoes: v('mensagem')
      }, atribuicao()),
      negocio: { pipeline: 'Funil Eva Maternidade', estagio: 'Lead recebido' },
      automacao: 'cria o negócio, avisa a Eva e envia a confirmação'
    };
    var btn = $('button[type="submit"]', fConv);
    travar(btn);
    enviar('especialista', 'Falar com especialista', dados).then(function () {
      destravar(btn);
      fConv.hidden = true;
      preencherConfirmacao($('#ok-conversa'));
      $('#ok-conversa').hidden = false;
      $('#ok-conversa').focus({ preventScroll: true });
      track('especialista_enviado');
    }, function () {
      destravar(btn);
      erroGeral(fConv, 'Não conseguimos enviar agora. Tente de novo em instantes.');
    });
  });

  // da conversa para o contrato, aproveitando o que já foi digitado
  $$('[data-ir-contrato]').forEach(function (b) {
    b.addEventListener('click', function () {
      ['nome', 'email', 'whatsapp'].forEach(function (n) { if (!fVoce.elements[n].value) fVoce.elements[n].value = contato[n] || ''; });
      if (!fEmp.elements.empresa.value) fEmp.elements.empresa.value = contato.empresa || '';
      abrirAba('contrato');
      if (atual === 'f-voce') mostrarEtapa('f-voce');
    });
  });

  /* ---------- termo ---------- */
  var termo = $('#termo');
  $$('[data-abre-termo]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (typeof termo.showModal === 'function') termo.showModal();
      else termo.setAttribute('open', '');
      track('termo_aberto');
    });
  });
  termo.addEventListener('click', function (e) { if (e.target === termo) termo.close(); });
})();
