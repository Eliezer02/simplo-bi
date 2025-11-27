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
const getUser = async (req: express.Request) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) throw new Error('Acesso negado: Token não fornecido.');
  const token = authHeader.split(' ')[1]; 
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) throw new Error('Sessão inválida ou expirada. Faça login novamente.');
  return user;
};

// --- CONFIGURAÇÃO DE MAPEAMENTO ---
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
    produto: ['Produto', 'Produtos', 'Serviço', 'Item', 'Mercadoria', 'Product'],
    motivo: ['Motivo', 'Motivo da Perda', 'Reason', 'Observação', 'Obs', 'Detalhe Perda','Motivo.Perda']
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
        produto: find(mapping.produto) || 'Geral',
        motivo_perda: find(mapping.motivo) || 'Não informado'
    };
};

// Auxiliar para buscar tudo (usado no upload e chat)
const fetchAllUserOpportunities = async (userId: string) => {
  let allRows: any[] = [];
  let from = 0;
  const step = 2000; // Aumentei o passo para ser mais rápido
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

// --- ROTA DE UPLOAD (MANTIDA IGUAL) ---
app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado.' });

  try {
    const user = await getUser(req);
    const userId = user.id;

    const activeMapping = { ...DEFAULT_MAPPING };
    const csvFileContent = req.file.buffer.toString('utf-8');
    const parsedData = Papa.parse(csvFileContent, { header: true, skipEmptyLines: true }).data;

    const rawRows = parsedData.map((rawRow: any) => {
      const cleanRow = normalizeRow(rawRow, activeMapping);
      const motivo = cleanRow.motivo_perda || '';
      // Hash rigoroso
      const signature = `${userId}-${cleanRow.data_criacao}-${cleanRow.nome_cliente}-${cleanRow.valor}-${cleanRow.produto}-${motivo}-${cleanRow.funil}-${cleanRow.status}`.replace(/\s+/g, '');
      const uniqueHash = crypto.createHash('md5').update(signature).digest('hex');

      return { user_id: userId, unique_hash: uniqueHash, ...cleanRow };
    });

    const uniqueRowsMap = new Map();
    rawRows.forEach((row: any) => { uniqueRowsMap.set(row.unique_hash, row); });
    const rowsToUpsert = Array.from(uniqueRowsMap.values());

    const batchSize = 1000;
    for (let i = 0; i < rowsToUpsert.length; i += batchSize) {
      const batch = rowsToUpsert.slice(i, i + batchSize);
      await supabase.from('oportunidades').upsert(batch, { onConflict: 'user_id, unique_hash', ignoreDuplicates: false });
    }

    const finalData = await fetchAllUserOpportunities(userId);
    res.json({ message: 'Processamento concluído', importedData: finalData });

  } catch (error: any) {
    console.error('Erro upload:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- ROTA ANALYZE (ATUALIZADA COM MOTIVOS) ---
app.post('/api/analyze', async (req, res) => {
  const { provider } = req.body;
  const selectedProvider = provider || 'openai';

  try {
    const user = await getUser(req);
    const userId = user.id;
    const profile = await generateAnalyticalProfile(userId);
    
    if (!profile) return res.status(400).json({ error: 'Sem dados para analisar.' });

    // Busca Motivos de Perda
    const { data: rowsPerdidas } = await supabase
      .from('oportunidades')
      .select('motivo_perda')
      .eq('user_id', userId)
      .eq('status', 'Perdida');

    const motivosPerda: Record<string, number> = {};
    if (rowsPerdidas) {
      rowsPerdidas.forEach((row: any) => {
        const motivo = row.motivo_perda || 'Não informado';
        motivosPerda[motivo] = (motivosPerda[motivo] || 0) + 1;
      });
    }
    const topMotivos = Object.entries(motivosPerda)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7) // Top 7 motivos
      .map(([m, qtd]) => `- ${m}: ${qtd} perdas`);

    const prompt = `
      Você é um **Head de Business Intelligence (BI)**. Analise profundamente os dados abaixo.
      
      --- DADOS GERAIS ---
      - Oportunidades: ${profile.resumo.total_analisado}
      - Receita: R$ ${profile.resumo.receita_total}
      - Conversão Global: ${((profile.resumo.ganhas / profile.resumo.total_analisado) * 100).toFixed(1)}%
      
      --- ESTRUTURA DE FUNIS ---
      ${JSON.stringify(profile.funis, null, 2)}

      --- RANKING VENDEDORES ---
      ${JSON.stringify(profile.vendedores.slice(0, 10), null, 2)}

      --- MOTIVOS DE PERDA (DIAGNÓSTICO CRÍTICO) ---
      ${topMotivos.join('\n')}

      --- CRONOLOGIA ---
      ${JSON.stringify(profile.timeline, null, 2)}

      --- INSTRUÇÕES DO RELATÓRIO ---
      1. **Diagnóstico Executivo:** Qual a saúde real do negócio? A conversão é boa?
      2. **Análise de Perdas:** Por que estamos perdendo? Relacione os motivos de perda com a eficiência do time ou qualidade do produto.
      3. **Gargalos de Funil:** Identifique onde o processo trava.
      4. **Plano de Ação:** 3 ações práticas para reduzir os motivos de perda identificados.
    `;

    const analysis = await generateText(selectedProvider, prompt);
    res.json({ analysis });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- ROTA CHAT (REVOLUCIONADA COM AGREGAÇÃO) ---

const tools = [
  {
    type: "function" as const,
    function: {
      name: "analisar_dados_complexos",
      description: "Use esta ferramenta para responder perguntas sobre vendas, perdas, produtos, e fazer cruzamentos de dados.",
      parameters: {
        type: "object",
        properties: {
          filtros: {
            type: "object",
            description: "Filtros a aplicar nos dados (ex: vendedor='João', status='Perdida', ano=2025)",
            properties: {
              responsavel: { type: "string" },
              funil: { type: "string" },
              status: { type: "string", enum: ["Ganha", "Perdida", "Em aberto"] },
              origem: { type: "string" },
              produto: { type: "string" },
              estado: { type: "string" },
              ano: { type: "integer" },
              mes: { type: "integer" }
            }
          },
          agrupar_por: {
            type: "array",
            description: "Lista de campos para agrupar/cruzar os dados. Ex: ['mes', 'motivo_perda'] para ver evolução de motivos.",
            items: { type: "string", enum: ["mes", "ano", "responsavel", "funil", "origem", "produto", "estado", "motivo_perda", "status"] }
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
      { role: "system", content: "Você é um Analista de Dados Sênior. Você tem acesso a uma ferramenta poderosa que pode agrupar e cruzar dados. Para perguntas como 'Qual motivo de perda mais comum em SP?', agrupe por ['estado', 'motivo_perda']. Para 'Evolução de vendas', agrupe por ['mes']. SEMPRE use a ferramenta se a pergunta envolver dados." },
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
        const toolCall = toolCallItem as any; // <--- CORREÇÃO DO ERRO

        if (toolCall.function.name === "analisar_dados_complexos") {
          const args = JSON.parse(toolCall.function.arguments);
          const { filtros = {}, agrupar_por = [] } = args;

          // 1. Busca TUDO do usuário
          let query = supabase.from('oportunidades').select('*').eq('user_id', userId);
          
          if (filtros.responsavel) query = query.ilike('responsavel', `%${filtros.responsavel}%`);
          if (filtros.produto) query = query.ilike('produto', `%${filtros.produto}%`);
          if (filtros.origem) query = query.ilike('origem_lead', `%${filtros.origem}%`);
          if (filtros.status) query = query.eq('status', filtros.status);
          
          if (filtros.ano) {
             query = query.gte('data_criacao', `${filtros.ano}-01-01`).lte('data_criacao', `${filtros.ano}-12-31`);
          }

          const { data: rows } = await query;
          if (!rows) throw new Error("Erro ao buscar dados.");

          // 2. Processamento em Memória
          const agrupados: Record<string, { qtd: number, valor: number, detalhes: any }> = {};

          rows.forEach((row: any) => {
             if (filtros.mes) {
                 const d = new Date(row.data_criacao);
                 if (d.getMonth() + 1 !== filtros.mes) return;
             }

             const chave = agrupar_por.map((campo: string) => {
                 if (campo === 'mes') {
                     const d = new Date(row.data_criacao);
                     return `${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`;
                 }
                 if (campo === 'ano') return new Date(row.data_criacao).getFullYear();
                 if (campo === 'motivo_perda') return row.motivo_perda || 'Sem motivo';
                 return row[campo] || 'N/A';
             }).join(' | ');

             if (!agrupados[chave]) agrupados[chave] = { qtd: 0, valor: 0, detalhes: {} };
             
             agrupados[chave].qtd++;
             agrupados[chave].valor += Number(row.valor) || 0;
          });

          // 3. Formata para a IA
          const relatorio = Object.entries(agrupados)
             .map(([grupo, dados]) => ({
                 grupo,
                 volume: dados.qtd,
                 receita: dados.valor.toFixed(2)
             }))
             .sort((a, b) => b.volume - a.volume)
             .slice(0, 40);

          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify({
                info: "Dados agrupados e processados.",
                filtros_usados: filtros,
                agrupamento_usado: agrupar_por,
                tabela_resultados: relatorio
            }),
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