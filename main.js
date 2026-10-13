/*
 * LP Eva × Caju: solicitação de contrato.
 *
 * Em `mode: 'prototype'` nada sai da página: os envios são simulados e o
 * painel "o que seria registrado na AC" mostra o payload de cada etapa.
 * Para ligar à ActiveCampaign (depois da validação do fluxo), preencher
 * `CONFIG.ac` com os formulários F-A/F-B e os ids dos campos `b2b_*`, e trocar
 * `mode` para 'live' (ver ../tasks/T001_prototipo-lp-caju.md).
 */
var CONFIG = {
  mode: 'prototype',
  // prazo de envio do contrato (pendente de confirmação com a Nathália)
  sla: '2 dias úteis',
  termoVersao: 'v0 · rascunho em revisão jurídica (13/10/2026)',
  canalPadrao: 'caju',
  ac: {
    endpoint: 'https://bastasentir.activehosted.com/proc.php',
    u: '',
    solicitacao: { f: '', or: '' }, // F-A: etapa 1 e "prefiro conversar"
    contrato: { f: '', or: '' },    // F-B: etapa 2
    fields: {}                      // nome semântico -> 'field[ID]'
  }
};

(function () {
  'use strict';

  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };

  var store = {
    get: function (k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } },
    set: function (k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sem storage */ } }
  };

  /* ---------- atribuição: canal, consultor e UTMs da URL ---------- */
  var ATTR_KEYS = ['canal', 'consultor', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  var attr = (function () {
    var saved = store.get('caju_lp_attr') || {};
    var qs = new URLSearchParams(window.location.search);
    var fromUrl = {};
    ATTR_KEYS.forEach(function (k) {
      var v = (qs.get(k) || '').trim();
      if (v) fromUrl[k] = v.slice(0, 120);
    });
    var out = Object.keys(fromUrl).length ? fromUrl : saved;
    if (!out.canal) out.canal = CONFIG.canalPadrao;
    store.set('caju_lp_attr', out);
    return out;
  })();

  /* ---------- textos configuráveis ---------- */
  $$('[data-sla]').forEach(function (el) { el.textContent = CONFIG.sla; });
  $$('[data-termo-versao]').forEach(function (el) { el.textContent = 'Versão ' + CONFIG.termoVersao; });
  if (CONFIG.mode === 'prototype') $('#proto-flag').hidden = false;

  /* ---------- topo, barra mobile e entrada suave ---------- */
  var top = $('.top');
  var barra = $('#barra-mobile');
  var hero = $('.hero');
  var solicitar = $('#solicitar');
  var heroVisivel = true, formVisivel = false;
  function syncBarra() { barra.classList.toggle('on', !heroVisivel && !formVisivel); }
  window.addEventListener('scroll', function () { top.classList.toggle('rolou', window.scrollY > 8); }, { passive: true });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { heroVisivel = es[0].isIntersecting; syncBarra(); }).observe(hero);
    new IntersectionObserver(function (es) { formVisivel = es[0].isIntersecting; syncBarra(); }, { threshold: 0.05 }).observe(solicitar);
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    $$('.reveal').forEach(function (el) { io.observe(el); });
  } else {
    $$('.reveal').forEach(function (el) { el.classList.add('in'); });
  }

  /* ---------- abas: contrato x conversa ---------- */
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
  tabs.conversa.addEventListener('click', function () { abrirAba('conversa'); });
  $('.tabs').addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    abrirAba(tabs.contrato.getAttribute('aria-selected') === 'true' ? 'conversa' : 'contrato', true);
  });

  // links que levam ao formulário escolhem a aba e, se houver, o plano
  $$('[data-modo]').forEach(function (a) {
    a.addEventListener('click', function () {
      abrirAba(a.getAttribute('data-modo'));
      var plano = a.getAttribute('data-plano');
      if (plano) {
        var r = $('#form-etapa1 input[name="plano"][value="' + plano + '"]');
        if (r) r.checked = true;
      }
    });
  });

  /* ---------- máscaras ---------- */
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
    var d2 = dv(c.slice(0, 12) + d1);
    return +c[12] === d1 && +c[13] === d2;
  }
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  /* ---------- validação ---------- */
  function setErro(input, msg) {
    var id = (input.form ? input.form.id : 'f') + '-' + input.name + '-err';
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

  var opcional = function (fn) { return function (v) { return !v || fn(v); }; };
  var regrasEtapa1 = [
    ['nome', function (v) { return v.length >= 2; }, 'Conte pra gente o seu nome.'],
    ['email', function (v) { return EMAIL_RE.test(v); }, 'Confira o e-mail.'],
    ['empresa', function (v) { return v.length >= 2; }, 'Informe o nome da empresa.'],
    ['cnpj', cnpjValido, 'Confira o CNPJ: ele precisa ter 14 dígitos válidos.'],
    ['headcount', function (v) { return +digits(v) >= 1; }, 'Informe um número aproximado de colaboradores.'],
    ['whatsapp', opcional(function (v) { var n = digits(v).length; return n === 10 || n === 11; }), 'Informe o WhatsApp com DDD.']
  ];
  var regrasConversa = [
    ['nome', function (v) { return v.length >= 2; }, 'Conte pra gente o seu nome.'],
    ['email', function (v) { return EMAIL_RE.test(v); }, 'Confira o e-mail.'],
    ['empresa', function (v) { return v.length >= 2; }, 'Informe o nome da empresa.'],
    ['whatsapp', opcional(function (v) { var n = digits(v).length; return n === 10 || n === 11; }), 'Informe o WhatsApp com DDD.']
  ];
  var regrasEtapa2 = [
    ['sig_email', opcional(function (v) { return EMAIL_RE.test(v); }), 'Confira o e-mail de quem assina.'],
    ['fin_email', opcional(function (v) { return EMAIL_RE.test(v); }), 'Confira o e-mail do financeiro.']
  ];

  /* ---------- envio ---------- */
  var payloads = [];
  function mostrarPayload(etapa, dados) {
    if (CONFIG.mode !== 'prototype') return;
    payloads.push('// ' + etapa + '\n' + JSON.stringify(dados, null, 2));
    var box = $('#proto-payload');
    box.hidden = false;
    $('pre', box).textContent = payloads.join('\n\n');
  }

  function enviar(etapa, dados) {
    if (CONFIG.mode === 'prototype') {
      mostrarPayload(etapa, dados);
      return new Promise(function (resolve) { setTimeout(resolve, 700); });
    }
    // modo live: ligar ao proc.php (JSONP) da AC na próxima etapa do projeto
    return Promise.reject(new Error('Envio ainda não configurado.'));
  }

  function travar(btn, txt) {
    btn.disabled = true;
    btn.dataset.txt = btn.textContent;
    btn.textContent = txt || 'Enviando…';
  }
  function destravar(btn) {
    btn.disabled = false;
    if (btn.dataset.txt) btn.textContent = btn.dataset.txt;
  }
  function erroGeral(form, msg) {
    var el = $('.form-erro', form);
    el.textContent = msg || '';
    el.hidden = !msg;
  }
  function mostrar(el) {
    el.hidden = false;
    el.focus({ preventScroll: true });
    $('#form-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  /* etapa 1 */
  var f1 = $('#form-etapa1');
  revalidarNoBlur(f1, regrasEtapa1);
  f1.addEventListener('submit', function (e) {
    e.preventDefault();
    erroGeral(f1);
    var primeiro = validar(f1, regrasEtapa1);
    var aceite = f1.elements.aceite;
    var aceiteBox = aceite.closest('.aceite');
    aceiteBox.classList.toggle('erro', !aceite.checked);
    if (primeiro) { primeiro.focus(); return; }
    if (!aceite.checked) {
      erroGeral(f1, 'Para enviar, é preciso aceitar o Termo de Solicitação.');
      aceite.focus();
      return;
    }
    var v = function (n) { return f1.elements[n].value.trim(); };
    contato = { nome: v('nome'), email: v('email'), empresa: v('empresa'), cnpj: digits(v('cnpj')) };
    var dados = {
      contato: {
        fullname: contato.nome,
        email: contato.email,
        phone: v('whatsapp') ? '+55' + digits(v('whatsapp')) : '',
        nome_da_empresa: contato.empresa,
        cargo_na_empresa: v('cargo'),
        b2b_cnpj: contato.cnpj,
        b2b_headcount: digits(v('headcount')),
        b2b_plano_interesse: valorRadio(f1, 'plano'),
        b2b_intencao: 'contrato',
        b2b_termo_versao: CONFIG.termoVersao,
        b2b_termo_aceite_em: new Date().toISOString(),
        b2b_canal: attr.canal,
        b2b_consultor_codigo: attr.consultor || '',
        utm_source: attr.utm_source || '', utm_medium: attr.utm_medium || '',
        utm_campaign: attr.utm_campaign || '', utm_content: attr.utm_content || ''
      },
      tags: ['b2b_origem_sva_caju'],
      negocio: { pipeline: 'Canal Parceiros', estagio: 'Solicitação de contrato' },
      make: 'busca e-mail do consultor no Notion → notifica a Eva (consultor em cópia) → envia confirmação com o Termo'
    };
    var btn = $('button[type="submit"]', f1);
    travar(btn);
    enviar('Etapa 1 · formulário F-A', dados).then(function () {
      f1.hidden = true;
      preencherConfirmacao($('#ok-etapa1'));
      mostrar($('#ok-etapa1'));
    }, function () {
      destravar(btn);
      erroGeral(f1, 'Não conseguimos enviar agora. Tente de novo em instantes.');
    });
  });

  /* etapa 2 */
  var f2 = $('#form-etapa2');
  revalidarNoBlur(f2, regrasEtapa2);

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

  $$('input[name="signatario"]', f2).forEach(function (r) {
    r.addEventListener('change', function () { $('#sig-campos').hidden = valorRadio(f2, 'signatario') !== 'Outra pessoa'; });
  });

  function preencherSeVazio(nome, valor) {
    var el = f2.elements[nome];
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
        var end = [rua, j.numero, j.complemento, j.bairro].filter(Boolean).join(', ');
        preencherSeVazio('razao_social', j.razao_social);
        preencherSeVazio('endereco', end);
        preencherSeVazio('cep', j.cep ? maskCep(String(j.cep)) : '');
        preencherSeVazio('cidade_uf', j.municipio ? j.municipio + (j.uf ? ' / ' + j.uf : '') : '');
        status.textContent = 'Preenchemos com os dados públicos do CNPJ. Confira e corrija se precisar.';
      })
      .catch(function () {
        clearTimeout(t);
        status.textContent = 'Não conseguimos buscar os dados pelo CNPJ. Pode preencher à mão ou pular.';
      });
  }

  $('#ir-etapa2').addEventListener('click', function () {
    $('#ok-etapa1').hidden = true;
    f2.hidden = false;
    buscarCnpj();
    $('#form-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    f2.elements.razao_social.focus({ preventScroll: true });
  });

  function finalizar(pulou) {
    $('#ok-etapa1').hidden = true;
    f2.hidden = true;
    var fim = $('#ok-final');
    $('[data-final-msg]', fim).innerHTML = pulou
      ? 'Sem problema. O contrato chega em <b data-email></b> em até <span data-sla></span>, e a equipe da Eva pede o que faltar.'
      : 'Já temos o que precisamos. O contrato chega em <b data-email></b> em até <span data-sla></span>.';
    $$('[data-sla]', fim).forEach(function (el) { el.textContent = CONFIG.sla; });
    preencherConfirmacao(fim);
    mostrar(fim);
  }
  $$('[data-pular]').forEach(function (b) { b.addEventListener('click', function () { finalizar(true); }); });

  f2.addEventListener('submit', function (e) {
    e.preventDefault();
    erroGeral(f2);
    var primeiro = validar(f2, regrasEtapa2);
    if (primeiro) { primeiro.focus(); return; }
    var v = function (n) { return f2.elements[n].value.trim(); };
    var outra = valorRadio(f2, 'signatario') === 'Outra pessoa';
    var dados = {
      contato: {
        email: contato.email,
        b2b_razao_social: v('razao_social'),
        b2b_endereco: [v('endereco'), v('cidade_uf'), v('cep')].filter(Boolean).join(' · '),
        b2b_signatario_nome: outra ? v('sig_nome') : contato.nome,
        b2b_signatario_cargo: outra ? v('sig_cargo') : '',
        b2b_signatario_email: outra ? v('sig_email') : contato.email,
        b2b_financeiro_nome: v('fin_nome'),
        b2b_financeiro_email: v('fin_email'),
        b2b_inicio_previsto: v('inicio'),
        b2b_observacoes: v('obs')
      },
      negocio: { estagio: 'Dados completos (via automação)' }
    };
    var btn = $('button[type="submit"]', f2);
    travar(btn);
    enviar('Etapa 2 · formulário F-B', dados).then(function () { finalizar(false); }, function () {
      destravar(btn);
      erroGeral(f2, 'Não conseguimos enviar agora. Tente de novo em instantes.');
    });
  });

  /* conversa */
  var fc = $('#form-conversa');
  revalidarNoBlur(fc, regrasConversa);
  fc.addEventListener('submit', function (e) {
    e.preventDefault();
    erroGeral(fc);
    var primeiro = validar(fc, regrasConversa);
    if (primeiro) { primeiro.focus(); return; }
    var v = function (n) { return fc.elements[n].value.trim(); };
    contato = { nome: v('nome'), email: v('email'), empresa: v('empresa') };
    var dados = {
      contato: {
        fullname: contato.nome,
        email: contato.email,
        phone: v('whatsapp') ? '+55' + digits(v('whatsapp')) : '',
        nome_da_empresa: contato.empresa,
        b2b_intencao: 'conversa',
        b2b_observacoes: v('mensagem'),
        b2b_canal: attr.canal,
        b2b_consultor_codigo: attr.consultor || '',
        utm_source: attr.utm_source || '', utm_medium: attr.utm_medium || '',
        utm_campaign: attr.utm_campaign || '', utm_content: attr.utm_content || ''
      },
      tags: ['b2b_origem_sva_caju'],
      negocio: { pipeline: 'Canal Parceiros', estagio: 'Contato solicitado' },
      make: 'busca e-mail do consultor no Notion → notifica a Eva para responder (consultor em cópia)'
    };
    var btn = $('button[type="submit"]', fc);
    travar(btn);
    enviar('Prefiro conversar · formulário F-A', dados).then(function () {
      fc.hidden = true;
      preencherConfirmacao($('#ok-conversa'));
      mostrar($('#ok-conversa'));
    }, function () {
      destravar(btn);
      erroGeral(fc, 'Não conseguimos enviar agora. Tente de novo em instantes.');
    });
  });

  // da confirmação da conversa para a trilha de contrato, aproveitando o que já foi digitado
  $$('[data-ir-contrato]').forEach(function (b) {
    b.addEventListener('click', function () {
      ['nome', 'email', 'empresa'].forEach(function (n) { if (!f1.elements[n].value) f1.elements[n].value = contato[n] || ''; });
      abrirAba('contrato');
      f1.elements.cnpj.focus();
    });
  });

  /* ---------- termo ---------- */
  var termo = $('#termo');
  $$('[data-abre-termo]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (typeof termo.showModal === 'function') termo.showModal();
      else termo.setAttribute('open', '');
    });
  });
  termo.addEventListener('click', function (e) { if (e.target === termo) termo.close(); });
})();
