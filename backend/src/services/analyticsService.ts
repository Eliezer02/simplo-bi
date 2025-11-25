import { supabase } from '../lib/supabaseClient';

const fetchAllData = async (userId: string) => {
  let allRows: any[] = [];
  let from = 0;
  const step = 1000; 
  let more = true;

  while (more) {
    const { data, error } = await supabase
      .from('oportunidades')
      .select('*')
      .eq('user_id', userId)
      .range(from, from + step - 1);

    if (error) throw error;

    if (data && data.length > 0) {
      allRows = [...allRows, ...data];
      from += step;
 
      if (data.length < step) more = false;
    } else {
      more = false;
    }
  }
  return allRows;
};

// ---  FUNÇÃO PRINCIPAL DE GERAÇÃO DE PERFIL ---
export const generateAnalyticalProfile = async (userId: string) => {
 
  const rows = await fetchAllData(userId);

  if (!rows || rows.length === 0) return null;


  let totalValor = 0;
  let qtdGanhas = 0;
  let qtdPerdidas = 0;
  let qtdAberto = 0;


  const porVendedor: Record<string, any> = {};
  const porOrigem: Record<string, any> = {};
  const porFunil: Record<string, any> = {}; 
  const porMes: Record<string, any> = {};
  const porEstado: Record<string, any> = {};
  const porCidade: Record<string, any> = {};
  const porProduto: Record<string, any> = {};

  // ---  LOOP DE PROCESSAMENTO (LINHA A LINHA) ---
  rows.forEach((row) => {
  
    const valor = Number(row.valor) || 0;
    let status = (row.status || '').toLowerCase();
    const vendedor = row.responsavel || 'N/A';
    const origem = row.origem_lead || 'N/A';
    const funil = row.funil || 'Geral'; // <--- NOVO: Captura o Funil
    const estado = (row.estado || 'NA').toString().substring(0, 2).toUpperCase();
    const cidade = row.cidade || 'N/A';
    const produto = row.produto || 'Geral';
    
   
    const dataCriacao = new Date(row.data_criacao);
    const mesCriacao = `${(dataCriacao.getMonth() + 1).toString().padStart(2, '0')}/${dataCriacao.getFullYear()}`;


    const dataConclusao = row.data_conclusao ? new Date(row.data_conclusao) : dataCriacao;
    const mesConclusao = `${(dataConclusao.getMonth() + 1).toString().padStart(2, '0')}/${dataConclusao.getFullYear()}`;

 
    let tipo = 'aberto';
    if (status.includes('ganha') || status.includes('conquistado') || status.includes('fechado')) tipo = 'ganha';
    else if (status.includes('perdida') || status.includes('perdido') || status.includes('lost')) tipo = 'perdida';
    else qtdAberto++;

  
    if (!porVendedor[vendedor]) porVendedor[vendedor] = { ganhas: 0, perdidas: 0, valor: 0, total: 0 };
    if (!porOrigem[origem]) porOrigem[origem] = { ganhas: 0, valor: 0, total: 0 };
    if (!porFunil[funil]) porFunil[funil] = { ganhas: 0, valor: 0, total: 0, perdidas: 0 };
    if (!porEstado[estado]) porEstado[estado] = { ganhas: 0, valor: 0, total: 0 };
    if (!porCidade[cidade]) porCidade[cidade] = { ganhas: 0, valor: 0, total: 0 };
    if (!porProduto[produto]) porProduto[produto] = { ganhas: 0, valor: 0, total: 0 };
    
  
    if (!porMes[mesCriacao]) porMes[mesCriacao] = { criadas: 0, ganhas: 0, valor: 0 };

 
    porVendedor[vendedor].total++;
    porOrigem[origem].total++;
    porFunil[funil].total++;
    porMes[mesCriacao].criadas++;
    porEstado[estado].total++;
    porCidade[cidade].total++;
    porProduto[produto].total++;

 
    if (tipo === 'ganha') {
      qtdGanhas++;
      totalValor += valor;
      

      porVendedor[vendedor].ganhas++;
      porVendedor[vendedor].valor += valor;
      
      porOrigem[origem].ganhas++;
      porOrigem[origem].valor += valor;

      porFunil[funil].ganhas++;
      porFunil[funil].valor += valor;
      porEstado[estado].ganhas++;
      porEstado[estado].valor += valor;
      porCidade[cidade].ganhas++;
      porCidade[cidade].valor += valor;
      porProduto[produto].ganhas++;
      porProduto[produto].valor += valor;


      if (!porMes[mesConclusao]) porMes[mesConclusao] = { criadas: 0, ganhas: 0, valor: 0 };
      porMes[mesConclusao].ganhas++;
      porMes[mesConclusao].valor += valor;

    } else if (tipo === 'perdida') {
      qtdPerdidas++;
      porVendedor[vendedor].perdidas++;
      porFunil[funil].perdidas++;
    }
  });



 
  const topVendedores = Object.entries(porVendedor)
    .map(([nome, d]) => ({
      nome,
      vendas: d.ganhas,
      valor_total: d.valor.toFixed(2),
      conversao: d.total > 0 ? ((d.ganhas / d.total) * 100).toFixed(1) + '%' : '0%'
    }))
    .sort((a, b) => parseFloat(b.valor_total) - parseFloat(a.valor_total));


  const topOrigens = Object.entries(porOrigem)
    .map(([nome, d]) => ({
      nome,
      vendas: d.ganhas,
      valor_total: d.valor.toFixed(2),
      conversao: d.total > 0 ? ((d.ganhas / d.total) * 100).toFixed(1) + '%' : '0%'
    }))
    .sort((a, b) => parseFloat(b.valor_total) - parseFloat(a.valor_total));

  const listaFunis = Object.entries(porFunil)
    .map(([nome, d]) => ({
      nome,
      oportunidades: d.total,
      vendas: d.ganhas,
      receita: d.valor.toFixed(2),
      conversao: d.total > 0 ? ((d.ganhas / d.total) * 100).toFixed(1) + '%' : '0%'
    }))
    .sort((a, b) => parseFloat(b.receita) - parseFloat(a.receita));


  const timeline = Object.entries(porMes)
    .map(([mes, d]) => ({ 
        mes, 
        oportunidades_criadas: d.criadas, 
        vendas_realizadas: d.ganhas, 
        receita: d.valor.toFixed(2) 
    }))
    .sort((a, b) => {
        const [m1, y1] = a.mes.split('/');
        const [m2, y2] = b.mes.split('/');
        return new Date(Number(y1), Number(m1) - 1).getTime() - new Date(Number(y2), Number(m2) - 1).getTime();
    });

  const rankingEstados = Object.entries(porEstado)
    .map(([uf, d]) => ({
      uf,
      vendas: d.ganhas,
      conversao: d.total > 0 ? Math.round((d.ganhas / d.total) * 100) + '%' : '0%',
      receita: d.valor.toFixed(2),
    }))
    .sort((a, b) => parseFloat(b.receita) - parseFloat(a.receita));

  const geoCidades = Object.entries(porCidade)
    .map(([nome, d]) => ({
      nome,
      oportunidades: d.total,
      vendas: d.ganhas,
      receita: d.valor.toFixed(2),
      conversao: d.total > 0 ? ((d.ganhas / d.total) * 100).toFixed(1) + '%' : '0%'
    }))
    .sort((a, b) => parseFloat(b.receita) - parseFloat(a.receita));

  const listaProdutos = Object.entries(porProduto)
    .map(([nome, d]) => ({
      nome,
      oportunidades: d.total,
      vendas: d.ganhas,
      receita: d.valor.toFixed(2),
      conversao: d.total > 0 ? ((d.ganhas / d.total) * 100).toFixed(1) + '%' : '0%'
    }))
    .sort((a, b) => parseFloat(b.receita) - parseFloat(a.receita));


  return {
    resumo: {
      total_analisado: rows.length,
      ganhas: qtdGanhas,
      perdidas: qtdPerdidas,
      em_aberto: qtdAberto,
      receita_total: totalValor.toFixed(2),
      ticket_medio: qtdGanhas > 0 ? (totalValor / qtdGanhas).toFixed(2) : '0'
    },
    funis: listaFunis, 
    vendedores: topVendedores,
    origens: topOrigens,
    timeline: timeline,
    geografia: {
      estados: rankingEstados.slice(0, 5),
      cidades: geoCidades.slice(0, 5),
    },
    produtos: listaProdutos
  };
};