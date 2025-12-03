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

app.use(cors({ origin: process.env.FRONTEND_URL || '*', methods: ['GET', 'POST'] }));
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

  rows.forEach((row) => {
    const valor = Number(row.valor) || 0;
    let status = (row.status || '').toLowerCase();
    const vendedor = row.responsavel || 'N/A';
    const origem = row.origem_lead || 'N/A';
    const funil = row.funil || 'Geral';
    const estado = (row.estado || 'NA').toString().substring(0, 2).toUpperCase();
    const cidade = row.cidade || 'N/A';
    const produto = row.produto || 'Geral';
    
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
    if (!porMes[mesCriacao]) porMes[mesCriacao] = { criadas: 0, ganhas: 0, valor: 0 };

    // Incrementos Gerais
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
      porVendedor[vendedor].ganhas++; porVendedor[vendedor].valor += valor;
      porOrigem[origem].ganhas++; porOrigem[origem].valor += valor;
      porFunil[funil].ganhas++; porFunil[funil].valor += valor;
      porEstado[estado].ganhas++; porEstado[estado].valor += valor;
      porCidade[cidade].ganhas++; porCidade[cidade].valor += valor;
      porProduto[produto].ganhas++; porProduto[produto].valor += valor;

      if (!porMes[mesConclusao]) porMes[mesConclusao] = { criadas: 0, ganhas: 0, valor: 0 };
      porMes[mesConclusao].ganhas++;
      porMes[mesConclusao].valor += valor;
    } else if (tipo === 'perdida') {
      qtdPerdidas++;
      porVendedor[vendedor].perdidas++;
      porFunil[funil].perdidas++;
    }
  });

  // Helpers de formatação
  const calcConv = (g: number, t: number) => t > 0 ? ((g/t)*100).toFixed(1)+'%' : '0%';
  const sortValor = (obj: any) => Object.entries(obj).map(([k,v]:any) => ({ nome: k, ...v, valor_total: v.valor.toFixed(2), conversao: calcConv(v.ganhas, v.total) })).sort((a:any, b:any) => parseFloat(b.valor_total) - parseFloat(a.valor_total));

  return {
    resumo: {
      total_analisado: rows.length,
      ganhas: qtdGanhas,
      perdidas: qtdPerdidas,
      em_aberto: qtdAberto,
      receita_total: totalValor.toFixed(2),
      ticket_medio: qtdGanhas > 0 ? (totalValor / qtdGanhas).toFixed(2) : '0'
    },
    funis: sortValor(porFunil),
    vendedores: sortValor(porVendedor),
    origens: sortValor(porOrigem),
    timeline: Object.entries(porMes).map(([m,d]:any) => ({ mes: m, oportunidades_criadas: d.criadas, vendas_realizadas: d.ganhas, receita: d.valor.toFixed(2) })).sort((a,b) => {
        const [m1,y1] = a.mes.split('/'); const [m2,y2] = b.mes.split('/');
        return new Date(Number(y1), Number(m1)-1).getTime() - new Date(Number(y2), Number(m2)-1).getTime();
    }),
    geografia: { estados: sortValor(porEstado).slice(0,5), cidades: sortValor(porCidade).slice(0,5) },
    produtos: sortValor(porProduto)
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

// --- SUBSTITUA A SUA normalizeRow POR ESTA ---
const normalizeRow = (row: any, mapping: typeof DEFAULT_MAPPING) => {
    // Função auxiliar de busca (Case Insensitive)
    const find = (keys: string[]) => {
        const rowKeys = Object.keys(row);
        for (const k of keys) {
            const foundKey = rowKeys.find(rk => rk.toLowerCase().trim() === k.toLowerCase().trim());
            if (foundKey && row[foundKey]) return row[foundKey].toString().trim();
        }
        return null;
    };

    const statusRaw = find(mapping.status);
    
    // Lógica inteligente para pegar valor (prioriza 'Valor', se não tiver, pega 'Valor Unitário')
    const valorRaw = find(mapping.valor) || find(['Valor Unitário', 'Vlr Unit']); 
    
    // Normalização de Datas
    const dataCriacaoRaw = find(mapping.data_criacao);
    const dataConclusaoRaw = find(mapping.data_conclusao);
    
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
        protocolo: find(mapping.protocolo) || '',
        responsavel: find(mapping.responsavel) || 'N/A',
        funil: find(mapping.funil) || 'Geral',
        etapa: find(mapping.etapa) || 'Geral',
        status: statusFinal,
        valor: parseBrazilianCurrency(valorRaw), // <--- AQUI ESTAVA O ERRO DE VALOR
        data_criacao: dataCriacao.toISOString(),
        data_conclusao: dataConclusao ? dataConclusao.toISOString() : null,
        origem_lead: find(mapping.origem) || 'N/A',
        nome_cliente: find(mapping.cliente) || 'Anônimo',
        estado: find(mapping.estado)?.substring(0, 2).toUpperCase() || 'NA',
        cidade: find(mapping.cidade) || 'N/A',
        produto: find(mapping.produto) || 'Geral',
        motivo_perda: find(mapping.motivo) || 'Não informado'
    };
};

// --- ROTAS DA API ---

// --- ROTA DE UPLOAD BLINDADA ---
app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado.' });

  try {
    const user = await getUser(req);
    const userId = user.id;

    console.log(`[Upload] Iniciando processamento para user: ${userId}`);

    const activeMapping = { ...DEFAULT_MAPPING };

    const csvFileContent = req.file.buffer.toString('utf-8');
    
    // 1. Parsing com detecção automática de delimitador
    const parsedResult = Papa.parse(csvFileContent, { 
        header: true, 
        skipEmptyLines: true, 
        delimiter: "", // <--- String vazia ativa autodetecção (virgula ou ponto e virgula)
    });

    const parsedData = parsedResult.data;

    console.log(`[Upload] Linhas encontradas no CSV: ${parsedData.length}`);

    if (parsedData.length === 0) {
        return res.status(400).json({ error: "O CSV parece estar vazio ou o formato não foi reconhecido." });
    }

    // Debug: Verificar primeira linha para ver se o mapeamento vai funcionar
    console.log('[Upload] Exemplo de linha crua:', parsedData[0]);

    const rawRows = parsedData.map((rawRow: any, index: number) => {
      const cleanRow = normalizeRow(rawRow, activeMapping);
      
      // Hash inclui index para garantir unicidade mesmo em linhas duplicadas
      const signature = `${userId}-${cleanRow.protocolo}-${cleanRow.nome_cliente}-${cleanRow.etapa}-${cleanRow.valor}-${index}`;
      const uniqueHash = crypto.createHash('md5').update(signature).digest('hex');

      return { user_id: userId, unique_hash: uniqueHash, ...cleanRow };
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
          throw new Error(`Erro no Banco de Dados: ${error.message}. Verifique se as colunas 'protocolo' e 'etapa' existem.`);
      }
    }

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

    

    **5. Plano de Ação Estratégico (3 Pontos)**

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


// ==========================================
// CONFIGURAÇÃO DE TOOLS PARA O CHAT
// ==========================================
const tools = [
  {
    type: "function" as const,
    function: {
      name: "analisar_dados_complexos",
      description: "Agrupa, filtra e calcula métricas de vendas. Use para responder perguntas sobre 'melhor mês', 'taxa de conversão por vendedor', 'motivos de perda', 'geografia', etc.",
      parameters: {
        type: "object",
        properties: {
          filtros: {
            type: "object",
            description: "Filtros opcionais a aplicar antes de agrupar",
            properties: {
              responsavel: { type: "string" },
              status: { type: "string", enum: ["Ganha", "Perdida", "Em aberto"] },
              origem: { type: "string" },
              ano: { type: "integer", description: "Ano específico para análise (ex: 2024, 2025)" }
            }
          },
          agrupar_por: {
            type: "array",
            description: "Lista de campos para agrupar. Ex: ['mes', 'origem'] cria uma matriz mês x origem.",
            items: { type: "string", enum: ["mes", "responsavel", "funil", "origem", "motivo_perda", "produto", "estado", "cidade"] }
          }
        },
        required: ["agrupar_por"],
      },
    },
  },
];

// ==========================================
// ROTA 3: CHAT (COM DEBUG LOG E DATA CORRETA)
// ==========================================
app.post('/api/chat', async (req, res) => {
  const { message, history } = req.body;
  const debugLogs: any[] = []; // Array para armazenar logs da IA

  try {
    const user = await getUser(req);
    const userId = user.id;

    // 1. Injetar Data Atual para evitar alucinação temporal
    const hoje = new Date();
    const dataAtualStr = hoje.toLocaleDateString('pt-BR');
    
    const systemPrompt = `
    Você é o **Simplo BI (Head de Inteligência Comercial)**. Seu perfil é executivo, cirúrgico e baseia-se em dados comparativos. Você não "acha", você "prova". Sempre busque trazer respostas concisas e objetivas dar um sentimento de conversa e não relatório.
    HOJE É: ${dataAtualStr}.
  
    --- 🧠 PROTOCOLO DE INTELIGÊNCIA COMPARATIVA ---
  
    1. **REGRA DE OURO: DIAGNÓSTICO POR CONTRASTE (BENCHMARKING)**
       - **Nunca julgue um vendedor isoladamente.** Sempre compare com a MÉDIA DO TIME e com o tipo de LEAD.
       - **Como identificar quem "Queima Leads" (Churn de Oportunidade):**
         - *Cenário A:* Se Vendedor X converte 2% e o resto do time converte 15% nos mesmos canais -> **Problema de Performance do Vendedor (Treinamento necessário).**
         - *Cenário B:* Se TODOS os vendedores convertem 2% -> **Problema na Qualidade do Lead (Marketing) ou no Produto.** Não culpe o time.
       - **Contexto de Origem:** Não compare a conversão de um vendedor que recebe "Indicação" (fácil venda) com um que prospecta "Cold Call" (difícil venda).
  
    2. **DETECÇÃO DE "DADOS SOMBRA" & CULTURA DE CRM (CRÍTICO)**
       - Antes de qualquer análise, verifique a integridade dos dados.
       - **Sintoma:** Alta incidência de campos "N/A", "Não Informado" ou valores financeiros zerados (R$ 0,00) em oportunidades ganhas/perdidas.
       - **Diagnóstico Obrigatório:** Isso indica **Falha de Processo da Equipe**. O vendedor não está preenchendo o CRM.
       - **Ação:** Você DEVE alertar o gestor explicitamente. 
       -Sempre alerte para o número de preenchimento incorreto.
         - *Exemplo de Frase:* "🚨 **Alerta de Processo:** 30% das suas oportunidades estão sem 'Motivo de Perda' e várias vendas constam com valor R$ 0,00. **Sua equipe não está alimentando o CRM corretamente.** Isso sabota sua inteligência. Recomendo auditar o time e tornar esses campos obrigatórios na ferramenta."
  
    3. **ESTRUTURA DE RESPOSTA EXECUTIVA (CONCISÃO)**
       - **Direto ao Ponto (B.L.U.F.):** Comece com a conclusão. Não enrole.
       - **Sem Textão:** Use tópicos (Bullet points) e Tabelas compactas.
       - **Formato Padrão:**
         1. **Veredito:** A resposta direta à pergunta.
         2. **Evidência:** Os números comparativos que provam (Ex: "João: 5% vs Média Time: 12%").
         3. **Ação/Correção:** O que fazer agora (seja com o vendedor, com o marketing ou com o preenchimento de dados).
  
    4. **MULTIFATORIALIDADE**
       - Considere a tríade: **Volume de Leads** x **Taxa de Conversão** x **Ticket Médio**.
       - Um vendedor pode ter receita baixa, mas conversão alta (recebe poucos leads). Nesse caso, a culpa é da distribuição, não dele.
  
    --- EXEMPLO DE RACIOCÍNIO ESPERADO ---
    *Usuário:* "Por que perdemos tantas vendas em Março?"
    *Análise:* Você vê que 80% das perdas estão sem motivo preenchido.
    *Resposta:* "Não é possível diagnosticar a causa raiz mercadológica porque **80% das perdas não têm o 'Motivo' preenchido pelos vendedores**. 
    **Ação Imediata:** A equipe de vendas precisa ser cobrada para justificar as perdas (Preço? Concorrência?), caso contrário, você continuará cego sobre os gargalos."
  `;

    const messages: any[] = [
      { role: "system", content: systemPrompt },
      ...history.map((h: any) => ({ role: h.role === 'model' ? 'assistant' : 'user', content: h.content })),
      { role: "user", content: message }
    ];

    // Primeira chamada ao GPT
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: messages,
      tools: tools,
      tool_choice: "auto",
    });

    const responseMessage = completion.choices[0].message;

    // Se o GPT decidiu chamar uma função
    if (responseMessage.tool_calls) {
      messages.push(responseMessage); 

      for (const toolCallItem of responseMessage.tool_calls) {
        const toolCall = toolCallItem as any;

        if (toolCall.function.name === "analisar_dados_complexos") {
          const args = JSON.parse(toolCall.function.arguments);
          const { filtros = {}, agrupar_por = [] } = args;

          debugLogs.push({ step: 'GPT solicitou função', tool: 'analisar_dados_complexos', argumentos: args });

          const rows = await fetchAllUserOpportunities(userId);

          // Inicializa acumuladores (agora com valor_perdido)
          const agrupados: Record<string, { 
              qtd: number, 
              ganhas: number, 
              perdidas: number, 
              valor_total: number, 
              valor_ganho: number, 
              valor_perdido: number // <--- Importante para análise de perdas
          }> = {};
          
          let rowCount = 0;

          rows.forEach((row: any) => {
             // --- 1. HIGIENIZAÇÃO (NORMALIZAÇÃO EM TEMPO DE EXECUÇÃO) ---
             // Isso garante que nunca tenhamos null/undefined nas comparações
             const rResponsavel = (row.responsavel || 'N/A').trim() || 'N/A';
             const rOrigem = (row.origem_lead || 'N/A').trim() || 'N/A';
             const rFunil = (row.funil || 'Geral').trim();
             const rStatus = (row.status || '').toLowerCase();
             const rMotivo = (row.motivo_perda || 'Não informado').trim() || 'Não informado';
             const rProduto = (row.produto || 'Geral').trim() || 'Geral';
             const rEstado = (row.estado || 'NA').trim() || 'NA'; // Estado geralmente é sigla curta
             
             // Conversão Numérica Segura
             const valor = Number(row.valor) || 0;

             // Tratamento de Datas (Crucial para não bugar o 'mes')
             const dataCriacao = new Date(row.data_criacao);
             // Se data_conclusao for inválida/null, usa data_criacao como fallback
             const dataConclusao = row.data_conclusao ? new Date(row.data_conclusao) : dataCriacao;

             // Definição de Status
             const isGanha = rStatus.includes('ganha') || rStatus.includes('fechado') || rStatus.includes('conquistado') || rStatus.includes('vendido');
             const isPerdida = rStatus.includes('perdida') || rStatus.includes('perdido') || rStatus.includes('desqualificado');

             // --- 2. LÓGICA TEMPORAL (ANO/MÊS) ---
             // Se é venda ganha, a data relevante é a do FECHAMENTO.
             // Se é perda ou lead geral, a data relevante é a da CRIAÇÃO.
             const dataReferencia = (filtros.status === 'Ganha' || isGanha) ? dataConclusao : dataCriacao;
             
             // Evita erro de .getFullYear() em data inválida
             if (isNaN(dataReferencia.getTime())) return; 

             // --- 3. FILTRAGEM (Case Insensitive e Segura) ---
             if (filtros.ano && dataReferencia.getFullYear() !== filtros.ano) return;
             
             if (filtros.responsavel) {
                 if (!rResponsavel.toLowerCase().includes(filtros.responsavel.toLowerCase())) return;
             }
             
             if (filtros.status) {
                 if (filtros.status === 'Ganha' && !isGanha) return;
                 if (filtros.status === 'Perdida' && !isPerdida) return;
                 if (filtros.status === 'Em aberto' && (isGanha || isPerdida)) return;
             }

             if (filtros.origem) {
                 if (!rOrigem.toLowerCase().includes(filtros.origem.toLowerCase())) return;
             }

             rowCount++;

             // --- 4. AGRUPAMENTO (CHAVE COMPOSTA) ---
             const chave = agrupar_por.map((campo: string) => {
                 if (campo === 'mes') {
                     // Formata MM/YYYY
                     return `${(dataReferencia.getMonth() + 1).toString().padStart(2, '0')}/${dataReferencia.getFullYear()}`;
                 }
                 if (campo === 'responsavel') return rResponsavel;
                 if (campo === 'origem') return rOrigem;
                 if (campo === 'funil') return rFunil;
                 if (campo === 'motivo_perda') return rMotivo;
                 if (campo === 'produto') return rProduto;
                 if (campo === 'estado') return rEstado;
                 
                 // Fallback genérico para campos não mapeados explicitamente acima
                 return row[campo] || 'N/A';
             }).join(' | ');

             // --- 5. AGREGAÇÃO MATEMÁTICA ---
             if (!agrupados[chave]) {
                 agrupados[chave] = { 
                     qtd: 0, 
                     ganhas: 0, 
                     perdidas: 0, 
                     valor_total: 0, 
                     valor_ganho: 0, 
                     valor_perdido: 0 
                 };
             }
             
             agrupados[chave].qtd++;
             agrupados[chave].valor_total += valor;

             if (isGanha) {
                 agrupados[chave].ganhas++;
                 agrupados[chave].valor_ganho += valor;
             } else if (isPerdida) {
                 agrupados[chave].perdidas++;
                 agrupados[chave].valor_perdido += valor;
             }
          });

          // --- 6. FORMATAÇÃO FINAL PARA O GPT ---
          const resultadoFinal = Object.entries(agrupados)
            .map(([k,v]) => ({ 
                grupo: k, 
                total_leads: v.qtd, 
                vendas: v.ganhas,
                perdas: v.perdidas,
                receita: Number(v.valor_ganho.toFixed(2)), // Number limpo para o JSON
                receita_perdida: Number(v.valor_perdido.toFixed(2)),
                conversao: v.qtd > 0 ? ((v.ganhas / v.qtd) * 100).toFixed(1) + '%' : '0%'
            }))
            // Ordenação Inteligente:
            // 1. Por Receita (maior para menor)
            // 2. Se receita for igual (ex: análise de perdas), ordena por Receita Perdida
            // 3. Se ambos forem zero, ordena por Volume (Quantidade)
            .sort((a,b) => {
                return (b.receita - a.receita) || 
                       (b.receita_perdida - a.receita_perdida) || 
                       (b.total_leads - a.total_leads);
            })
            .slice(0, 50); // Top 50 para economizar tokens

          // LOG DE DEBUG PARA O FRONTEND
          debugLogs.push({ 
              step: 'Resultado Calculado (Blindado)', 
              linhas_consideradas: rowCount, 
              amostra_output: resultadoFinal.slice(0, 3) 
          });

          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(resultadoFinal)
          });
        }
      }

      // Segunda chamada ao GPT (para ele formular a resposta final com os dados)
      const finalResponse = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: messages,
      });

      return res.json({ 
          reply: finalResponse.choices[0].message.content,
          debug: debugLogs // <--- AQUI ESTÁ O OURO: Enviamos os logs para o Frontend
      });
    }

    // Se não chamou ferramenta, retorna direto
    res.json({ reply: responseMessage.content, debug: null });

  } catch (error: any) {
    console.error("Erro chat:", error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => { console.log(`🚀 Servidor na porta ${PORT}`); });