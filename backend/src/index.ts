import express from 'express';
import cors from 'cors';
import multer from 'multer';
import Papa from 'papaparse';
import OpenAI from 'openai';
import crypto from 'crypto'; 
import 'dotenv/config';
import { supabase } from './lib/supabaseClient';
import { generateAnalyticalProfile } from './services/analyticsService';
import { generateText } from './services/aiProviderService';

const app = express();
const PORT = process.env.PORT || 3001; 


const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });


app.use(cors({
    origin: process.env.FRONTEND_URL || '*', 
    methods: ['GET', 'POST']
}));
app.use(express.json());

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- MIDDLEWARE DE SEGURANÇA ---
// Lê o Token JWT do header e valida no Supabase Auth
const getUser = async (req: express.Request) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) throw new Error('Acesso negado: Token não fornecido.');

  const token = authHeader.split(' ')[1]; 
  
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) throw new Error('Sessão inválida ou expirada. Faça login novamente.');
  return user;
};

// no futuro o usuário definir suas colunas na tela.

const DEFAULT_MAPPING = {
    responsavel: ['Responsável', 'Vendedor', 'Owner', 'Agente', 'Rep'],
    funil: ['Funil', 'Pipeline', 'Etapa', 'Fase'],
    status: ['Situação', 'Status', 'Estado', 'Situation'],
    valor: ['Valor', 'Vlr', 'Receita', 'Amount', 'Preço', 'Valor Total'],
    data_criacao: ['Dt.Cad', 'Data Criação', 'Created At', 'Data Entrada', 'Data de Cadastro'],
    data_conclusao: ['Dt.Conq./Perda', 'Data Fechamento', 'Closed At', 'Data Venda', 'Data Conclusão'],
    origem: ['Origem', 'Source', 'Canal', 'Origem do Lead', 'Fonte'],
    cliente: ['Cliente', 'Nome', 'Empresa', 'Lead', 'Nome do Cliente'],
    estado: ['Estado', 'UF', 'U.F.', 'State', 'Região'],
    cidade: ['Cidade', 'City', 'Municipio', 'Local'],
    produto: ['Produto', 'Produtos', 'Serviço', 'Item', 'Mercadoria', 'Product'] // Plural adicionado aqui
};

// Normaliza uma linha de CSV "suja" para o padrão do nosso banco
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
        return new Date().toISOString(); // Fallback para hoje
    };

    const normalizeStatus = (s: string | null) => {
        if (!s) return 'Em aberto';
        const lower = s.toLowerCase();
        if (lower.includes('ganha') || lower.includes('conquistado') || lower.includes('fechado')) return 'Ganha';
        if (lower.includes('perdida') || lower.includes('perdido') || lower.includes('lost')) return 'Perdida';
        return 'Em aberto';
    };

    return {
        responsavel: find(mapping.responsavel) || 'N/A',
        funil: find(mapping.funil) || 'Geral',
        status: normalizeStatus(find(mapping.status)),
        valor: parseCurrency(find(mapping.valor)),
        data_criacao: parseDate(find(mapping.data_criacao)),
        data_conclusao: find(mapping.data_conclusao) ? parseDate(find(mapping.data_conclusao)) : null,
        origem_lead: find(mapping.origem) || 'N/A',
        nome_cliente: find(mapping.cliente) || 'Anônimo',
        estado: find(mapping.estado)?.substring(0, 2).toUpperCase() || 'NA',
        cidade: find(mapping.cidade) || 'N/A',
        produto: find(mapping.produto) || 'Geral'
    };
};

// --- 1. ROTA DE UPLOAD (com deduplicação e hash por linha) ---
app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado.' });

  try {
    const user = await getUser(req);
    const userId = user.id;

    const activeMapping = DEFAULT_MAPPING;

    const csvFileContent = req.file.buffer.toString('utf-8');
    const parsedData = Papa.parse(csvFileContent, { header: true, skipEmptyLines: true }).data;

    // Passo 1: Normalizar e Gerar Hash
    const rawRows = parsedData.map((rawRow: any) => {
      const cleanRow = normalizeRow(rawRow, activeMapping);

      const signature = `${userId}-${cleanRow.data_criacao}-${cleanRow.nome_cliente}-${cleanRow.valor}-${cleanRow.produto}`;
      const uniqueHash = crypto.createHash('md5').update(signature).digest('hex');

      return {
        user_id: userId,
        unique_hash: uniqueHash,
        ...cleanRow,
      };
    });

    // Passo 2: Deduplicação em memória (dentro do próprio CSV)
    const uniqueRowsMap = new Map<string, any>();
    rawRows.forEach((row: any) => {
      uniqueRowsMap.set(row.unique_hash, row);
    });
    const rowsToUpsert = Array.from(uniqueRowsMap.values());

    // Passo 3: Upsert em lotes
    const batchSize = 1000;
    let totalImported = 0;

    for (let i = 0; i < rowsToUpsert.length; i += batchSize) {
      const batch = rowsToUpsert.slice(i, i + batchSize);

      const { error } = await supabase
        .from('oportunidades')
        .upsert(batch, {
          onConflict: 'user_id, unique_hash',
          ignoreDuplicates: false,
        });

      if (error) {
        console.error('Erro no batch:', error);
        throw error;
      }

      totalImported += batch.length;
    }

    const { data: finalData } = await supabase
      .from('oportunidades')
      .select('*')
      .eq('user_id', userId);

    res.json({ message: 'Processamento concluído', importedData: finalData, total: totalImported });
  } catch (error: any) {
    console.error('Erro crítico upload:', error);
    res.status(500).json({ error: error.message || 'Erro interno no servidor' });
  }
});


app.post('/api/analyze', async (req, res) => {
  const { provider } = req.body;
  const selectedProvider = provider || 'openai';

  try {
    const user = await getUser(req); // Autenticação
    const userId = user.id;


    const profile = await generateAnalyticalProfile(userId);
    
    if (!profile) return res.status(400).json({ error: 'Sem dados para analisar.' });

    // 3. Prompt Especialista de BI
    const prompt = `
      Você é um **Head de Business Intelligence (BI)** contratado para auditar a operação comercial e da empresa em geral. 
      Sua missão não é descrever números, mas sim **diagnosticar a saúde do negócio, entender o funcionamento, dar insigts e dicas de como melhorar. Você receberá diversos dados faça uma análise profunda e detalhada deles, inclusive relacionando-os**.
      
      --- DADOS AUDITADOS (FONTE REAL: SQL) ---
      
      1. VOLUMETRIA E FINANCEIRO:
      - Total de Oportunidades: ${profile.resumo.total_analisado}
      - Receita Total Confirmada: R$ ${profile.resumo.receita_total}
      - Vendas Ganhas: ${profile.resumo.ganhas}
      - Perdas: ${profile.resumo.perdidas}
      - Ticket Médio Global: R$ ${profile.resumo.ticket_medio}
      
      2. ESTRUTURA DE FUNIS (Crucial: Diferencie Suporte de Vendas):
      ${JSON.stringify(profile.funis, null, 2)}

      3. RANKING DE PERFORMANCE (Top Vendedores):
      ${JSON.stringify(profile.vendedores.slice(0, 7), null, 2)}

      4. CANAIS DE TRAÇÃO (Top Origens):
      ${JSON.stringify(profile.origens.slice(0, 5), null, 2)}

      5. LINHA DO TEMPO (Sazonalidade):
      ${JSON.stringify(profile.timeline, null, 2)}

      6. DISTRIBUIÇÃO GEOGRÁFICA E PORTFÓLIO:
      - Estados Top: ${JSON.stringify(profile.geografia?.estados?.slice(0, 5) || [], null, 2)}
      - Cidades Top: ${JSON.stringify(profile.geografia?.cidades?.slice(0, 5) || [], null, 2)}
      - Produtos Top: ${JSON.stringify(profile.produtos?.slice(0, 5) || [], null, 2)}

      --- ESTRUTURA DO RELATÓRIO EXECUTIVO (MARKDOWN) ---

      **1. Diagnóstico Executivo**
      Dê um veredito curto e grosso sobre a saúde da operação. A conversão está saudável para o mercado? Há dependência excessiva de um único vendedor ou canal? (Ex: "A operação apresenta risco alto devido à concentração de 60% da receita na vendedora X").

      **2. Análise de Eficiência do Time (Matriz Volume x Valor)**
      Não liste apenas quem vendeu. Analise:
      - Quem é o "Fazedor de Chuva" (Alto Volume / Alto Valor)?
      - Quem tem "Taxa de Conversão Alta" mas recebe poucos leads (Oportunidade de escala)?
      - Quem está "Queimando Leads" (Baixa conversão, alto volume)?
      - Busque entender possíveis motivos para conversão, leads não qualificados, problemas na geração de tráfego pago?
      - Relacione dados EX: se vendedor X recebe o mesmo número do vendedor Y contudo tem uma conversão muito maior, então o problema não são os leads, mas sim o vendedor possivelmente, contudo se todos os vendedores tem um desempenho baixo faz sentido analisar a qualidade dos leads, ou se há algum gap no fluxo de vendas/suporte.

      **3. Inteligência de Canais e Funis**
      - Qual funil é puramente operacional (Suporte) e qual gera receita? - Considerar a diferença lógica e de funcionameto de acordo com o nome dos funis.
      - Qual origem de lead traz o ROI real (R$ no bolso) vs qual traz apenas volume de curiosos?
      - A operação está concentrada em alguma região ou produto? Há estados ou cidades com potencial reprimido?

      **4. Raio-X Sazonal**
      Identifique o mês de ouro e o mês de crise. Existe uma tendência de queda ou crescimento nos últimos 3 meses?
      Quais meses tiveram melhor desempenho.

      **5. Plano de Ação Estratégico (3 Pontos)**
      Dê 3 ordens práticas para o Diretor Comercial executar para melhorar esses números. Seja específico.
      Dê dicas de como pode melhorar no geral e dicas normalmente úteis para esse cenário.
      
      Tom de voz: Profissional, analítico, direto. Sem "parabéns", vá direto aos insights.
    `;

    const analysis = await generateText(selectedProvider, prompt);
    res.json({ analysis });

  } catch (error: any) {
    console.error("Erro análise:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// --- 3. ROTA DE CHAT (COM TOOL CALLING) ---

const tools = [
  {
    type: "function" as const,
    function: {
      name: "consultar_dados_vendas",
      description: "Consulta o banco de dados para responder perguntas específicas.",
      parameters: {
        type: "object",
        properties: {
          responsavel: { type: "string", description: "Filtro por vendedor." },
          funil: { type: "string", description: "Filtro por funil." },
          mes: { type: "integer", description: "Mês (1-12)." },
          ano: { type: "integer", description: "Ano (2024, 2025)." },
          origem: { type: "string", description: "Filtro por origem." },
          status: { type: "string", enum: ["Ganha", "Perdida", "Em aberto"] },
          estado: { type: "string", description: "Sigla do estado (UF)." },
          produto: { type: "string", description: "Nome do produto." }
        },
        required: [],
      },
    },
  },
];

app.post('/api/chat', async (req, res) => {
  const { message, history } = req.body;

  try {
    const user = await getUser(req); // Autenticação
    const userId = user.id;

    const messages: any[] = [
      { role: "system", content: "Você é um assistente de BI. Se perguntarem números, USE 'consultar_dados_vendas'. Se perguntarem mês sem ano, assuma 2025." },
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

   
    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      messages.push(responseMessage);
      
      for (const toolCallItem of responseMessage.tool_calls) {
        const toolCall = toolCallItem as any;

        if (toolCall.function.name === "consultar_dados_vendas") {
          const args = JSON.parse(toolCall.function.arguments);
          
          let query = supabase.from('oportunidades')
            .select('valor, status, data_conclusao, data_criacao')
            .eq('user_id', userId); 

          if (args.responsavel) query = query.ilike('responsavel', `%${args.responsavel}%`);
          if (args.origem) query = query.ilike('origem_lead', `%${args.origem}%`);
          if (args.funil) query = query.ilike('funil', `%${args.funil}%`);
          if (args.estado) query = query.ilike('estado', `%${args.estado}%`);
          if (args.produto) query = query.ilike('produto', `%${args.produto}%`);
          if (args.status) query = query.eq('status', args.status);


          const isSalesQuery = args.status === 'Ganha' || message.toLowerCase().includes('venda') || message.toLowerCase().includes('receita');
          const dateField = isSalesQuery ? 'data_conclusao' : 'data_criacao';

          if (args.mes) {
             const ano = args.ano || 2025;
             const startDate = `${ano}-${args.mes.toString().padStart(2, '0')}-01`;
             const endDate = new Date(ano, args.mes, 0).toISOString().split('T')[0];
             query = query.gte(dateField, startDate).lte(dateField, endDate);
          } else if (args.ano) {
             query = query.gte(dateField, `${args.ano}-01-01`).lte(dateField, `${args.ano}-12-31`);
          }

          const { data: rows, error } = await query;
          if (error) throw error;


          const summary = (rows || []).reduce((acc: any, row: any) => {
            const valor = Number(row.valor) || 0;
            acc.total++;
            acc.valor_total += valor;
            if (row.status === 'Ganha') {
              acc.ganhas++;
              acc.valor_ganho += valor;
            }
            return acc;
          }, { total: 0, valor_total: 0, ganhas: 0, valor_ganho: 0 });

          const toolResult = JSON.stringify({
             filtros_aplicados: args,
             resultado: {
                 encontrados: summary.total,
                 ganhas: summary.ganhas,
                 receita_total: summary.valor_ganho.toFixed(2)
             }
          });

          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: toolResult,
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
    console.error("Erro chat:", error.message);
    res.status(500).json({ error: error.message });
  }
});


app.listen(PORT, () => { console.log(`🚀 Servidor rodando na porta ${PORT}`); });