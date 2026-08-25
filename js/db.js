/* ============================================================
   VIDA+ PACIENTE — Camada de dados
   ------------------------------------------------------------
   FLUXO (dados criados pela equipe da unidade, paciente só lê):
     1. RECEPÇÃO cadastra o paciente e INICIA o atendimento
        → aparece no app automaticamente (senha + unidade)
     2. ENFERMEIRA preenche queixa + sinais vitais (triagem)
        → paciente acompanha no app
     3. TELÃO chama o nome → NOTIFICAÇÃO no celular
     4. MÉDICO finaliza → relatório, medicamentos e exames
        ficam disponíveis no app (com notificação de resultado)

   MODO DEMO (padrão): dados no navegador (localStorage).
   MODO SUPABASE: quando URL/chave preenchidas no config.js,
   usa o banco compartilhado com o Sistema Médico.
   ============================================================ */

(function () {
  const PREFIXO = 'vidamais_';
  const CHAVE_PACIENTE = PREFIXO + 'paciente';
  const CHAVE_SESSAO = PREFIXO + 'sessao';
  const CHAVE_CONSULTAS = PREFIXO + 'consultas';
  const CHAVE_AGENDAMENTOS = PREFIXO + 'agendamentos';
  const CHAVE_NOTIFICACOES = PREFIXO + 'notificacoes';

  const DB = {};

  /* ================= MODO DEMO (localStorage) ================= */
  function ler(chave) {
    try { return JSON.parse(localStorage.getItem(chave)); } catch (e) { return null; }
  }
  function gravar(chave, valor) {
    localStorage.setItem(chave, JSON.stringify(valor));
  }
  function gerarSenha() {
    const prefixos = ['A', 'B', 'C', 'D', 'E'];
    const p = prefixos[Math.floor(Math.random() * prefixos.length)];
    return p + String(100 + Math.floor(Math.random() * 900));
  }

  /* ================= PACIENTE ================= */
  DB.cadastrarPaciente = async function (dados) {
    if (SUPABASE_CONFIGURADO) {
      const { data, error } = await supabase
        .from('pacientes').insert([{ ...dados, criado_em: new Date().toISOString() }]).select().single();
      if (error) throw new Error(error.message);
      return data;
    }
    gravar(CHAVE_PACIENTE, dados);
    return dados;
  };

  DB.atualizarPaciente = async function (dados) {
    if (SUPABASE_CONFIGURADO) {
      const { error } = await supabase
        .from('pacientes').update({ ...dados, atualizado_em: new Date().toISOString() }).eq('cpf', dados.cpf);
      if (error) throw new Error(error.message);
      return dados;
    }
    gravar(CHAVE_PACIENTE, { ...ler(CHAVE_PACIENTE), ...dados });
    return dados;
  };

  DB.getPaciente = async function (cpf) {
    if (SUPABASE_CONFIGURADO) {
      const { data, error } = await supabase.from('pacientes').select('*').eq('cpf', cpf).maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    }
    const p = ler(CHAVE_PACIENTE);
    return p && (!cpf || p.cpf === cpf) ? p : null;
  };

  /* ================= SESSÃO ================= */
  DB.setSessao = function (cpf) { sessionStorage.setItem(CHAVE_SESSAO, cpf); };
  DB.getSessao = function () { return sessionStorage.getItem(CHAVE_SESSAO); };
  DB.clearSessao = function () { sessionStorage.removeItem(CHAVE_SESSAO); };

  /* ================= CONSULTAS =================
     Status: em_fila → chamado → em_consulta → finalizado | cancelado
     Dados:
       recepcao  = criado pela recepção (senha, unidade, obs)
       triagem   = enfermeira (queixa, sinais vitais, risco)
       relatorio = médico (diagnóstico, medicamentos, exames) */
  DB.getConsultas = async function (cpf) {
    if (SUPABASE_CONFIGURADO) {
      const { data, error } = await supabase
        .from('consultas').select('*').eq('cpf', cpf).order('criado_em', { ascending: false });
      if (error) throw new Error(error.message);
      return data;
    }
    return (ler(CHAVE_CONSULTAS) || []).filter(c => c.cpf === cpf);
  };

  DB.getMinhaFila = async function (cpf) {
    if (SUPABASE_CONFIGURADO) {
      const { data, error } = await supabase
        .from('consultas').select('*')
        .eq('cpf', cpf).in('status', ['em_fila', 'chamado', 'em_consulta'])
        .order('criado_em', { ascending: true });
      if (error) throw new Error(error.message);
      const posicao = await DB.getPosicaoNaFila(data[0] ? data[0].id : null);
      return { ativa: data.length ? data[0] : null, posicao };
    }
    const lista = ler(CHAVE_CONSULTAS) || [];
    const ativas = lista
      .filter(c => c.cpf === cpf && ['em_fila', 'chamado', 'em_consulta'].includes(c.status))
      .sort((a, b) => new Date(a.criado_em) - new Date(b.criado_em));
    const posicao = await DB.getPosicaoNaFila(ativas[0] ? ativas[0].id : null);
    return { ativa: ativas.length ? ativas[0] : null, posicao };
  };

  DB.getPosicaoNaFila = async function (idConsulta) {
    if (SUPABASE_CONFIGURADO) {
      if (!idConsulta) return 0;
      const { data, error } = await supabase
        .from('consultas').select('id').eq('status', 'em_fila').order('criado_em', { ascending: true });
      if (error) throw new Error(error.message);
      return data.findIndex(c => c.id === idConsulta) + 1;
    }
    const lista = (ler(CHAVE_CONSULTAS) || [])
      .filter(c => c.status === 'em_fila')
      .sort((a, b) => new Date(a.criado_em) - new Date(b.criado_em));
    return lista.findIndex(c => c.id === idConsulta) + 1;
  };

  DB.cancelarConsulta = async function (id) {
    if (SUPABASE_CONFIGURADO) {
      const { error } = await supabase
        .from('consultas').update({ status: 'cancelado', cancelado_em: new Date().toISOString() }).eq('id', id);
      if (error) throw new Error(error.message);
      return;
    }
    const lista = ler(CHAVE_CONSULTAS) || [];
    const c = lista.find(x => x.id === id);
    if (c) { c.status = 'cancelado'; c.cancelado_em = new Date().toISOString(); }
    gravar(CHAVE_CONSULTAS, lista);
  };

  /* ================= EXAMES =================
     Vêm dos relatórios das consultas finalizadas (sistema médico). */
  DB.getExames = async function (cpf) {
    if (SUPABASE_CONFIGURADO) {
      const { data, error } = await supabase
        .from('consultas').select('*').eq('cpf', cpf).eq('status', 'finalizado')
        .order('finalizado_em', { ascending: false });
      if (error) throw new Error(error.message);
      const exames = [];
      data.forEach(c => (c.receita_exames || c.exames || []).forEach(e =>
        exames.push({ ...e, consulta_id: c.id, data: c.finalizado_em, unidade: c.unidade })));
      return exames;
    }
    const consultas = (await DB.getConsultas(cpf))
      .filter(c => c.status === 'finalizado' && c.relatorio && c.relatorio.exames);
    const exames = [];
    consultas.forEach(c =>
      c.relatorio.exames.forEach(e =>
        exames.push({
          ...e,
          consulta_id: c.id,
          data: c.relatorio.finalizado_em || c.finalizado_em || c.criado_em,
          unidade: c.unidade
        })));
    return exames;
  };

  /* ================= AGENDAMENTOS ================= */
  DB.getAgendamentos = async function (cpf) {
    if (SUPABASE_CONFIGURADO) {
      const { data, error } = await supabase
        .from('agendamentos').select('*').eq('paciente_cpf', cpf).order('data_hora', { ascending: true });
      if (error) throw new Error(error.message);
      return data;
    }
    return (ler(CHAVE_AGENDAMENTOS) || [])
      .filter(a => a.cpf === cpf)
      .sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora));
  };

  DB.cancelarAgendamento = async function (id) {
    if (SUPABASE_CONFIGURADO) {
      const { error } = await supabase
        .from('agendamentos').update({ status: 'cancelado' }).eq('id', id);
      if (error) throw new Error(error.message);
      return;
    }
    const lista = ler(CHAVE_AGENDAMENTOS) || [];
    const a = lista.find(x => x.id === id);
    if (a) a.status = 'cancelado';
    gravar(CHAVE_AGENDAMENTOS, lista);
  };

  /* ================= NOTIFICAÇÕES =================
     Central de avisos: atendimento iniciado, chamada, resultado,
     lembrete de consulta. */
  DB.registrarNotificacao = function ({ cpf, tipo, titulo, texto, link }) {
    if (SUPABASE_CONFIGURADO) return; // em produção: via push/banco
    const lista = ler(CHAVE_NOTIFICACOES) || [];
    lista.unshift({
      id: 'n' + Date.now() + Math.random().toString(36).slice(2, 6),
      cpf, tipo: tipo || 'aviso', titulo, texto, link: link || '',
      lida: false, criado_em: new Date().toISOString()
    });
    gravar(CHAVE_NOTIFICACOES, lista.slice(0, 60));
  };

  DB.getNotificacoes = async function (cpf) {
    if (SUPABASE_CONFIGURADO) {
      const { data, error } = await supabase
        .from('notificacoes').select('*').eq('cpf', cpf).order('criado_em', { ascending: false });
      if (error) throw new Error(error.message);
      return data;
    }
    return (ler(CHAVE_NOTIFICACOES) || [])
      .filter(n => n.cpf === cpf)
      .sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));
  };

  DB.naoLidas = async function (cpf) {
    const lista = await DB.getNotificacoes(cpf);
    return lista.filter(n => !n.lida).length;
  };

  DB.marcarLidas = async function (cpf) {
    if (SUPABASE_CONFIGURADO) {
      await supabase.from('notificacoes').update({ lida: true }).eq('cpf', cpf);
      return;
    }
    const lista = ler(CHAVE_NOTIFICACOES) || [];
    lista.forEach(n => { if (n.cpf === cpf) n.lida = true; });
    gravar(CHAVE_NOTIFICACOES, lista);
  };

  /* ================= SIMULAÇÕES PARA A BANCA =================
     Reproduzem exatamente o que o SISTEMA MÉDICO faria:
     recepção → triagem → telão → consulta finalizada. */

  /* 1. RECEPÇÃO inicia o atendimento (gera senha e entra na fila) */
  DB.iniciarAtendimentoDemo = async function (cpf) {
    const p = await DB.getPaciente(cpf);
    if (!p) throw new Error('Paciente não encontrado');
    const consulta = {
      id: 'c' + Date.now(),
      cpf,
      unidade: APP_CONFIG.UNIDADES[0],
      senha: gerarSenha(),
      status: 'em_fila',
      criado_em: new Date().toISOString(),
      recepcao: { criado_por: 'Recepcionista — Ana Recepção', observacoes: '' }
    };
    if (SUPABASE_CONFIGURADO) {
      const { data, error } = await supabase.from('consultas').insert([consulta]).select().single();
      if (error) throw new Error(error.message);
      return data;
    }
    const lista = ler(CHAVE_CONSULTAS) || [];
    lista.unshift(consulta);
    gravar(CHAVE_CONSULTAS, lista);
    DB.registrarNotificacao({
      cpf, tipo: 'atendimento_iniciado',
      titulo: '🩺 Atendimento iniciado',
      texto: `Sua senha é ${consulta.senha} na ${consulta.unidade}. Acompanhe sua posição na fila pelo app.`,
      link: 'fila.html'
    });
    return consulta;
  };

  /* 2. ENFERMEIRA preenche a triagem (queixa + sinais vitais) */
  DB.simularTriagem = async function (cpf) {
    const { ativa } = await DB.getMinhaFila(cpf);
    if (!ativa) throw new Error('Sem atendimento ativo');
    ativa.triagem = {
      queixa_principal: 'Dor de garganta forte e febre há 2 dias',
      sintomas: ['Dor de garganta', 'Febre', 'Cansaço'],
      tempo_sintomas: '2 dias',
      intensidade_dor: 6,
      pressao: '120/80',
      temperatura: 37.8,
      pulso: 88,
      saturacao: 97,
      peso: 62.5,
      altura: 165,
      glicemia: 95,
      classificacao_risco: 'verde',
      observacoes: 'Paciente relata início do quadro após contato com pessoa gripada.',
      enfermeiro: 'Bruno Enfermeiro — COREN 123456'
    };
    if (SUPABASE_CONFIGURADO) {
      await supabase.from('consultas').update({ triagem: ativa.triagem }).eq('id', ativa.id);
      return ativa;
    }
    const lista = ler(CHAVE_CONSULTAS) || [];
    const x = lista.find(i => i.id === ativa.id);
    if (x) x.triagem = ativa.triagem;
    gravar(CHAVE_CONSULTAS, lista);
    DB.registrarNotificacao({
      cpf, tipo: 'triagem',
      titulo: '🌡️ Triagem realizada',
      texto: 'A enfermeira registrou seus sinais vitais e sua queixa. Aguarde a chamada para a consulta.',
      link: 'fila.html'
    });
    return ativa;
  };

  /* 3. TELÃO chama o paciente (o app dispara a notificação) */
  DB.simularChamada = async function (cpf) {
    const { ativa } = await DB.getMinhaFila(cpf);
    if (!ativa) throw new Error('Sem atendimento ativo');
    ativa.status = 'chamado';
    ativa.chamado_em = new Date().toISOString();
    ativa.guiche = '3';
    if (SUPABASE_CONFIGURADO) {
      await supabase.from('consultas')
        .update({ status: 'chamado', chamado_em: ativa.chamado_em, guiche: ativa.guiche }).eq('id', ativa.id);
      return ativa;
    }
    const lista = ler(CHAVE_CONSULTAS) || [];
    const x = lista.find(i => i.id === ativa.id);
    if (x) { x.status = 'chamado'; x.chamado_em = ativa.chamado_em; x.guiche = ativa.guiche; }
    gravar(CHAVE_CONSULTAS, lista);
    return ativa;
  };

  /* 4. MÉDICO finaliza: relatório + medicamentos + exames */
  DB.simularFinalizar = async function (cpf) {
    const { ativa } = await DB.getMinhaFila(cpf);
    if (!ativa) throw new Error('Sem atendimento ativo');
    ativa.status = 'finalizado';
    ativa.finalizado_em = new Date().toISOString();
    ativa.relatorio = {
      diagnostico: 'Faringite aguda (J02.9)',
      cid10: 'J02.9',
      conduta: 'Medicação sintomática, repouso e hidratação.',
      orientacoes: 'Tomar a medicação conforme a receita. Retornar se não melhorar em 3 dias.',
      medicamentos: [
        { nome: 'Paracetamol 750mg', dosagem: '1 comprimido', frequencia: '6/6h', duracao: '5 dias', obs: 'Após as refeições' },
        { nome: 'Ibuprofeno 400mg', dosagem: '1 comprimido', frequencia: '8/8h', duracao: '3 dias', obs: 'Se dor persistir' }
      ],
      exames: [
        { nome: 'Hemograma completo', status: 'solicitado', orientacao: 'Jejum de 8h' },
        { nome: 'Teste rápido para COVID-19', status: 'resultado_disponivel', resultado: 'Negativo', orientacao: '' }
      ],
      medico: 'Dr. Carlos Pereira — CRM 12345',
      unidade: ativa.unidade,
      finalizado_em: ativa.finalizado_em
    };
    if (SUPABASE_CONFIGURADO) {
      await supabase.from('consultas')
        .update({ status: 'finalizado', finalizado_em: ativa.finalizado_em, relatorio: ativa.relatorio }).eq('id', ativa.id);
      return ativa;
    }
    const lista = ler(CHAVE_CONSULTAS) || [];
    const x = lista.find(i => i.id === ativa.id);
    if (x) { x.status = 'finalizado'; x.finalizado_em = ativa.finalizado_em; x.relatorio = ativa.relatorio; }
    gravar(CHAVE_CONSULTAS, lista);
    DB.registrarNotificacao({
      cpf, tipo: 'resultado',
      titulo: '📋 Consulta finalizada',
      texto: 'Seu relatório, medicamentos e exames estão disponíveis no app.',
      link: 'consulta.html?id=' + ativa.id
    });
    return ativa;
  };

  /* 5. AGENDAR consulta (demo) — gera lembrete */
  DB.agendarDemo = async function (cpf) {
    const datas = [7, 14].map(dias => {
      const d = new Date();
      d.setDate(d.getDate() + dias);
      d.setHours(9, 30, 0, 0);
      return d.toISOString();
    });
    const agendamentos = [
      { id: 'a' + Date.now() + 'a', cpf, unidade: 'Hospital Vida+', especialidade: 'Clínico Geral', data_hora: datas[0], status: 'confirmado', criado_em: new Date().toISOString() },
      { id: 'a' + Date.now() + 'b', cpf, unidade: 'Hospital Vida+ Norte', especialidade: 'Dermatologia', data_hora: datas[1], status: 'agendado', criado_em: new Date().toISOString() }
    ];
    if (SUPABASE_CONFIGURADO) {
      const { data, error } = await supabase.from('agendamentos').insert(agendamentos.map(a => ({ ...a, paciente_cpf: cpf }))).select();
      if (error) throw new Error(error.message);
      return data;
    }
    const lista = ler(CHAVE_AGENDAMENTOS) || [];
    agendamentos.forEach(a => lista.push(a));
    gravar(CHAVE_AGENDAMENTOS, lista);
    DB.registrarNotificacao({
      cpf, tipo: 'lembrete',
      titulo: '🗓️ Lembrete de consulta',
      texto: 'Você tem consulta com Clínico Geral no Hospital Vida+ em ' + UI.fmtData(datas[0]) + ' às 09:30.',
      link: 'agendamentos.html'
    });
    return agendamentos;
  };

  /* ================= SEED DEMO ================= */
  DB.seedDemo = function () {
    // paciente cadastrado pela RECEPÇÃO
    const p = {
      cpf: '12345678909',
      nome: 'Maria Oliveira Santos',
      nascimento: '1995-04-12',
      sexo: 'F',
      telefone: '(41) 99999-1234',
      email: 'maria.demo@email.com',
      endereco: 'Rua das Flores, 120 — Araucária/PR',
      tipo_sanguineo: 'O+',
      alergias: ['Dipirona', 'Poeira'],
      doencas_cronicas: ['Asma leve'],
      medicamentos_uso: 'Salbutamol (inalador)',
      deficiencia: '', gestante: false, tabagista: false,
      responsavel_nome: 'João Oliveira',
      responsavel_telefone: '(41) 98888-1111',
      criado_em: new Date().toISOString()
    };
    gravar(CHAVE_PACIENTE, p);

    // histórico: 2 consultas finalizadas (com medicamentos + exames)
    const consultas = [
      {
        id: 'c-hist-1', cpf: p.cpf, unidade: 'Hospital Vida+', senha: 'B305',
        status: 'finalizado', criado_em: new Date(Date.now() - 86400000 * 30).toISOString(),
        recepcao: { criado_por: 'Recepção' },
        triagem: { queixa_principal: 'Dor de cabeça forte e febre', sintomas: ['Febre', 'Dor de cabeça', 'Cansaço'], tempo_sintomas: '2 dias', intensidade_dor: 7, pressao: '130/85', temperatura: 38.2, pulso: 95, saturacao: 96, classificacao_risco: 'amarelo' },
        relatorio: {
          diagnostico: 'Gripe (J11.1)',
          cid10: 'J11.1',
          conduta: 'Repouso, hidratação e medicação sintomática.',
          orientacoes: 'Retornar se febre persistir por mais de 72h.',
          medicamentos: [
            { nome: 'Paracetamol 750mg', dosagem: '1 comprimido', frequencia: '6/6h', duracao: '5 dias', obs: 'Após as refeições' },
            { nome: 'Dipirona gotas', dosagem: '20 gotas', frequencia: '8/8h', duracao: '3 dias', obs: 'Se dor ou febre' }
          ],
          exames: [
            { nome: 'Hemograma completo', status: 'resultado_disponivel', resultado: 'Leucocitose leve', orientacao: '' }
          ],
          medico: 'Dr. Carlos Pereira — CRM 12345',
          unidade: 'Hospital Vida+',
          finalizado_em: new Date(Date.now() - 86400000 * 29).toISOString()
        },
        finalizado_em: new Date(Date.now() - 86400000 * 29).toISOString()
      },
      {
        id: 'c-hist-2', cpf: p.cpf, unidade: 'Hospital Vida+ Norte', senha: 'C112',
        status: 'finalizado', criado_em: new Date(Date.now() - 86400000 * 7).toISOString(),
        recepcao: { criado_por: 'Recepção' },
        triagem: { queixa_principal: 'Tosse seca e falta de ar', sintomas: ['Tosse', 'Falta de ar'], tempo_sintomas: '4 dias', intensidade_dor: 3, pressao: '115/75', temperatura: 36.9, pulso: 80, saturacao: 94, classificacao_risco: 'verde' },
        relatorio: {
          diagnostico: 'Crise de asma leve (J45.9)',
          cid10: 'J45.9',
          conduta: 'Uso de inalador com broncodilatador.',
          orientacoes: 'Evitar poeira e manter inalador por perto.',
          medicamentos: [
            { nome: 'Salbutamol spray', dosagem: '2 jatos', frequencia: 'se necessário', duracao: 'uso contínuo', obs: 'Em caso de crise' }
          ],
          exames: [
            { nome: 'Teste rápido COVID-19', status: 'resultado_disponivel', resultado: 'Negativo', orientacao: '' }
          ],
          medico: 'Dra. Fernanda Lima — CRM 98765',
          unidade: 'Hospital Vida+ Norte',
          finalizado_em: new Date(Date.now() - 86400000 * 6).toISOString()
        },
        finalizado_em: new Date(Date.now() - 86400000 * 6).toISOString()
      }
    ];
    gravar(CHAVE_CONSULTAS, consultas);

    // agendamentos futuros
    const aData = new Date(); aData.setDate(aData.getDate() + 5); aData.setHours(14, 0, 0, 0);
    const agendamentos = [
      { id: 'a-seed-1', cpf: p.cpf, unidade: 'Hospital Vida+', especialidade: 'Clínico Geral', data_hora: aData.toISOString(), status: 'confirmado', criado_em: new Date().toISOString() }
    ];
    gravar(CHAVE_AGENDAMENTOS, agendamentos);

    // notificações iniciais
    const notificacoes = [
      { id: 'n-seed-1', cpf: p.cpf, tipo: 'lembrete', titulo: '🗓️ Lembrete de consulta', texto: 'Você tem consulta com Clínico Geral no Hospital Vida+ em ' + UI.fmtData(aData.toISOString()) + ' às 14:00.', link: 'agendamentos.html', lida: false, criado_em: new Date(Date.now() - 3600000).toISOString() },
      { id: 'n-seed-2', cpf: p.cpf, tipo: 'resultado', titulo: '📋 Resultado disponível', texto: 'O resultado do Teste rápido COVID-19 está disponível.', link: 'exames.html', lida: false, criado_em: new Date(Date.now() - 86400000).toISOString() }
    ];
    gravar(CHAVE_NOTIFICACOES, notificacoes);

    return p;
  };

  DB.limparDemo = function () {
    localStorage.removeItem(CHAVE_PACIENTE);
    localStorage.removeItem(CHAVE_CONSULTAS);
    localStorage.removeItem(CHAVE_AGENDAMENTOS);
    localStorage.removeItem(CHAVE_NOTIFICACOES);
  };

  /* ================= EVENTOS DO TELÃO ================= */
  DB.registrarCallbackChamada = function (callback) { DB._callbackChamada = callback; };
  DB.notificarChamada = function (chamada) {
    if (DB._callbackChamada) DB._callbackChamada(chamada);
  };

  window.DB = DB;
})();
