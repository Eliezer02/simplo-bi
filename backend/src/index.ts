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
app.use(express.json());

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

// --- MAPEAMENTO CSV (ATUALIZADO) ---

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

const normalizeRow = (row: any, mapping: typeof DEFAULT_MAPPING) => {
    const find = (keys: string[]) => {
        for (const k of keys) {
            const foundKey = Object.keys(row).find(rk => rk.toLowerCase().trim() === k.toLowerCase().trim());
            if (foundKey && row[foundKey]) return row[foundKey].toString().trim();
        }
        return null;
    };

    const parseCurrency = (v: string | null) => {
        if (!v) return 0;
        let clean = v.replace('R$', '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
        const num = parseFloat(clean);
        return isNaN(num) ? 0 : num;
    };

    const parseDate = (d: string | null) => {
        if (!d || d.includes('#') || d === '00/00/0000') return new Date().toISOString(); 
        const parts = d.split('/');
        if (parts.length === 3) {
             const dateObj = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
             if (!isNaN(dateObj.getTime())) return dateObj.toISOString();
        }
        return new Date().toISOString(); 
    };

    const normalizeStatus = (s: string | null) => {
        if (!s) return 'Em aberto';
        const lower = s.toLowerCase();
        if (lower.includes('ganha') || lower.includes('conquistado') || lower.includes('fechado')) return 'Ganha';
        if (lower.includes('perdida') || lower.includes('perdido') || lower.includes('lost')) return 'Perdida';
        return 'Em aberto';
    };

    return {
        protocolo: find(mapping.protocolo) || '',
        responsavel: find(mapping.responsavel) || 'N/A',
        funil: find(mapping.funil) || 'Geral',
        etapa: find(mapping.etapa) || 'Geral',
        status: normalizeStatus(find(mapping.status)),
        valor: parseCurrency(find(mapping.valor)),
        data_criacao: parseDate(find(mapping.data_criacao)),
        data_conclusao: find(mapping.data_conclusao) ? parseDate(find(mapping.data_conclusao)) : null,
        origem_lead: find(mapping.origem) || 'N/A',
        nome_cliente: find(mapping.cliente) || 'Anônimo',
        estado: find(mapping.estado)?.substring(0, 2).toUpperCase() || 'NA',
        cidade: find(mapping.cidade) || 'N/A',
        produto: find(mapping.produto) || 'Geral',
        motivo_perda: find(mapping.motivo) || 'Não informado'
    };
};

// --- ROTAS DA API ---

// 1. UPLOAD (CORRIGIDO PARA LER PONTO E VÍRGULA E IMPORTAR DUPLICATAS)
app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado.' });

  try {
    const user = await getUser(req);
    const userId = user.id;

    const activeMapping = { ...DEFAULT_MAPPING };
    const csvFileContent = req.file.buffer.toString('utf-8');
    
    // CONFIGURAÇÃO PAPAPARSE ATUALIZADA - CORREÇÃO DE TIPO
    const parsedResult = Papa.parse(csvFileContent, { 
        header: true, 
        skipEmptyLines: true,
        delimiter: ";", 
        // encoding removido para evitar erro de tipo no TS
    });

    const parsedData = parsedResult.data; // Acesso correto aos dados

    const rawRows = parsedData.map((rawRow: any, index: number) => {
      const cleanRow = normalizeRow(rawRow, activeMapping);
      
      // HASH ROBUSTO: Inclui Protocolo, Etapa e o INDEX para permitir duplicatas de dados
      const signature = `${userId}-${cleanRow.protocolo}-${cleanRow.nome_cliente}-${cleanRow.etapa}-${cleanRow.valor}-${index}`;
      const uniqueHash = crypto.createHash('md5').update(signature).digest('hex');

      return { user_id: userId, unique_hash: uniqueHash, ...cleanRow };
    });

    const uniqueRowsMap = new Map();
    rawRows.forEach((row: any) => { uniqueRowsMap.set(row.unique_hash, row); });
    const rowsToUpsert = Array.from(uniqueRowsMap.values());

    const batchSize = 1000;
    for (let i = 0; i < rowsToUpsert.length; i += batchSize) {
      const batch = rowsToUpsert.slice(i, i + batchSize);
      // upsert ignorando duplicatas de hash (mas nosso hash agora é quase único por linha)
      await supabase.from('oportunidades').upsert(batch, { onConflict: 'unique_hash', ignoreDuplicates: false });
    }

    const finalData = await fetchAllUserOpportunities(userId);
    res.json({ message: 'Processamento concluído', importedRows: rowsToUpsert.length, totalDb: finalData.length, importedData: finalData });

  } catch (error: any) {
    console.error('Erro upload:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2. ANALYZE
app.post('/api/analyze', async (req, res) => {
  const { provider } = req.body;
  const selectedProvider = provider || 'openai';

  try {
    const user = await getUser(req);
    const profile = await generateAnalyticalProfile(user.id);
    
    if (!profile) return res.status(400).json({ error: 'Sem dados para analisar.' });

 
    const { data: rowsPerdidas } = await supabase
      .from('oportunidades')
      .select('motivo_perda')
      .eq('user_id', user.id)
      .eq('status', 'Perdida');

    const motivosPerda: Record<string, number> = {};
    rowsPerdidas?.forEach((row: any) => {
        const m = row.motivo_perda || 'Não informado';
        motivosPerda[m] = (motivosPerda[m] || 0) + 1;
    });

    const topMotivos = Object.entries(motivosPerda).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([m,q])=>`- ${m}: ${q}`);

    const prompt = `
      Você é um Head de BI. Analise estes dados de CRM:
      - Total: ${profile.resumo.total_analisado} (Receita: R$ ${profile.resumo.receita_total})
      - Conversão: ${((profile.resumo.ganhas / profile.resumo.total_analisado) * 100).toFixed(1)}%
      - Top Motivos Perda: \n${topMotivos.join('\n')}
      - Funis: ${JSON.stringify(profile.funis.slice(0,3))}
      
      Dê 3 insights executivos focados em melhorar a conversão e recuperar perdas.
    `;

    const analysis = await generateText(selectedProvider, prompt);
    res.json({ analysis });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});


const tools = [
  {
    type: "function" as const,
    function: {
      name: "analisar_dados_complexos",
      description: "Agrupa e filtra dados de vendas.",
      parameters: {
        type: "object",
        properties: {
          filtros: {
            type: "object",
            properties: {
              responsavel: { type: "string" },
              status: { type: "string" },
              ano: { type: "integer" }
            }
          },
          agrupar_por: {
            type: "array",
            items: { type: "string", enum: ["mes", "responsavel", "funil", "origem", "motivo_perda", "produto"] }
          }
        },
        required: ["agrupar_por"],
      },
    },
  },
];

app.post('/api/chat', async (req, res) => {
  const { message, history } = req.body;

  try {
    const user = await getUser(req);
    const userId = user.id;

    const messages: any[] = [
      { role: "system", content: "Você é um Analista de Dados Sênior. Use a ferramenta 'analisar_dados_complexos' sempre que precisar de números." },
      ...history.map((h: any) => ({ role: h.role === 'model' ? 'assistant' : 'user', content: h.content })),
      { role: "user", content: message }
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: messages,
      tools: tools,
      tool_choice: "auto",
    });

    const responseMessage = completion.choices[0].message;

    if (responseMessage.tool_calls) {
      messages.push(responseMessage); 

      for (const toolCallItem of responseMessage.tool_calls) {
       
        const toolCall = toolCallItem as any;

        if (toolCall.function.name === "analisar_dados_complexos") {
          const args = JSON.parse(toolCall.function.arguments);
          const { filtros = {}, agrupar_por = [] } = args;

          // Busca TODOS os dados usando a função paginada corrigida
          const rows = await fetchAllUserOpportunities(userId);

          // Processamento em Memória (Rápido para < 10k linhas)
          const agrupados: Record<string, { qtd: number, valor: number }> = {};
          
          rows.forEach((row: any) => {
             // Aplicar Filtros Básicos
             if (filtros.responsavel && !row.responsavel.toLowerCase().includes(filtros.responsavel.toLowerCase())) return;
             if (filtros.status && row.status !== filtros.status) return;

             // Chave de Agrupamento
             const chave = agrupar_por.map((campo: string) => {
                 if (campo === 'mes') {
                     const d = new Date(row.data_criacao);
                     return `${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`;
                 }
                 return row[campo] || 'N/A';
             }).join(' | ');

             if (!agrupados[chave]) agrupados[chave] = { qtd: 0, valor: 0 };
             agrupados[chave].qtd++;
             agrupados[chave].valor += Number(row.valor) || 0;
          });

          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(Object.entries(agrupados).map(([k,v]) => ({ grupo: k, ...v })).slice(0, 50))
          });
        }
      }

      const finalResponse = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: messages,
      });

      return res.json({ reply: finalResponse.choices[0].message.content });
    }

    res.json({ reply: responseMessage.content });

  } catch (error: any) {
    console.error("Erro chat:", error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => { console.log(`🚀 Servidor na porta ${PORT}`); });