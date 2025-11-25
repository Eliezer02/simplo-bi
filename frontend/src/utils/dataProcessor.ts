import * as XLSX from 'xlsx';
import type { Opportunity } from '../types/types';

interface RawDataExtraction {
  headers: string[];
  rawData: any[];
}

export const extractRawDataFromFile = (file: File): Promise<RawDataExtraction> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
          return reject(new Error("A planilha parece estar vazia. Nenhuma aba encontrada."));
        }
        
        const worksheet = workbook.Sheets[sheetName];
        const rawData: any[] = XLSX.utils.sheet_to_json(worksheet, { raw: false, defval: null });

        if (rawData.length === 0) {
          return reject(new Error("Nenhum dado encontrado na planilha. Verifique se o arquivo não está vazio."));
        }

        const headers = Object.keys(rawData[0]);
        
        resolve({ headers, rawData });
      } catch (e) {
        console.error("Erro no processamento do XLSX:", e);
        reject(new Error("Falha ao ler o arquivo. Pode estar corrompido ou em um formato inesperado."));
      }
    };
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsArrayBuffer(file);
  });
};


interface CleanedOpportunityData {
    responsavel: string;
    status: 'Ganha' | 'Perdida' | 'Em aberto';
    valor: number;
    dataCriacao: string;
    origemLead: string;
  
    funil?: string;
    estado?: string;
    cidade?: string;
    produto?: string;
}

export const parseCleanedData = (cleanedData: CleanedOpportunityData[]): Opportunity[] => {
    try {
        return cleanedData.map((item, index) => {
            const dataCriacao = new Date(item.dataCriacao + 'T00:00:00');
            
            
            const validDate = isNaN(dataCriacao.getTime()) ? new Date() : dataCriacao;

            if (isNaN(dataCriacao.getTime())) {
                console.warn(`Data inválida recebida na linha ${index + 1}: "${item.dataCriacao}". Usando data atual.`);
            }

            
            return {
                responsavel: item.responsavel || 'N/A',
                status: item.status,
                valor: Number(item.valor) || 0,
                dataCriacao: validDate,
                dataConclusao: null, 
                origemLead: item.origemLead || 'N/A',
                
                
                funil: item.funil || 'Geral',
                estado: item.estado || 'NA',
                cidade: item.cidade || 'N/A',
                produto: item.produto || 'Geral'
            };
        });
    } catch(error) {
        console.error("Erro ao fazer o parse dos dados:", error);
        throw new Error("Os dados estão em um formato inesperado.");
    }
};