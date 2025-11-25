import OpenAI from 'openai';
import type { Opportunity } from '../types/types';


const apiKey = import.meta.env.VITE_OPENAI_API_KEY;

if (!apiKey) {
    throw new Error("A variável de ambiente VITE_OPENAI_API_KEY não está definida.");
}

// Inicializa o cliente da OpenAI

export const ai = new OpenAI({
  apiKey: apiKey,
  dangerouslyAllowBrowser: true,
});

// Interface para o formato de dados que esperamos da IA
interface CleanedOpportunityData {
    responsavel: string;
    status: 'Ganha' | 'Perdida' | 'Em aberto';
    valor: number;
    dataCriacao: string; 
    origemLead: string;
}

export const cleanAndStructureData = async (
    headers: string[], 
    rawData: any[]
): Promise<CleanedOpportunityData[]> => {
    
    const prompt = `
      Você é um agente de processamento de dados especialista em limpar e estruturar dados de planilhas de CRM.
      Sua tarefa é converter os dados brutos a seguir em um array de objetos JSON contido dentro de um objeto JSON principal com a chave "data".

      Cabeçalhos da planilha original:
      ${JSON.stringify(headers)}

      Dados brutos (uma amostra de até 50 linhas):
      ${JSON.stringify(rawData.slice(0, 50), null, 2)}

      Siga estas regras rigorosamente para cada linha dos dados:
      1.  **Mapeamento de Colunas:** Use os cabeçalhos para encontrar as colunas corretas. "Responsável" pode ser "Vendedor", "Situação" pode ser "Status", "Dt.Cad" pode ser "Data de Criação", etc.
      2.  **responsavel**: Extraia o valor da coluna do vendedor/responsável. Se estiver vazio ou não encontrado, use 'N/A'.
      3.  **status**: Normalize o valor da coluna de status. Use "Ganha" para textos como 'conquistado', 'ganha', 'fechado'. Use "Perdida" para 'perdido', 'lost'. Para todos os outros casos, incluindo valores vazios, use "Em aberto".
      4.  **valor**: Converta o valor para um NÚMERO. O valor pode estar em formato brasileiro (ex: "1.997,00" ou "R$ 1.997,00"). Remova símbolos monetários e pontuação de milhar, e troque a vírgula decimal por ponto. Se for inválido ou vazio, use 0.
      5.  **dataCriacao**: Esta é a regra mais importante. A data de entrada provavelmente estará no formato "dd/mm/yyyy". Você DEVE convertê-la para o formato "YYYY-MM-DD". Se a data for inválida, vazia ou não encontrada, retorne a data de hoje no formato "YYYY-MM-DD".
      6.  **origemLead**: Extraia o valor da coluna de origem do lead. Se estiver vazio, use 'N/A'.

      Retorne APENAS um objeto JSON. Este objeto deve ter uma única chave chamada "data", que contém o array de objetos JSON processados.
    `;

    let jsonText: string | null = null; 

    try {
        const response = await ai.chat.completions.create({
            model: "gpt-3.5-turbo-1106",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
            max_tokens: 4096, 
        });

        jsonText = response.choices[0].message.content; 
        if (!jsonText) {
            throw new Error("A resposta da IA está vazia.");
        }
        
        const result = JSON.parse(jsonText);
        
        const cleanedData = result.data;

        if (!Array.isArray(cleanedData)) {
            throw new Error("A IA não retornou um array de dados válido.");
        }
        
        return cleanedData;

    } catch (error) {
        console.error("Erro ao limpar dados com a API da OpenAI:", error);
        
        console.log("Resposta recebida da IA que causou o erro:", jsonText);
        throw new Error("Falha da IA ao limpar e estruturar os dados da planilha.");
    }
};


export const createInitialAnalysisPrompt = (data: Opportunity[]): string => {
    const dataSample = data.slice(0, 100).map(d => ({
        ...d,
        dataCriacao: d.dataCriacao.toISOString().split('T')[0] 
    }));

    return `
      Você é um analista de negócios sênior especializado em CRM e performance de vendas.
      Analise os seguintes dados de um CRM, que estão em formato JSON.

      Dados de Amostra:
      ${JSON.stringify(dataSample, null, 2)}

      Com base nos dados fornecidos, realize uma análise completa e detalhada, estruturando sua resposta nos seguintes tópicos, usando Markdown para formatação:

      # Análise de Performance de Vendas

      ## Resumo Executivo
      Forneça uma visão geral do desempenho do negócio no período coberto pelos dados.

      ## Principais Métricas
      Calcule e apresente as seguintes métricas em uma lista:
      - **Número total de oportunidades criadas:**
      - **Total de oportunidades ganhas e o valor total conquistado:**
      - **Total de oportunidades perdidas:**
      - **Ticket Médio:** (Valor total conquistado / Número de oportunidades ganhas).
      - **Taxa de Conversão Geral:** (Oportunidades ganhas / (Oportunidades ganhas + Oportunidades perdidas)).
      - **Número de oportunidades ainda em aberto:**

      ## Análise de Vendedores (Responsáveis)
      - Identifique os vendedores com melhor desempenho (maior número de vendas ou maior taxa de conversão).

      ## Análise de Origem de Leads
      - Quais são as fontes de leads mais eficazes (que geram mais oportunidades ganhas)?

      ## Insights e Recomendações Estratégicas
      - Forneça 3 insights práticos e acionáveis para otimizar o processo de vendas.

      Seja claro e objetivo. No final da sua análise, convide o usuário a fazer mais perguntas sobre os dados.
    `;
};