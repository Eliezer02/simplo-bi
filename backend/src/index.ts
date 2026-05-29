import express from 'express';
import cors from 'cors';
import multer from 'multer';
import Papa from 'papaparse';
import OpenAI from 'openai';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import 'dotenv/config';

// --- CONFIGURAÇÃO INICIAL ---
const app = express();
const PORT = process.env.PORT || 3001;

// Configuração do Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
if (!supabaseUrl || !supabaseKey) throw new Error("Supabase URL/Key não encontrados.");
const supabase = createClient(supabaseUrl, supabaseKey);

// Configuração de IA
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

app.use(cors({ origin: process.env.FRONTEND_URL || '*', methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] }));
app.use(express.json({ limit: '50mb' })); // Aumentado limite para JSON grandes

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- MIDDLEWARES E HELPERS ---

const getUser = async (req: express.Request) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) throw new Error('Acesso negado: Token não fornecido.');
  const token = authHeader.split(' ')[1];
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) throw new Error('Sessão inválida ou expirada.');
  return user;
};

// --- SERVIÇOS DE IA ---

const generateText = async (provider: 'openai' | 'gemini', prompt: string) => {
  try {
    if (provider === 'openai') {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
      });
      return completion.choices[0].message.content || "Sem resposta.";
    } else if (provider === 'gemini') {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
      const result = await model.generateContent(prompt);
      return result.response.text();
    }
    throw new Error("Provedor inválido.");
  } catch (error: any) {
    console.error(`Erro IA (${provider}):`, error);
    throw new Error("Falha ao gerar resposta da IA.");
  }
};

// --- FUNÇÃO DE BUSCA CORRIGIDA (LIMIT 1000) ---

const fetchAllUserOpportunities = async (userId: string) => {
  let allRows: any[] = [];
  let from = 0;
  const step = 1000; // CORREÇÃO IMPORTANTE: Limite exato do Supabase
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
      // Se vier menos que o passo, acabaram os registros
      if (data.length < step) more = false;
    } else {
      more = false;
    }
  }
  return allRows;
};

// --- ANÁLISE DE DADOS (Cálculos) ---

const generateAnalyticalProfile = async (userId: string) => {
  const rows = await fetchAllUserOpportunities(userId);
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
  const porCliente: Record<string, any> = {};
  const ciclosDeVenda: number[] = []; // Para calcular média global

  rows.forEach((row) => {
    const valor = Number(row.valor) || 0;
    let status = (row.status || '').toLowerCase();
    const vendedor = row.responsavel || 'N/A';
    const origem = row.origem_lead || 'N/A';
    const funil = row.funil || 'Geral';
    const estado = (row.estado || 'NA').toString().substring(0, 2).toUpperCase();
    const cidade = row.cidade || 'N/A';
    const produto = row.produto || 'Geral';
    const cliente = row.nome_cliente || 'Anônimo';

    // Tratamento de datas
    const dataCriacao = new Date(row.data_criacao);
    const mesCriacao = `${(dataCriacao.getMonth() + 1).toString().padStart(2, '0')}/${dataCriacao.getFullYear()}`;
    const dataConclusao = row.data_conclusao ? new Date(row.data_conclusao) : dataCriacao;
    const mesConclusao = `${(dataConclusao.getMonth() + 1).toString().padStart(2, '0')}/${dataConclusao.getFullYear()}`;

    let tipo = 'aberto';
    if (status.includes('ganha') || status.includes('conquistado') || status.includes('fechado')) tipo = 'ganha';
    else if (status.includes('perdida') || status.includes('perdido') || status.includes('lost')) tipo = 'perdida';
    else qtdAberto++;

    // Inicializadores
    if (!porVendedor[vendedor]) porVendedor[vendedor] = { ganhas: 0, perdidas: 0, valor: 0, total: 0 };
    if (!porOrigem[origem]) porOrigem[origem] = { ganhas: 0, valor: 0, total: 0 };
    if (!porFunil[funil]) porFunil[funil] = { ganhas: 0, valor: 0, total: 0, perdidas: 0 };
    if (!porEstado[estado]) porEstado[estado] = { ganhas: 0, valor: 0, total: 0 };
    if (!porCidade[cidade]) porCidade[cidade] = { ganhas: 0, valor: 0, total: 0 };
    if (!porProduto[produto]) porProduto[produto] = { ganhas: 0, valor: 0, total: 0 };
    if (!porCliente[cliente]) porCliente[cliente] = { ganhas: 0, perdidas: 0, valor: 0, total: 0 };
    if (!porMes[mesCriacao]) porMes[mesCriacao] = { criadas: 0, ganhas: 0, valor: 0 };

    // Incrementos Gerais
    porVendedor[vendedor].total++;
    porOrigem[origem].total++;
    porFunil[funil].total++;
    porMes[mesCriacao].criadas++;
    porEstado[estado].total++;
    porCidade[cidade].total++;
    porProduto[produto].total++;
    porCliente[cliente].total++;

    if (tipo === 'ganha') {
      qtdGanhas++;
      totalValor += valor;
      porVendedor[vendedor].ganhas++; porVendedor[vendedor].valor += valor;
      porOrigem[origem].ganhas++; porOrigem[origem].valor += valor;
      porFunil[funil].ganhas++; porFunil[funil].valor += valor;
      porEstado[estado].ganhas++; porEstado[estado].valor += valor;
      porCidade[cidade].ganhas++; porCidade[cidade].valor += valor;
      porProduto[produto].ganhas++; porProduto[produto].valor += valor;
      porCliente[cliente].ganhas++; porCliente[cliente].valor += valor;

      if (!porMes[mesConclusao]) porMes[mesConclusao] = { criadas: 0, ganhas: 0, valor: 0 };
      porMes[mesConclusao].ganhas++;
      porMes[mesConclusao].valor += valor;

      // Cálculo de ciclo de venda (dias)
      const diffTime = Math.abs(dataConclusao.getTime() - dataCriacao.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      ciclosDeVenda.push(diffDays);
    } else if (tipo === 'perdida') {
      qtdPerdidas++;
      porVendedor[vendedor].perdidas++;
      porFunil[funil].perdidas++;
      porCliente[cliente].perdidas++;
    }
  });

  // Helpers de formatação
  const calcConv = (g: number, t: number) => t > 0 ? ((g / t) * 100).toFixed(1) + '%' : '0%';
  const sortValor = (obj: any) => Object.entries(obj).map(([k, v]: any) => ({ nome: k, ...v, valor_total: v.valor.toFixed(2), conversao: calcConv(v.ganhas, v.total) })).sort((a: any, b: any) => parseFloat(b.valor_total) - parseFloat(a.valor_total));

  return {
    resumo: {
      total_analisado: rows.length,
      ganhas: qtdGanhas,
      perdidas: qtdPerdidas,
      em_aberto: qtdAberto,
      receita_total: totalValor.toFixed(2),
      ticket_medio: qtdGanhas > 0 ? (totalValor / qtdGanhas).toFixed(2) : '0',
      ciclo_medio: ciclosDeVenda.length > 0 ? (ciclosDeVenda.reduce((a, b) => a + b, 0) / ciclosDeVenda.length).toFixed(1) : '0'
    },
    funis: sortValor(porFunil),
    vendedores: sortValor(porVendedor),
    origens: sortValor(porOrigem),
    timeline: Object.entries(porMes).map(([m, d]: any) => ({ mes: m, oportunidades_criadas: d.criadas, vendas_realizadas: d.ganhas, receita: d.valor.toFixed(2) })).sort((a, b) => {
      const [m1, y1] = a.mes.split('/'); const [m2, y2] = b.mes.split('/');
      return new Date(Number(y1), Number(m1) - 1).getTime() - new Date(Number(y2), Number(m2) - 1).getTime();
    }),
    geografia: { estados: sortValor(porEstado).slice(0, 5), cidades: sortValor(porCidade).slice(0, 5) },
    produtos: sortValor(porProduto),
    clientes: sortValor(porCliente).slice(0, 15)
  };
};

// --- MAPEAMENTO CSV ---

// Adicione esta função auxiliar para converter dinheiro BR para Number
const parseBrazilianCurrency = (val: string | null | undefined): number => {
  if (!val) return 0;
  const cleanStr = val.toString().trim();
  if (cleanStr === '') return 0;

  // Remove R$, espaços e pontos de milhar. Troca vírgula decimal por ponto.
  // Ex: "R$ 1.250,50" -> "1250.50"
  const normalized = cleanStr
    .replace(/[R$\s]/g, '')   // Tira R$ e espaços
    .replace(/\./g, '')       // Tira pontos de milhar (1.000 vira 1000)
    .replace(',', '.');       // Troca vírgula por ponto (50,00 vira 50.00)

  const number = parseFloat(normalized);
  return isNaN(number) ? 0 : number;
};

// Adicione esta função para converter DD/MM/YYYY para Objeto Date seguro
const parseBrazilianDate = (dateStr: string | null | undefined): Date | null => {
  if (!dateStr || dateStr.trim() === '') return null;

  // Tenta formato ISO direto
  if (dateStr.includes('-')) {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
  }

  // Formato DD/MM/YYYY
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // Mês em JS começa em 0
    const year = parseInt(parts[2], 10);

    const d = new Date(year, month, day);
    return isNaN(d.getTime()) ? null : d;
  }

  return null;
};

const DEFAULT_MAPPING = {
  protocolo: ['Protocolo', 'ID', 'Código', 'Key'],
  responsavel: ['Responsável', 'Vendedor', 'Owner', 'Agente', 'Rep'],
  funil: ['Funil', 'Pipeline'],
  etapa: ['Etapa', 'Fase', 'Stage', 'Step'],
  status: ['Situação', 'Status', 'Estado', 'Situation'],
  valor: ['Valor', 'Vlr', 'Receita', 'Amount', 'Preço', 'Valor Total', 'Valor Unitário'],
  data_criacao: ['Dt.Cad', 'Data Criação', 'Created At', 'Data Entrada', 'Data de Cadastro'],
  data_conclusao: ['Dt.Conq./Perda', 'Data Fechamento', 'Closed At', 'Data Venda', 'Data Conclusão'],
  origem: ['Origem', 'Source', 'Canal', 'Origem do Lead', 'Fonte'],
  cliente: ['Cliente', 'Nome', 'Empresa', 'Lead', 'Nome do Cliente'],
  estado: ['Estado', 'UF', 'U.F.', 'State', 'Região'],
  cidade: ['Cidade', 'City', 'Municipio', 'Local'],
  produto: ['Produto', 'Produtos', 'Serviço', 'Item', 'Mercadoria', 'Product'],
  motivo: ['Motivo', 'Motivo da Perda', 'Reason', 'Observação', 'Obs', 'Detalhe Perda', 'Motivo.Perda']
};

interface Mapping {
  protocolo: string;
  responsavel: string;
  funil: string;
  etapa: string;
  status: string;
  valor: string;
  data_criacao: string;
  data_conclusao: string;
  origem: string;
  cliente: string;
  estado: string;
  cidade: string;
  produto: string;
  motivo: string;
}

// --- SUBSTITUA A SUA normalizeRow POR ESTA ---
const normalizeRow = (row: any, mapping: Mapping) => {
  // Função auxiliar de busca
  const getVal = (key: string) => {
    if (!key) return null;
    return row[key] ? row[key].toString().trim() : null;
  };

  const statusRaw = getVal(mapping.status);
  const valorRaw = getVal(mapping.valor);

  // Normalização de Datas
  const dataCriacaoRaw = getVal(mapping.data_criacao);
  const dataConclusaoRaw = getVal(mapping.data_conclusao);

  const dataCriacao = parseBrazilianDate(dataCriacaoRaw) || new Date();
  // Se não tiver data de conclusão, mas estiver ganha, assume data de criação como fallback
  let dataConclusao = parseBrazilianDate(dataConclusaoRaw);

  const normalizeStatus = (s: string | null) => {
    if (!s) return 'Em aberto';
    const lower = s.toLowerCase();
    if (lower.includes('ganha') || lower.includes('conquistado') || lower.includes('fechado') || lower.includes('vendido')) return 'Ganha';
    if (lower.includes('perdida') || lower.includes('perdido') || lower.includes('lost') || lower.includes('desqualificado')) return 'Perdida';
    return 'Em aberto';
  };

  const statusFinal = normalizeStatus(statusRaw);

  // Se ganhou e não tem data de conclusão, usa a de criação para não zerar relatórios
  if (statusFinal === 'Ganha' && !dataConclusao) {
    dataConclusao = dataCriacao;
  }

  return {
    protocolo: getVal(mapping.protocolo) || '',
    responsavel: getVal(mapping.responsavel) || 'N/A',
    funil: getVal(mapping.funil) || 'Geral',
    etapa: getVal(mapping.etapa) || 'Geral',
    status: statusFinal,
    valor: parseBrazilianCurrency(valorRaw),
    data_criacao: dataCriacao.toISOString(),
    data_conclusao: dataConclusao ? dataConclusao.toISOString() : null,
    origem_lead: getVal(mapping.origem) || 'N/A',
    nome_cliente: getVal(mapping.cliente) || 'Anônimo',
    estado: getVal(mapping.estado)?.substring(0, 2).toUpperCase() || 'NA',
    cidade: getVal(mapping.cidade) || 'N/A',
    produto: getVal(mapping.produto) || 'Geral',
    motivo_perda: getVal(mapping.motivo) || 'Não informado'
  };
};

// --- ROTAS DA API ---

// --- ROTA DE STATUS DE UPLOAD (VERIFICA SE HÁ DADOS) ---
app.get('/api/upload-status', async (req, res) => {
  try {
    const user = await getUser(req);
    const data = await fetchAllUserOpportunities(user.id);
    res.json({ data });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- ROTA DE DETECÇÃO DE COLUNAS ---
app.post('/api/detect-columns', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado.' });

  try {
    await getUser(req); // Apenas verifica se está logado
    const csvFileContent = req.file.buffer.toString('utf-8');

    const parsedResult = Papa.parse(csvFileContent, {
      header: true,
      skipEmptyLines: true,
      preview: 1, // Só precisamos dos headers (primeira linha)
      delimiter: "",
    });

    if (parsedResult.meta.fields) {
      res.json({ columns: parsedResult.meta.fields });
    } else {
      res.status(400).json({ error: "Não foi possível detectar colunas no arquivo." });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- ROTA DE UPLOAD BLINDADA ---
app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado.' });

  try {
    const user = await getUser(req);
    const userId = user.id;
    const { mapping, fileName } = req.body; // Mapeamento customizado enviado pelo front

    console.log(`[Upload] Iniciando processamento para user: ${userId}, Arquivo: ${fileName}`);

    // Se o front não mandou mapeamento, tenta usar o automático (fallback segurança)
    const activeMapping = mapping ? JSON.parse(mapping) : null;

    if (!activeMapping) {
      return res.status(400).json({ error: "Configuração de mapeamento não fornecida." });
    }

    const csvFileContent = req.file.buffer.toString('utf-8');
    const batchId = crypto.randomUUID();

    // Registrar o início do upload no histórico (opcional, faremos no final se der certo)

    const parsedResult = Papa.parse(csvFileContent, {
      header: true,
      skipEmptyLines: true,
      delimiter: "",
    });

    const parsedData = parsedResult.data;

    const rawRows = parsedData.map((rawRow: any) => {
      const cleanRow = normalizeRow(rawRow, activeMapping);

      // Hash DETERMINÍSTICO (sem index) para evitar duplicidade de CONTEÚDO
      const signature = `${userId}-${cleanRow.protocolo}-${cleanRow.nome_cliente}-${cleanRow.data_criacao}-${cleanRow.valor}`;
      const uniqueHash = crypto.createHash('md5').update(signature).digest('hex');

      return { user_id: userId, unique_hash: uniqueHash, batch_id: batchId, ...cleanRow };
    });

    // Filtra linhas que ficaram totalmente vazias ou inválidas
    const validRows = rawRows.filter((r: any) => r.valor >= 0 && r.data_criacao);

    console.log(`[Upload] Linhas processadas e válidas para envio: ${validRows.length}`);

    // Deduplicação de Hash (segurança extra)
    const uniqueRowsMap = new Map();
    validRows.forEach((row: any) => { uniqueRowsMap.set(row.unique_hash, row); });
    const rowsToUpsert = Array.from(uniqueRowsMap.values());

    // Envio em Lotes (Batch)
    const batchSize = 1000;
    for (let i = 0; i < rowsToUpsert.length; i += batchSize) {
      const batch = rowsToUpsert.slice(i, i + batchSize);

      const { error } = await supabase
        .from('oportunidades')
        .upsert(batch, { onConflict: 'unique_hash', ignoreDuplicates: false });

      if (error) {
        console.error('[Upload] Erro ao inserir no Supabase:', error);
        throw new Error(`Erro no Banco de Dados: ${error.message}`);
      }
    }

    // Salvar no histórico
    await supabase.from('import_history').insert({
      id: batchId,
      user_id: userId,
      file_name: fileName || 'Planilha Sem Nome',
      rows_count: rowsToUpsert.length,
      created_at: new Date().toISOString()
    });

    const finalData = await fetchAllUserOpportunities(userId);

    console.log(`[Upload] Sucesso. Total no banco agora: ${finalData.length}`);

    res.json({
      message: 'Processamento concluído',
      importedRows: rowsToUpsert.length,
      totalDb: finalData.length,
      importedData: finalData
    });

  } catch (error: any) {
    console.error('[Upload] Erro Crítico:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// ROTA 2: ANALYZE (ATUALIZADA COM PROMPT HEAD DE BI)
// ==========================================
app.post('/api/analyze', async (req, res) => {
  const { provider } = req.body;
  const selectedProvider = provider || 'openai';

  try {
    const user = await getUser(req);
    const profile: any = await generateAnalyticalProfile(user.id);

    if (!profile) return res.status(400).json({ error: 'Sem dados para analisar.' });

    // Preparação dos dados para o Prompt
    const funisStr = JSON.stringify(profile.funis, null, 2);
    const topVendedores = JSON.stringify(profile.vendedores.slice(0, 7), null, 2);
    const topOrigens = JSON.stringify(profile.origens.slice(0, 5), null, 2);
    const timelineStr = JSON.stringify(profile.timeline, null, 2); // Importante para sazonalidade
    const geoEstados = JSON.stringify(profile.geografia?.estados?.slice(0, 5) || [], null, 2);
    const geoCidades = JSON.stringify(profile.geografia?.cidades?.slice(0, 5) || [], null, 2);
    const topProdutos = JSON.stringify(profile.produtos?.slice(0, 5) || [], null, 2);

    // Prompt HEAD DE BI
    const prompt = `
    Você é um **Head de Business Intelligence (BI)** contratado para auditar a operação comercial e da empresa em geral. 

    Sua missão não é descrever números, mas sim **diagnosticar a saúde do negócio, entender o funcionamento, dar insights e dicas de como melhorar**. 

    

    --- DADOS AUDITADOS (FONTE REAL: SISTEMA) ---

    

    1. VOLUMETRIA E FINANCEIRO:

    - Total de Oportunidades: ${profile.resumo.total_analisado}

    - Receita Total Confirmada: R$ ${profile.resumo.receita_total}

    - Vendas Ganhas: ${profile.resumo.ganhas}

    - Perdas: ${profile.resumo.perdidas}

    - Ticket Médio Global: R$ ${profile.resumo.ticket_medio}

    

    2. ESTRUTURA DE FUNIS (Crucial: Diferencie Suporte de Vendas):

    ${funisStr}

    

    3. RANKING DE PERFORMANCE (Top Vendedores):

    ${topVendedores}

    

    4. CANAIS DE TRAÇÃO (Top Origens):

    ${topOrigens}

    

    5. LINHA DO TEMPO (Sazonalidade):

    ${timelineStr}

    

    6. DISTRIBUIÇÃO GEOGRÁFICA E PORTFÓLIO:

    - Estados Top: ${geoEstados}

    - Cidades Top: ${geoCidades}

    - Produtos Top: ${topProdutos}

    7. CARTEIRA DE CLIENTES (Top 15):
    ${JSON.stringify(profile.clientes?.slice(0, 15) || [], null, 2)}

    

    --- ESTRUTURA DO RELATÓRIO EXECUTIVO (MARKDOWN) ---

    

    **1. Diagnóstico Executivo**

    Dê um veredito curto e grosso sobre a saúde da operação. A conversão está saudável? Há dependência excessiva de um vendedor ou canal?

    

    **2. Análise de Eficiência do Time (Matriz Volume x Valor)**

    Não liste apenas quem vendeu. Analise:

    - Quem é o "Fazedor de Chuva" (Alto Volume / Alto Valor)?

    - Quem tem "Taxa de Conversão Alta" mas recebe poucos leads (Oportunidade de escala)?

    - Quem está "Queimando Leads" (Baixa conversão, alto volume)?

    - Considere se o problema é lead desqualificado ou performance do vendedor.

    

    **3. Inteligência de Canais e Funis**

    - Qual funil é puramente operacional e qual gera receita?

    - Qual origem traz ROI real (R$) vs apenas curiosos?

    

    **4. Raio-X Sazonal**

    Identifique o mês de ouro e o mês de crise com base na Timeline fornecida.

    

    **5. Análise de Carteira de Clientes**

    Identifique:
    - Quais são os 5 clientes mais valiosos (por receita) e qual o risco de concentração?
    - Há clientes recorrentes (múltiplas oportunidades) com boa conversão? São candidatos a upsell.
    - Clientes com muitas oportunidades perdidas representam custo oculto de prospecção?

    **6. Plano de Ação Estratégico (3 Pontos)**

    Dê 3 ordens práticas para o Diretor Comercial executar HOJE. Seja específico.

    

    Tom de voz: Profissional, analítico, direto. Use Markdown rico.

    `;

    const analysis = await generateText(selectedProvider, prompt);
    res.json({ analysis });

  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// --- ROTA DE HISTÓRICO (LISTAGEM) ---
app.get('/api/history', async (req, res) => {
  try {
    const user = await getUser(req);
    const { data, error } = await supabase
      .from('import_history')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- ROTA DE DELEÇÃO DE LOTE (REVERSÃO) ---
app.delete('/api/history/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const user = await getUser(req);

    // 1. Remove as oportunidades vinculadas a este lote
    const { error: oppsError } = await supabase
      .from('oportunidades')
      .delete()
      .eq('batch_id', id)
      .eq('user_id', user.id);

    if (oppsError) throw oppsError;

    // 2. Remove o registro do histórico
    const { error: historyError } = await supabase
      .from('import_history')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (historyError) throw historyError;

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});


// ==========================================
// CONFIGURAÇÃO DE TOOLS PARA O CHAT
// ==========================================
// Schema de filtros compartilhado pelas ferramentas
const FILTROS_SCHEMA = {
  type: "object",
  description: "Filtros opcionais aplicados antes de agregar",
  properties: {
    responsavel: { type: "string" },
    status: { type: "string", enum: ["Ganha", "Perdida", "Em aberto"] },
    origem: { type: "string" },
    cliente: { type: "string" },
    funil: { type: "string" },
    produto: { type: "string" },
    estado: { type: "string", description: "UF, ex: SP" },
    cidade: { type: "string" },
    motivo_perda: { type: "string" },
    ano: { type: "integer", description: "Ex: 2026" },
    mes: { type: "integer", description: "Mês de 1 a 12 (combine com 'ano')" },
    valor_min: { type: "number" },
    valor_max: { type: "number" }
  }
};

const tools = [
  {
    type: "function" as const,
    function: {
      name: "analisar_dados_complexos",
      description: "Agrupa e calcula métricas de vendas (receita, conversão, perdas) por uma ou mais dimensões. Use para rankings e matrizes: 'conversão por vendedor', 'receita por funil', 'perdas por motivo', 'mês x origem', etc.",
      parameters: {
        type: "object",
        properties: {
          filtros: FILTROS_SCHEMA,
          agrupar_por: {
            type: "array",
            description: "Dimensões para agrupar. Ex: ['mes','origem'] cria uma matriz mês x origem.",
            items: { type: "string", enum: ["mes", "ano", "responsavel", "funil", "etapa", "origem", "motivo_perda", "produto", "estado", "cidade", "cliente"] }
          }
        },
        required: ["agrupar_por"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "resumo_geral",
      description: "KPIs globais da operação: total de oportunidades, ganhas, perdidas, em aberto, receita total, ticket médio, ciclo médio (dias), taxa de conversão e qualidade de preenchimento (dados sombra). Use para perguntas gerais de saúde do negócio ou totais.",
      parameters: {
        type: "object",
        properties: { filtros: FILTROS_SCHEMA },
      },
    },
  },
];

// ==========================================
// MOTOR DE ANÁLISE (compartilhado pelas ferramentas)
// ==========================================
const incluiTexto = (valor: any, filtro: any) =>
  !filtro || String(valor ?? '').toLowerCase().includes(String(filtro).toLowerCase());

const normalizarLinhaAnalise = (row: any, statusFiltro?: string) => {
  const status = (row.status || '').toLowerCase();
  const isGanha = status.includes('ganha') || status.includes('fechado') || status.includes('conquistado') || status.includes('vendido');
  const isPerdida = status.includes('perdida') || status.includes('perdido') || status.includes('desqualificado');

  const dataCriacao = new Date(row.data_criacao);
  const dataConclusao = row.data_conclusao ? new Date(row.data_conclusao) : dataCriacao;
  const dataRef = (statusFiltro === 'Ganha' || isGanha) ? dataConclusao : dataCriacao;
  if (isNaN(dataRef.getTime())) return null;

  return {
    responsavel: (row.responsavel || 'N/A').toString().trim() || 'N/A',
    origem: (row.origem_lead || 'N/A').toString().trim() || 'N/A',
    funil: (row.funil || 'Geral').toString().trim() || 'Geral',
    etapa: (row.etapa || 'Geral').toString().trim() || 'Geral',
    motivo_perda: (row.motivo_perda || 'Não informado').toString().trim() || 'Não informado',
    produto: (row.produto || 'Geral').toString().trim() || 'Geral',
    estado: (row.estado || 'NA').toString().trim() || 'NA',
    cidade: (row.cidade || 'N/A').toString().trim() || 'N/A',
    cliente: (row.nome_cliente || 'Anônimo').toString().trim() || 'Anônimo',
    valor: Number(row.valor) || 0,
    isGanha, isPerdida,
    dataCriacao, dataConclusao,
    ano: dataRef.getFullYear(),
    mes: `${(dataRef.getMonth() + 1).toString().padStart(2, '0')}/${dataRef.getFullYear()}`
  };
};

const passaFiltros = (r: any, f: any = {}) => {
  if (f.ano && r.ano !== f.ano) return false;
  if (f.mes && parseInt(r.mes.split('/')[0], 10) !== f.mes) return false;
  if (!incluiTexto(r.responsavel, f.responsavel)) return false;
  if (!incluiTexto(r.origem, f.origem)) return false;
  if (!incluiTexto(r.cliente, f.cliente)) return false;
  if (!incluiTexto(r.funil, f.funil)) return false;
  if (!incluiTexto(r.produto, f.produto)) return false;
  if (!incluiTexto(r.estado, f.estado)) return false;
  if (!incluiTexto(r.cidade, f.cidade)) return false;
  if (!incluiTexto(r.motivo_perda, f.motivo_perda)) return false;
  if (f.status === 'Ganha' && !r.isGanha) return false;
  if (f.status === 'Perdida' && !r.isPerdida) return false;
  if (f.status === 'Em aberto' && (r.isGanha || r.isPerdida)) return false;
  if (f.valor_min != null && r.valor < f.valor_min) return false;
  if (f.valor_max != null && r.valor > f.valor_max) return false;
  return true;
};

const analisarDados = (rows: any[], args: any) => {
  const filtros = args.filtros || {};
  const agrupar_por: string[] = (args.agrupar_por && args.agrupar_por.length) ? args.agrupar_por : ['responsavel'];
  const grupos: Record<string, any> = {};
  let rowCount = 0;

  rows.forEach((row) => {
    const r = normalizarLinhaAnalise(row, filtros.status);
    if (!r || !passaFiltros(r, filtros)) return;
    rowCount++;
    const chave = agrupar_por.map((c) => (r as any)[c] ?? 'N/A').join(' | ');
    if (!grupos[chave]) grupos[chave] = { qtd: 0, ganhas: 0, perdidas: 0, valor_ganho: 0, valor_perdido: 0 };
    grupos[chave].qtd++;
    if (r.isGanha) { grupos[chave].ganhas++; grupos[chave].valor_ganho += r.valor; }
    else if (r.isPerdida) { grupos[chave].perdidas++; grupos[chave].valor_perdido += r.valor; }
  });

  const resultado = Object.entries(grupos)
    .map(([grupo, v]: any) => ({
      grupo,
      total_leads: v.qtd,
      vendas: v.ganhas,
      perdas: v.perdidas,
      receita: Number(v.valor_ganho.toFixed(2)),
      receita_perdida: Number(v.valor_perdido.toFixed(2)),
      conversao: v.qtd > 0 ? ((v.ganhas / v.qtd) * 100).toFixed(1) + '%' : '0%'
    }))
    .sort((a, b) => (b.receita - a.receita) || (b.receita_perdida - a.receita_perdida) || (b.total_leads - a.total_leads))
    .slice(0, 50);

  return { resultado, rowCount };
};

const resumoGeral = (rows: any[], args: any) => {
  const filtros = args.filtros || {};
  let total = 0, ganhas = 0, perdidas = 0, aberto = 0, receita = 0, semMotivo = 0, ganhasValorZero = 0;
  const ciclos: number[] = [];

  rows.forEach((row) => {
    const r = normalizarLinhaAnalise(row, filtros.status);
    if (!r || !passaFiltros(r, filtros)) return;
    total++;
    if (r.isGanha) {
      ganhas++; receita += r.valor;
      if (r.valor === 0) ganhasValorZero++;
      if (!isNaN(r.dataCriacao.getTime()) && !isNaN(r.dataConclusao.getTime())) {
        ciclos.push(Math.max(0, Math.ceil((r.dataConclusao.getTime() - r.dataCriacao.getTime()) / 86400000)));
      }
    } else if (r.isPerdida) {
      perdidas++;
      if (r.motivo_perda === 'Não informado') semMotivo++;
    } else {
      aberto++;
    }
  });

  const resultado = {
    total_oportunidades: total,
    ganhas, perdidas, em_aberto: aberto,
    receita_total: Number(receita.toFixed(2)),
    ticket_medio: ganhas > 0 ? Number((receita / ganhas).toFixed(2)) : 0,
    ciclo_medio_dias: ciclos.length ? Number((ciclos.reduce((a, b) => a + b, 0) / ciclos.length).toFixed(1)) : 0,
    taxa_conversao: total > 0 ? ((ganhas / total) * 100).toFixed(1) + '%' : '0%',
    qualidade_dados: {
      perdas_sem_motivo: perdidas > 0 ? ((semMotivo / perdidas) * 100).toFixed(1) + '%' : '0%',
      ganhas_com_valor_zero: ganhas > 0 ? ((ganhasValorZero / ganhas) * 100).toFixed(1) + '%' : '0%'
    }
  };
  return { resultado, rowCount: total };
};

const executarTool = (name: string, args: any, rows: any[]) => {
  if (name === 'analisar_dados_complexos') return analisarDados(rows, args);
  if (name === 'resumo_geral') return resumoGeral(rows, args);
  return { resultado: { erro: `Ferramenta desconhecida: ${name}` }, rowCount: 0 };
};

const buildChatSystemPrompt = () => {
  const dataAtualStr = new Date().toLocaleDateString('pt-BR');
  return `
    Você é o **Simplo BI (Head de Inteligência Comercial)**. Seu perfil é executivo, cirúrgico e baseia-se em dados comparativos. Você não "acha", você "prova". Sempre busque trazer respostas concisas e objetivas, dando sensação de conversa e não de relatório.
    HOJE É: ${dataAtualStr}.

    --- 🧠 PROTOCOLO DE INTELIGÊNCIA COMPARATIVA ---

    1. **REGRA DE OURO: DIAGNÓSTICO POR CONTRASTE (BENCHMARKING)**
       - **Nunca julgue um vendedor isoladamente.** Sempre compare com a MÉDIA DO TIME e com o tipo de LEAD.
       - Se Vendedor X converte 2% e o resto do time converte 15% nos mesmos canais -> **Problema de Performance do Vendedor.**
       - Se TODOS convertem 2% -> **Problema na Qualidade do Lead (Marketing) ou no Produto.** Não culpe o time.

    2. **DETECÇÃO DE "DADOS SOMBRA" & CULTURA DE CRM**
       - Use a ferramenta resumo_geral para ver a qualidade de preenchimento.
       - Alta % de perdas sem motivo ou ganhas com valor R$ 0,00 indica **Falha de Processo da Equipe**. Alerte o gestor explicitamente.

    3. **ESTRUTURA DE RESPOSTA EXECUTIVA (CONCISÃO)**
       - **Direto ao Ponto (B.L.U.F.):** Comece com a conclusão.
       - Use tópicos e **tabelas markdown** compactas quando comparar itens.
       - Formato: 1) Veredito, 2) Evidência (números comparativos), 3) Ação/Correção.

    4. **MULTIFATORIALIDADE**
       - Considere a tríade: Volume de Leads x Taxa de Conversão x Ticket Médio.

    --- FERRAMENTAS ---
    - Use **resumo_geral** para totais e saúde do negócio.
    - Use **analisar_dados_complexos** para rankings/matrizes por dimensão.
    - Você pode chamar ferramentas mais de uma vez para comparar recortes antes de concluir.
    - Baseie-se SOMENTE nos números retornados pelas ferramentas. Nunca invente valores.
  `;
};

// ==========================================
// EXECUÇÃO POR PROVEDOR (com streaming)
// ==========================================
const runOpenAiChat = async (opts: {
  systemPrompt: string; history: any[]; message: string; rows: any[];
  send: (o: any) => void; debugLogs: any[];
}) => {
  const { systemPrompt, history, message, rows, send, debugLogs } = opts;
  const messages: any[] = [
    { role: 'system', content: systemPrompt },
    ...history.map((h: any) => ({ role: h.role === 'model' ? 'assistant' : 'user', content: h.content })),
    { role: 'user', content: message }
  ];

  for (let round = 0; round < 4; round++) {
    const stream = await openai.chat.completions.create({
      model: 'gpt-4o', messages, tools, tool_choice: 'auto', stream: true
    });

    let content = '';
    const toolCalls: any[] = [];

    for await (const chunk of stream) {
      const delta: any = chunk.choices[0]?.delta;
      if (!delta) continue;
      if (delta.content) { content += delta.content; send({ type: 'delta', text: delta.content }); }
      if (delta.tool_calls) {
        for (const tcd of delta.tool_calls) {
          const i = tcd.index;
          if (!toolCalls[i]) toolCalls[i] = { id: '', type: 'function', function: { name: '', arguments: '' } };
          if (tcd.id) toolCalls[i].id = tcd.id;
          if (tcd.function?.name) toolCalls[i].function.name += tcd.function.name;
          if (tcd.function?.arguments) toolCalls[i].function.arguments += tcd.function.arguments;
        }
      }
    }

    const calls = toolCalls.filter(Boolean);
    if (calls.length === 0) return; // resposta final já transmitida via deltas

    messages.push({ role: 'assistant', content: content || null, tool_calls: calls });
    for (const tc of calls) {
      let args: any = {};
      try { args = JSON.parse(tc.function.arguments || '{}'); } catch { /* args inválidos */ }
      send({ type: 'status', step: tc.function.name === 'resumo_geral' ? 'Calculando KPIs...' : 'Analisando dados...' });
      const out = executarTool(tc.function.name, args, rows);
      debugLogs.push({ step: 'Ferramenta executada', tool: tc.function.name, argumentos: args, linhas_consideradas: out.rowCount });
      messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(out.resultado) });
    }
  }

  // Excedeu o limite de rodadas: força uma resposta final (sem ferramentas), ainda em streaming
  const finalStream = await openai.chat.completions.create({ model: 'gpt-4o', messages, stream: true });
  for await (const chunk of finalStream) {
    const t = chunk.choices[0]?.delta?.content;
    if (t) send({ type: 'delta', text: t });
  }
};

const runGeminiChat = async (opts: {
  systemPrompt: string; history: any[]; message: string; rows: any[];
  send: (o: any) => void;
}) => {
  const { systemPrompt, history, message, rows, send } = opts;

  // Gemini não usa function calling aqui: injetamos o perfil analítico real no contexto.
  const contexto = {
    resumo: resumoGeral(rows, {}).resultado,
    por_vendedor: analisarDados(rows, { agrupar_por: ['responsavel'] }).resultado.slice(0, 15),
    por_funil: analisarDados(rows, { agrupar_por: ['funil'] }).resultado,
    por_origem: analisarDados(rows, { agrupar_por: ['origem'] }).resultado.slice(0, 10),
    por_motivo_perda: analisarDados(rows, { filtros: { status: 'Perdida' }, agrupar_por: ['motivo_perda'] }).resultado.slice(0, 10),
    timeline: analisarDados(rows, { agrupar_por: ['mes'] }).resultado,
    por_produto: analisarDados(rows, { agrupar_por: ['produto'] }).resultado.slice(0, 10),
    top_clientes: analisarDados(rows, { agrupar_por: ['cliente'] }).resultado.slice(0, 15)
  };

  const instrucao = `${systemPrompt}\n\n--- DADOS REAIS DA OPERAÇÃO (use estes números, não invente) ---\n${JSON.stringify(contexto)}`;
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro', systemInstruction: instrucao });

  // Gemini exige histórico alternando user/model e começando por user
  const sanitized: any[] = [];
  for (const h of history) {
    const role = h.role === 'model' ? 'model' : 'user';
    if (sanitized.length === 0 && role === 'model') continue;
    if (sanitized.length > 0 && sanitized[sanitized.length - 1].role === role) continue;
    sanitized.push({ role, parts: [{ text: h.content }] });
  }

  const chat = model.startChat({ history: sanitized });
  const result = await chat.sendMessageStream(message);
  for await (const chunk of result.stream) {
    const t = chunk.text();
    if (t) send({ type: 'delta', text: t });
  }
};

// ==========================================
// ROTA 3: CHAT (STREAMING SSE + FERRAMENTAS + PROVEDOR)
// ==========================================
app.post('/api/chat', async (req, res) => {
  const { message, history, provider } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Mensagem inválida ou não fornecida.' });
  }

  // Autentica ANTES de abrir o stream, para poder responder erro com status HTTP normal
  let user;
  try {
    user = await getUser(req);
  } catch (e: any) {
    return res.status(401).json({ error: e.message || 'Sessão inválida.' });
  }

  const safeHistory = Array.isArray(history) ? history.slice(-12) : [];
  const selectedProvider = provider === 'gemini' ? 'gemini' : 'openai';

  // Cabeçalhos SSE (resposta em streaming)
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if ((res as any).flushHeaders) (res as any).flushHeaders();
  const send = (obj: any) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  const debugLogs: any[] = [];

  try {
    const rows = await fetchAllUserOpportunities(user.id);

    if (!rows || rows.length === 0) {
      send({ type: 'delta', text: 'Ainda não há dados importados para analisar. Faça uma sincronização ou um upload primeiro.' });
      send({ type: 'done', debug: [] });
      return res.end();
    }

    const systemPrompt = buildChatSystemPrompt();

    if (selectedProvider === 'gemini') {
      await runGeminiChat({ systemPrompt, history: safeHistory, message, rows, send });
    } else {
      await runOpenAiChat({ systemPrompt, history: safeHistory, message, rows, send, debugLogs });
    }

    send({ type: 'done', debug: debugLogs });
    res.end();
  } catch (error: any) {
    console.error('Erro chat:', error);
    send({ type: 'error', message: error.message || 'Erro ao processar a solicitação.' });
    res.end();
  }
});

// ==========================================
// MÓDULO INTEGRADO: API SIMPLO CRM
// ==========================================

// Helper para mascarar o Token
const maskToken = (token: string) => {
  if (!token || token.length < 8) return '****';
  return `${token.substring(0, 4)}****${token.substring(token.length - 4)}`;
};

// Configuração fixa da integração com o Simplo CRM.
// A URL é sempre a mesma e os campos da API são fixos, então não há mapeamento manual.
const SIMPLO_BASE_URL = 'https://app.simplocrm.com.br';
const SIMPLO_CRM_MAPPING: Mapping = {
  protocolo: 'id_oportunidade',
  responsavel: 'responsavel',
  funil: 'funil',
  etapa: 'etapa',
  status: 'id_status',
  valor: 'valor',
  data_criacao: 'data_cadastro',
  data_conclusao: 'data_conquista_perda',
  origem: 'origem',
  cliente: 'cliente',
  estado: 'uf',
  cidade: 'cidade',
  produto: 'produtos_oportunidade',
  motivo: 'id_motivo_perda'
};

// A API do Simplo CRM lê os filtros pela QUERY STRING (GET), não pelo corpo (POST).
// O filtro de situação é o parâmetro `status`:
//   'A' = em aberto (usar tipo_data=data_cadastro)
//   'C' = conquistadas/ganhas e 'P' = perdidas (usar tipo_data=data_conquista_perda)
const buildCrmListUrl = (page: number, status: string, tipoData: string) => {
  const params = new URLSearchParams({
    pageAtual: String(page),
    order_column: 'tb_oportunidade.data_cadastro',
    order: 'DESC',
    tipo_data: tipoData,
    status,
    add_tag: '1'
  });
  return `${SIMPLO_BASE_URL}/oportunidade/listar?${params.toString()}`;
};

// Busca todas as páginas de um grupo de situação ('A' | 'C' | 'P').
const fetchCrmBucket = async (apiToken: string, status: string, tipoData: string) => {
  let all: any[] = [];
  let page = 1;
  let totalPages = 1;
  const maxPages = 2000; // Proteção contra loop infinito (API fixa ~20 registros/página).

  while (page <= totalPages && page <= maxPages) {
    const response = await fetch(buildCrmListUrl(page, status, tipoData), {
      method: 'GET',
      headers: { 'Authorization': apiToken, 'Accept': 'application/json' }
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[CRM] Falha (status=${status}, página ${page}): ${response.status}`, errText);
      throw new Error(`Falha na API do Simplo CRM (situação ${status}, página ${page}): Status ${response.status}`);
    }

    const data: any = await response.json();
    if (Array.isArray(data.dados)) all = all.concat(data.dados);
    if (data.qtdPage && !isNaN(Number(data.qtdPage))) totalPages = Number(data.qtdPage);
    page++;
  }

  return all;
};

// Busca os motivos de perda da conta e devolve um mapa id_motivo_perda -> descrição (nome).
// Endpoint usa HÍFEN: /motivo-perda/listar. A API não traz o nome do motivo na oportunidade.
const fetchMotivoPerdaMap = async (apiToken: string): Promise<Map<string, string>> => {
  const map = new Map<string, string>();
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages && page <= 50) {
    const url = `${SIMPLO_BASE_URL}/motivo-perda/listar?pageAtual=${page}&order_column=descricao&order=DESC`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Authorization': apiToken, 'Accept': 'application/json' }
    });

    if (!response.ok) break;

    const data: any = await response.json();
    if (Array.isArray(data.dados)) {
      for (const m of data.dados) {
        const id = String(m.id_motivo_perda ?? '').trim();
        const nome = String(m.descricao ?? '').trim();
        if (id && nome) map.set(id, nome);
      }
    }
    if (data.qtdPage && !isNaN(Number(data.qtdPage))) totalPages = Number(data.qtdPage);
    page++;
  }

  return map;
};

// 1. Rota de teste de conexão (valida apenas se o token é válido)
app.post('/api/crm/test-connect', async (req, res) => {
  try {
    await getUser(req);
    const { apiToken } = req.body;

    if (!apiToken) {
      return res.status(400).json({ error: 'Token de API é obrigatório.' });
    }

    console.log(`[CRM] Testando conexão com: ${SIMPLO_BASE_URL}`);

    // Chamada de teste para validar o token (lista a 1ª página de abertas)
    const response = await fetch(buildCrmListUrl(1, 'A', 'data_cadastro'), {
      method: 'GET',
      headers: { 'Authorization': apiToken, 'Accept': 'application/json' }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[CRM] Falha na API: Status ${response.status}`, errorText);
      return res.status(response.status).json({
        error: `Falha na conexão com o CRM (Status ${response.status}). Verifique se o token está correto.`
      });
    }

    res.json({ success: true, message: 'Conexão estabelecida com sucesso!' });

  } catch (error: any) {
    console.error('[CRM] Erro ao testar conexão:', error);
    res.status(500).json({ error: `Erro ao conectar com a API: ${error.message}` });
  }
});

// 2. Rota para obter as configurações salvas da API do usuário
app.get('/api/crm/config', async (req, res) => {
  try {
    const user = await getUser(req);
    
    const { data, error } = await supabase
      .from('crm_configs')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error || !data) {
      return res.json({ configured: false });
    }

    res.json({
      configured: true,
      baseUrl: data.base_url,
      apiToken: maskToken(data.api_token),
      mapping: data.mapping_profile,
      lastSync: data.last_sync,
      syncStatus: data.sync_status
    });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Rota para salvar as credenciais (URL e mapeamento são fixos)
app.post('/api/crm/config', async (req, res) => {
  try {
    const user = await getUser(req);
    const { apiToken } = req.body;

    if (!apiToken) {
      return res.status(400).json({ error: 'Token de API é obrigatório.' });
    }

    // Se o token for o mascarado enviado do frontend, busca o existente no DB para manter
    let finalToken = apiToken;
    if (apiToken.includes('****')) {
      const { data: existing } = await supabase
        .from('crm_configs')
        .select('api_token')
        .eq('user_id', user.id)
        .single();

      if (existing) {
        finalToken = existing.api_token;
      } else {
        return res.status(400).json({ error: 'Token inválido.' });
      }
    }

    const { error } = await supabase
      .from('crm_configs')
      .upsert({
        user_id: user.id,
        base_url: SIMPLO_BASE_URL,
        api_token: finalToken,
        mapping_profile: SIMPLO_CRM_MAPPING,
        updated_at: new Date().toISOString()
      });

    if (error) {
      console.error('[CRM] Erro ao salvar config no Supabase:', error);
      return res.status(500).json({ error: `Erro no banco de dados: ${error.message}` });
    }

    res.json({ success: true, message: 'Configuração de integração salva com sucesso!' });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Rota de sincronização manual sob demanda
app.post('/api/crm/sync', async (req, res) => {
  try {
    const user = await getUser(req);
    
    // Busca credenciais do DB
    const { data: config, error: configError } = await supabase
      .from('crm_configs')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (configError || !config) {
      return res.status(400).json({ error: 'Integração CRM não configurada. Configure a integração primeiro.' });
    }

    const { api_token } = config;
    const syncBatchId = crypto.randomUUID();
    const batchName = `Sincronização API: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

    console.log(`[CRM Sync] Iniciando importação manual para user: ${user.id}`);

    // A API segrega por situação via query string (status=A/C/P). Buscamos os 3 grupos
    // separadamente e marcamos a situação pelo grupo de origem (sinal confiável).
    const [abertas, ganhas, perdidas, motivoMap] = await Promise.all([
      fetchCrmBucket(api_token, 'A', 'data_cadastro'),
      fetchCrmBucket(api_token, 'C', 'data_conquista_perda'),
      fetchCrmBucket(api_token, 'P', 'data_conquista_perda'),
      fetchMotivoPerdaMap(api_token)
    ]);

    const grupos: { rows: any[]; status: string }[] = [
      { rows: abertas, status: 'Em aberto' },
      { rows: ganhas, status: 'Ganha' },
      { rows: perdidas, status: 'Perdida' }
    ];

    const allCrmOpportunities = [...abertas, ...ganhas, ...perdidas];
    console.log(`[CRM Sync] Extraídas ${abertas.length} abertas, ${ganhas.length} ganhas, ${perdidas.length} perdidas (total ${allCrmOpportunities.length}).`);

    if (allCrmOpportunities.length === 0) {
      // Atualiza status no banco
      await supabase.from('crm_configs').update({
        last_sync: new Date().toISOString(),
        sync_status: 'sucesso',
        error_message: null
      }).eq('user_id', user.id);

      return res.json({
        message: 'Nenhum registro encontrado no CRM.',
        importedRows: 0,
        totalDb: (await fetchAllUserOpportunities(user.id)).length
      });
    }

    // --- TRAVA DE SEGURANÇA: 1 empresa por conta de BI ---
    // O token do Simplo CRM já escopa os dados a uma única empresa (id_empresa).
    // Vinculamos a conta de BI a essa empresa e impedimos misturar dados de outra.
    const empresasNoLote = Array.from(
      new Set(allCrmOpportunities.map((o: any) => String(o.id_empresa ?? '').trim()).filter(Boolean))
    );

    if (empresasNoLote.length > 1) {
      throw new Error(`A API retornou dados de mais de uma empresa (${empresasNoLote.join(', ')}). Sincronização abortada por segurança.`);
    }

    const empresaAtual = empresasNoLote[0] || null;
    const empresaVinculada = (config as any).id_empresa || null;

    if (empresaVinculada && empresaAtual && empresaVinculada !== empresaAtual) {
      throw new Error(`Esta conta de BI já está vinculada à empresa ${empresaVinculada}, mas o token informado pertence à empresa ${empresaAtual}. Para trocar de empresa, remova primeiro os dados atuais na aba Histórico.`);
    }

    // Normalização. A situação (Ganha/Perdida/Em aberto) vem do grupo da API, não do parsing.
    // Usamos sempre o mapeamento fixo atual (ignora mapeamentos antigos salvos no banco).
    const activeMapping = SIMPLO_CRM_MAPPING;
    const rawRows = grupos.flatMap(({ rows, status }) =>
      rows.map((rawRow: any) => {
        const cleanRow = normalizeRow(rawRow, activeMapping);
        cleanRow.status = status;

        // Traduz o id_motivo_perda para o nome do motivo (a oportunidade só traz o ID)
        if (cleanRow.motivo_perda && motivoMap.has(cleanRow.motivo_perda)) {
          cleanRow.motivo_perda = motivoMap.get(cleanRow.motivo_perda)!;
        }

        // Assinatura MD5 determinística para deduplicação
        const signature = `${user.id}-${cleanRow.protocolo}-${cleanRow.nome_cliente}-${cleanRow.data_criacao}-${cleanRow.valor}`;
        const uniqueHash = crypto.createHash('md5').update(signature).digest('hex');

        return {
          user_id: user.id,
          unique_hash: uniqueHash,
          batch_id: syncBatchId,
          id_empresa: empresaAtual,
          ...cleanRow
        };
      })
    );

    // Filtra linhas válidas
    const validRows = rawRows.filter((r: any) => r.valor >= 0 && r.data_criacao);

    // Deduplicação em nível de array de memória
    const uniqueRowsMap = new Map();
    validRows.forEach((row: any) => { uniqueRowsMap.set(row.unique_hash, row); });
    const rowsToUpsert = Array.from(uniqueRowsMap.values());

    console.log(`[CRM Sync] Linhas válidas e deduplicadas prontas para gravação: ${rowsToUpsert.length}`);

    // Gravação em lote (upsert) no Supabase (1000 a 1000)
    const batchSize = 1000;
    for (let i = 0; i < rowsToUpsert.length; i += batchSize) {
      const batch = rowsToUpsert.slice(i, i + batchSize);
      const { error } = await supabase
        .from('oportunidades')
        .upsert(batch, { onConflict: 'unique_hash', ignoreDuplicates: false });

      if (error) {
        console.error('[CRM Sync] Erro no Upsert do banco:', error);
        throw new Error(`Erro ao persistir no Supabase: ${error.message}`);
      }
    }

    // Registra no histórico de importações para permitir reversão
    await supabase.from('import_history').insert({
      id: syncBatchId,
      user_id: user.id,
      file_name: batchName,
      rows_count: rowsToUpsert.length,
      created_at: new Date().toISOString()
    });

    // Atualiza status de sincronização e vincula a empresa à conta de BI
    await supabase.from('crm_configs').update({
      last_sync: new Date().toISOString(),
      sync_status: 'sucesso',
      error_message: null,
      id_empresa: empresaAtual
    }).eq('user_id', user.id);

    const finalDbData = await fetchAllUserOpportunities(user.id);

    res.json({
      message: 'Sincronização realizada com sucesso',
      importedRows: rowsToUpsert.length,
      totalDb: finalDbData.length,
      importedData: finalDbData
    });

  } catch (error: any) {
    console.error('[CRM Sync] Erro Crítico de Sincronização:', error);
    
    // Registra falha na tabela crm_configs
    try {
      const user = await getUser(req);
      await supabase.from('crm_configs').update({
        sync_status: 'erro',
        error_message: error.message
      }).eq('user_id', user.id);
    } catch (_) {}

    res.status(500).json({ error: `Erro na sincronização: ${error.message}` });
  }
});

// Função para certificar a existência da tabela crm_configs no Supabase
const initDatabase = async () => {
  try {
    const { error } = await supabase.from('crm_configs').select('count', { count: 'exact', head: true }).limit(1);
    
    if (error && error.code === '42P01') {
      console.log('⚠️ Tabela [crm_configs] não existe no Supabase. Criando via exec_sql...');
      
      const { error: rpcError } = await supabase.rpc('exec_sql', {
        query: `
          CREATE TABLE IF NOT EXISTS public.crm_configs (
            user_id UUID PRIMARY KEY,
            base_url TEXT NOT NULL,
            api_token TEXT NOT NULL,
            mapping_profile JSONB NOT NULL,
            last_sync TIMESTAMP WITH TIME ZONE,
            sync_status TEXT,
            error_message TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );
        `
      });

      if (rpcError) {
        console.warn('⚠️ exec_sql indisponível. Por favor, certifique-se de executar o SQL de crm_configs no painel do Supabase:\n');
        console.log(`
          CREATE TABLE public.crm_configs (
            user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
            base_url TEXT NOT NULL,
            api_token TEXT NOT NULL,
            mapping_profile JSONB NOT NULL,
            last_sync TIMESTAMP WITH TIME ZONE,
            sync_status TEXT,
            error_message TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );
        `);
      } else {
        console.log('✅ Tabela [crm_configs] criada com sucesso via RPC!');
      }
    } else if (error) {
      console.error('[Database] Erro de verificação:', error.message);
    } else {
      console.log('✅ Conexão e presença da tabela [crm_configs] confirmadas.');
    }
  } catch (err: any) {
    console.error('[Database] Erro na inicialização:', err.message);
  }
};

app.listen(PORT, async () => { 
  console.log(`🚀 Servidor na porta ${PORT}`);
  await initDatabase();
});