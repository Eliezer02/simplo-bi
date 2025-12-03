export interface Opportunity {
  responsavel: string;
  status: 'Ganha' | 'Perdida' | 'Em aberto';
  valor: number;
  dataCriacao: Date;
  dataConclusao?: Date | null; 
  origemLead: string;
  funil: string; 
  estado: string;
  cidade: string;
  produto: string;
  motivoPerda?: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}