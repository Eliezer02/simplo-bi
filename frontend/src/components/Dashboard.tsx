import React, { useMemo } from 'react';
import type { Opportunity } from '../types/types.ts';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, ComposedChart, Line, Bar, Legend, BarChart
} from 'recharts';
import { Target, CheckCircle2, DollarSign, BadgePercent, TrendingUp, Filter, BarChart2, PieChart as PieChartIcon, LineChart as LineChartIcon, Users, XCircle } from 'lucide-react';
import { Card, Row, Col, Form, Table, ProgressBar } from 'react-bootstrap';

interface DashboardProps {
  data: Opportunity[];
}


const STATUS_COLORS = { 'Ganha': '#10b981', 'Perdida': '#ef4444', 'Em aberto': '#3b82f6' };

// Ajuste no Label: Se a fatia for muito pequena (< 5%), não mostramos o texto para não encavalar
const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
  if (percent < 0.05) return null; // Oculta labels de fatias menores que 5%

  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * Math.PI / 180);
  const y = cy + radius * Math.sin(-midAngle * Math.PI / 180);

  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight="bold">
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

const Dashboard: React.FC<DashboardProps> = ({ data }) => {
  const [selectedResponsavel, setSelectedResponsavel] = React.useState<string>('todos');
  const [selectedFunil, setSelectedFunil] = React.useState<string>('todos');
  
  const responsaveis = useMemo(() => ['todos', ...Array.from(new Set(data.map(d => d.responsavel))).filter(Boolean)], [data]);
  const funis = useMemo(() => ['todos', ...Array.from(new Set(data.map(d => d.funil))).filter(Boolean)], [data]);

  const filteredData = useMemo(() => {
    return data.filter(d => {
      const matchResp = selectedResponsavel === 'todos' || d.responsavel === selectedResponsavel;
      const matchFunil = selectedFunil === 'todos' || d.funil === selectedFunil;
      return matchResp && matchFunil;
    });
  }, [data, selectedResponsavel, selectedFunil]);

  const kpiData = useMemo(() => {
    const ganhas = filteredData.filter(d => d.status === 'Ganha');
    const valorGanho = ganhas.reduce((sum, d) => sum + d.valor, 0);
    return {
      totalOportunidades: filteredData.length,
      totalGanhas: ganhas.length,
      valorGanho,
      ticketMedio: ganhas.length > 0 ? valorGanho / ganhas.length : 0,
      taxaConversao: filteredData.length > 0 ? (ganhas.length / filteredData.length) * 100 : 0,
    };
  }, [filteredData]);

  const timelineData = useMemo(() => {
    const dataMap: Record<string, { date: Date; criadas: number; ganhas: number }> = {};
    filteredData.forEach(op => {
        const dCriacao = new Date(op.dataCriacao);
        const kCriacao = `${dCriacao.getFullYear()}-${dCriacao.getMonth()}`;
        if(!dataMap[kCriacao]) dataMap[kCriacao] = { date: new Date(dCriacao.getFullYear(), dCriacao.getMonth(), 1), criadas: 0, ganhas: 0 };
        dataMap[kCriacao].criadas++;

        if(op.status === 'Ganha') {
            const dConclusao = op.dataConclusao ? new Date(op.dataConclusao) : dCriacao;
            const kConclusao = `${dConclusao.getFullYear()}-${dConclusao.getMonth()}`;
            if(!dataMap[kConclusao]) dataMap[kConclusao] = { date: new Date(dConclusao.getFullYear(), dConclusao.getMonth(), 1), criadas: 0, ganhas: 0 };
            dataMap[kConclusao].ganhas++;
        }
    });
    return Object.values(dataMap)
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map(d => ({ 
        name: d.date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }), 
        "Criadas": d.criadas, 
        "Vendas": d.ganhas,
        "Conversao": d.criadas > 0 ? Number(((d.ganhas / d.criadas) * 100).toFixed(1)) : 0 
      }));
  }, [filteredData]);

  const financialData = useMemo(() => {
    const dataMap: Record<string, { date: Date; valor: number }> = {};
    filteredData.forEach(op => {
        if(op.status !== 'Ganha') return;
        const date = op.dataConclusao ? new Date(op.dataConclusao) : new Date(op.dataCriacao);
        const key = `${date.getFullYear()}-${date.getMonth()}`;
        if(!dataMap[key]) dataMap[key] = { date: new Date(date.getFullYear(), date.getMonth(), 1), valor: 0 };
        dataMap[key].valor += op.valor;
    });
    return Object.values(dataMap).sort((a, b) => a.date.getTime() - b.date.getTime())
      .map(d => ({ name: d.date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }), Receita: d.valor }));
  }, [filteredData]);

  const sourcePerformance = useMemo(() => {
      const stats: Record<string, { total: number, ganhas: number, perdidas: number, receita: number }> = {};
      
      filteredData.forEach(d => {
          const origem = d.origemLead || 'N/A';
          if (!stats[origem]) stats[origem] = { total: 0, ganhas: 0, perdidas: 0, receita: 0 };
          
          stats[origem].total++;
          if (d.status === 'Ganha') {
              stats[origem].ganhas++;
              stats[origem].receita += d.valor;
          } else if (d.status === 'Perdida') {
              stats[origem].perdidas++;
          }
      });

      return Object.entries(stats)
        .map(([origem, s]) => ({
            origem,
            total: s.total,
            ganhas: s.ganhas,
            perdidas: s.perdidas,
            receita: s.receita,
            conversao: s.total > 0 ? (s.ganhas / s.total) * 100 : 0,
            perda: s.total > 0 ? (s.perdidas / s.total) * 100 : 0
        }))
        .sort((a, b) => b.receita - a.receita);
  }, [filteredData]);

  const statusData = useMemo(() => {
    const statuses = filteredData.reduce((acc, curr) => { acc[curr.status] = (acc[curr.status] || 0) + 1; return acc; }, {} as Record<string, number>);
    return Object.entries(statuses).map(([name, value]) => ({ name, value }));
  }, [filteredData]);

  // --- CORREÇÃO IMPORTANTE: LÓGICA DE MOTIVOS DE PERDA ---
  const lossReasonData = useMemo(() => {
     const reasons: Record<string, number> = {};
     filteredData.forEach(d => {
         if (d.status === 'Perdida') {
             // Normalização agressiva: Verifica nulos, undefined e strings vazias ou só com espaços
             let motivo = d.motivoPerda;
             
             if (!motivo || typeof motivo !== 'string' || motivo.trim() === '' || motivo === 'N/A') {
                 motivo = '⚠️ Não Preenchido'; // Label clara para o analista
             } else {
                 motivo = motivo.trim(); // Remove espaços extras
             }

             reasons[motivo] = (reasons[motivo] || 0) + 1;
         }
     });

     return Object.entries(reasons)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8); // Aumentei para Top 8
  }, [filteredData]);

  return (
    <div className="d-grid gap-4 fade-in">
      {/* FILTROS */}
      <Card className="shadow-sm border-0">
        <Card.Body>
          <Row className="g-3 align-items-end">
            <Col md={6}>
                <Form.Group>
                    <Form.Label className="d-flex align-items-center gap-2 text-muted fw-semibold small"><Filter size={14} /> Funil</Form.Label>
                    <Form.Select size="sm" value={selectedFunil} onChange={(e) => setSelectedFunil(e.target.value)}>
                        {funis.map(f => <option key={f} value={f}>{f === 'todos' ? 'Todos os Funis' : f}</option>)}
                    </Form.Select>
                </Form.Group>
            </Col>
            <Col md={6}>
                <Form.Group>
                    <Form.Label className="d-flex align-items-center gap-2 text-muted fw-semibold small"><Users size={14} /> Responsável</Form.Label>
                    <Form.Select size="sm" value={selectedResponsavel} onChange={(e) => setSelectedResponsavel(e.target.value)}>
                        {responsaveis.map(r => <option key={r} value={r}>{r === 'todos' ? 'Todos os Responsáveis' : r}</option>)}
                    </Form.Select>
                </Form.Group>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      {/* KPIS */}
      <Row xs={2} md={3} lg={5} className="g-3">
        <Col><KpiCard icon={Target} title="Oportunidades" value={kpiData.totalOportunidades.toLocaleString()} color="text-primary" /></Col>
        <Col><KpiCard icon={CheckCircle2} title="Vendas" value={kpiData.totalGanhas.toLocaleString()} color="text-success" /></Col>
        <Col><KpiCard icon={DollarSign} title="Receita" value={kpiData.valorGanho.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })} color="text-success" /></Col>
        <Col><KpiCard icon={TrendingUp} title="Ticket Médio" value={kpiData.ticketMedio.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })} color="text-warning" /></Col>
        <Col><KpiCard icon={BadgePercent} title="Conversão" value={`${kpiData.taxaConversao.toFixed(1)}%`} color="text-info" /></Col>
      </Row>

      <Row className="g-4">
        <Col lg={8}><ChartContainer icon={LineChartIcon} title="Volume & Taxa de Conversão">
            <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={timelineData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" style={{fontSize:12}} />
                    <YAxis yAxisId="left" style={{fontSize:12}} />
                    <YAxis yAxisId="right" orientation="right" unit="%" style={{fontSize:12}} />
                    <Tooltip />
                    <Legend />
                    <Area yAxisId="left" type="monotone" dataKey="Criadas" fill="#eff6ff" stroke="#3b82f6" name="Oportunidades" />
                    <Bar yAxisId="left" dataKey="Vendas" fill="#10b981" name="Vendas Realizadas" barSize={20} />
                    <Line yAxisId="right" type="monotone" dataKey="Conversao" stroke="#f59e0b" strokeWidth={2} name="Taxa Conv. (%)" />
                </ComposedChart>
            </ResponsiveContainer>
        </ChartContainer></Col>

        {/* PIE CHART CORRIGIDO: Raio reduzido para evitar corte dos labels */}
        <Col lg={4}><ChartContainer icon={PieChartIcon} title="Status Geral (%)">
            <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                    <Pie 
                        data={statusData} 
                        dataKey="value" 
                        nameKey="name" 
                        cx="50%" 
                        cy="50%" 
                        labelLine={false}
                        label={renderCustomizedLabel} 
                        innerRadius={50} // Reduzido de 60 para 50
                        outerRadius={70} // Reduzido de 80 para 70 (Evita corte nas bordas)
                        paddingAngle={5}
                    >
                        {statusData.map((entry) => <Cell key={entry.name} fill={STATUS_COLORS[entry.name as keyof typeof STATUS_COLORS] || '#ccc'} />)}
                    </Pie>
                    <Tooltip />
                    <Legend verticalAlign="bottom" height={36}/>
                </PieChart>
            </ResponsiveContainer>
        </ChartContainer></Col>
      </Row>

      <Row className="g-4">
        <Col lg={12}>
            <Card className="shadow-lg border-0">
                <Card.Header className="bg-white border-0 pt-4 px-4">
                    <h5 className="fw-bold d-flex align-items-center gap-2">
                        <BarChart2 className="text-primary" size={20} /> Matriz de Eficiência por Origem
                    </h5>
                </Card.Header>
                <Card.Body className="p-0">
                    <Table responsive hover className="align-middle mb-0">
                        <thead className="bg-light text-muted small text-uppercase">
                            <tr>
                                <th className="ps-4">Origem / Canal</th>
                                <th className="text-center">Vol. Total</th>
                                <th className="text-center" style={{width: '20%'}}>Conversão (Vendas)</th>
                                <th className="text-center" style={{width: '20%'}}>Perda (Churn)</th>
                                <th className="text-end pe-4">Receita Gerada</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sourcePerformance.map((item) => (
                                <tr key={item.origem}>
                                    <td className="ps-4 fw-bold text-dark">{item.origem}</td>
                                    <td className="text-center fw-semibold">{item.total}</td>
                                    <td className="text-center">
                                        <div className="d-flex align-items-center justify-content-center gap-2">
                                            <span className="small fw-bold text-success">{item.conversao.toFixed(1)}%</span>
                                            <ProgressBar now={item.conversao} variant="success" style={{width: '60px', height: '6px'}} />
                                            <span className="small text-muted">({item.ganhas})</span>
                                        </div>
                                    </td>
                                    <td className="text-center">
                                        <div className="d-flex align-items-center justify-content-center gap-2">
                                            <span className="small fw-bold text-danger">{item.perda.toFixed(1)}%</span>
                                            <ProgressBar now={item.perda} variant="danger" style={{width: '60px', height: '6px'}} />
                                            <span className="small text-muted">({item.perdidas})</span>
                                        </div>
                                    </td>
                                    <td className="text-end pe-4 fw-bold text-dark">
                                        {item.receita.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </Table>
                </Card.Body>
            </Card>
        </Col>
      </Row>
      
      <Row className="g-4">
         <Col lg={6}><ChartContainer icon={DollarSign} title="Evolução de Receita">
             <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={financialData}>
                    <defs><linearGradient id="colorRec" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" style={{fontSize:11}}/>
                    <YAxis style={{fontSize:11}} tickFormatter={(v)=>`R$${v/1000}k`}/>
                    <Tooltip formatter={(v:number)=>v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}/>
                    <Area type="monotone" dataKey="Receita" stroke="#10b981" fill="url(#colorRec)" />
                </AreaChart>
             </ResponsiveContainer>
         </ChartContainer></Col>
         
         <Col lg={6}><ChartContainer icon={XCircle} title="Principais Motivos de Perda">
             <ResponsiveContainer width="100%" height={300}>
                {lossReasonData.length > 0 ? (
                    <BarChart layout="vertical" data={lossReasonData} margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" hide />
                        <YAxis 
                            dataKey="name" 
                            type="category" 
                            width={120} 
                            style={{fontSize:11, fontWeight: 500}} 
                            tickFormatter={(val) => val.length > 15 ? `${val.substring(0, 15)}...` : val}
                        />
                        <Tooltip cursor={{fill: 'transparent'}} />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20} name="Qtd. Perdida">
                           {
                             // Pintar de cinza se for "Não Preenchido", senão vermelho
                             lossReasonData.map((entry, index) => (
                               <Cell key={`cell-${index}`} fill={entry.name === '⚠️ Não Preenchido' ? '#94a3b8' : '#ef4444'} />
                             ))
                           }
                        </Bar>
                    </BarChart>
                ) : (
                    <div className="d-flex align-items-center justify-content-center h-100 text-muted">
                        Nenhuma perda registrada ou motivos não preenchidos.
                    </div>
                )}
             </ResponsiveContainer>
         </ChartContainer></Col>
      </Row>
    </div>
  );
};

const KpiCard: React.FC<{ title: string; value: string; icon: React.ElementType, color: string }> = ({ title, value, icon: Icon, color }) => (
  <Card className="shadow-sm h-100 border-0">
    <Card.Body className="d-flex align-items-center gap-3 p-3">
      <div className={`p-2 rounded-circle bg-light ${color}`}><Icon size={20} /></div>
      <div><h6 className="text-muted mb-0 small fw-bold text-uppercase">{title}</h6><h5 className="fw-bold mb-0">{value}</h5></div>
    </Card.Body>
  </Card>
);

const ChartContainer: React.FC<{ title: string; children: React.ReactNode; icon: React.ElementType; }> = ({ title, children, icon: Icon }) => (
  <Card className="shadow-lg h-100 border-0">
    <Card.Header className="d-flex align-items-center gap-2 bg-white border-0 pt-3 px-4"><Icon className="text-muted" size={18} /><h6 className="fw-bold mb-0 text-dark">{title}</h6></Card.Header>
    <Card.Body className="px-4 pb-3">{children}</Card.Body>
  </Card>
);

export default Dashboard;