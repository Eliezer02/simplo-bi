import React, { useMemo, useState } from 'react';
import type { Opportunity } from '../types/types.ts';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    ScatterChart, Scatter, ZAxis, Cell
} from 'recharts';
import {
    Building2, Users, Trophy, AlertTriangle, TrendingUp,
    ArrowUpDown, ChevronUp, ChevronDown, DollarSign, Repeat, ShieldAlert
} from 'lucide-react';
import { Card, Row, Col, Form, Table, Badge } from 'react-bootstrap';

interface ClientDashboardProps {
    data: Opportunity[];
}

interface ClientStats {
    nome: string;
    total: number;
    ganhas: number;
    perdidas: number;
    aberto: number;
    receita: number;
    ticketMedio: number;
    conversao: number;
    recorrencia: number;
}

type SortKey = keyof Pick<ClientStats, 'nome' | 'total' | 'ganhas' | 'perdidas' | 'receita' | 'ticketMedio' | 'conversao'>;
type ViewMode = 'melhores' | 'piores' | 'todos';

const COLORS_GRADIENT = [
    '#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#d1fae5',
    '#fef3c7', '#fde68a', '#fcd34d', '#fbbf24', '#f59e0b'
];

const SCATTER_COLORS = {
    high: '#10b981',
    medium: '#f59e0b',
    low: '#ef4444',
};

const ClientDashboard: React.FC<ClientDashboardProps> = ({ data }) => {
    const [viewMode, setViewMode] = useState<ViewMode>('melhores');
    const [selectedFunil, setSelectedFunil] = useState<string>('todos');
    const [periodoInicio, setPeriodoInicio] = useState<string>('');
    const [periodoFim, setPeriodoFim] = useState<string>('');
    const [sortKey, setSortKey] = useState<SortKey>('receita');
    const [sortAsc, setSortAsc] = useState<boolean>(false);

    const funis = useMemo(() =>
        ['todos', ...Array.from(new Set(data.map(d => d.funil))).filter(Boolean)],
        [data]
    );

    const filteredData = useMemo(() => {
        return data.filter(d => {
            const matchFunil = selectedFunil === 'todos' || d.funil === selectedFunil;
            let matchPeriodo = true;
            if (periodoInicio) {
                const inicio = new Date(periodoInicio + '-01');
                matchPeriodo = matchPeriodo && new Date(d.dataCriacao) >= inicio;
            }
            if (periodoFim) {
                const fim = new Date(periodoFim + '-01');
                fim.setMonth(fim.getMonth() + 1);
                matchPeriodo = matchPeriodo && new Date(d.dataCriacao) < fim;
            }
            return matchFunil && matchPeriodo;
        });
    }, [data, selectedFunil, periodoInicio, periodoFim]);

    const clientStats = useMemo((): ClientStats[] => {
        const map: Record<string, { total: number; ganhas: number; perdidas: number; aberto: number; receita: number }> = {};
        filteredData.forEach(d => {
            const nome = d.cliente || 'Anônimo';
            if (!map[nome]) map[nome] = { total: 0, ganhas: 0, perdidas: 0, aberto: 0, receita: 0 };
            map[nome].total++;
            if (d.status === 'Ganha') { map[nome].ganhas++; map[nome].receita += d.valor; }
            else if (d.status === 'Perdida') { map[nome].perdidas++; }
            else { map[nome].aberto++; }
        });
        return Object.entries(map).map(([nome, s]) => ({
            nome, total: s.total, ganhas: s.ganhas, perdidas: s.perdidas, aberto: s.aberto,
            receita: s.receita, ticketMedio: s.ganhas > 0 ? s.receita / s.ganhas : 0,
            conversao: s.total > 0 ? (s.ganhas / s.total) * 100 : 0, recorrencia: s.total,
        }));
    }, [filteredData]);

    const displayClients = useMemo(() => {
        let result = [...clientStats];
        if (viewMode === 'melhores') {
            result.sort((a, b) => b.receita - a.receita);
        } else if (viewMode === 'piores') {
            result = result.filter(c => c.total >= 2);
            result.sort((a, b) => a.conversao - b.conversao || b.perdidas - a.perdidas);
        } else {
            result.sort((a, b) => {
                const valA = a[sortKey]; const valB = b[sortKey];
                if (typeof valA === 'string' && typeof valB === 'string') return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
                return sortAsc ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
            });
        }
        return result;
    }, [clientStats, viewMode, sortKey, sortAsc]);

    const kpis = useMemo(() => {
        const uniqueClients = clientStats.length;
        const recorrentes = clientStats.filter(c => c.total > 1).length;
        const receitaTotal = clientStats.reduce((s, c) => s + c.receita, 0);
        const top3Receita = [...clientStats].sort((a, b) => b.receita - a.receita).slice(0, 3).reduce((s, c) => s + c.receita, 0);
        const concentracao = receitaTotal > 0 ? (top3Receita / receitaTotal) * 100 : 0;
        const totalGanhas = clientStats.reduce((s, c) => s + c.ganhas, 0);
        const ticketMedioGlobal = totalGanhas > 0 ? receitaTotal / totalGanhas : 0;
        return { uniqueClients, recorrentes, concentracao, ticketMedioGlobal, receitaTotal };
    }, [clientStats]);

    const topReceitaChart = useMemo(() =>
        [...clientStats].sort((a, b) => b.receita - a.receita).slice(0, 10).map(c => ({
            nome: c.nome.length > 20 ? c.nome.substring(0, 20) + '...' : c.nome,
            nomeCompleto: c.nome, receita: Math.round(c.receita), ganhas: c.ganhas,
        })),
        [clientStats]);

    const topConversaoChart = useMemo(() =>
        [...clientStats].filter(c => c.total >= 3).sort((a, b) => b.conversao - a.conversao).slice(0, 10).map(c => ({
            nome: c.nome.length > 20 ? c.nome.substring(0, 20) + '...' : c.nome,
            nomeCompleto: c.nome, conversao: Number(c.conversao.toFixed(1)), total: c.total,
        })),
        [clientStats]);

    const scatterData = useMemo(() =>
        clientStats.filter(c => c.ganhas > 0).map(c => ({
            nome: c.nome, volume: c.total, ticketMedio: Math.round(c.ticketMedio),
            receita: c.receita, conversao: c.conversao,
        })),
        [clientStats]);

    const handleSort = (key: SortKey) => {
        if (sortKey === key) setSortAsc(!sortAsc);
        else { setSortKey(key); setSortAsc(false); }
        setViewMode('todos');
    };

    const SortIcon: React.FC<{ col: SortKey }> = ({ col }) => {
        if (sortKey !== col || viewMode !== 'todos') return <ArrowUpDown size={12} className="text-muted ms-1" />;
        return sortAsc ? <ChevronUp size={12} className="text-primary ms-1" /> : <ChevronDown size={12} className="text-primary ms-1" />;
    };

    const CustomTooltipScatter = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const d = payload[0].payload;
            return (
                <div className="bg-white p-3 rounded shadow border small">
                    <p className="fw-bold mb-1">{d.nome}</p>
                    <p className="mb-0">Oportunidades: <strong>{d.volume}</strong></p>
                    <p className="mb-0">Ticket Médio: <strong>{d.ticketMedio.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></p>
                    <p className="mb-0">Receita: <strong>{d.receita.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></p>
                    <p className="mb-0">Conversão: <strong>{d.conversao.toFixed(1)}%</strong></p>
                </div>
            );
        }
        return null;
    };

    const getScatterColor = (conversao: number) => {
        if (conversao >= 50) return SCATTER_COLORS.high;
        if (conversao >= 20) return SCATTER_COLORS.medium;
        return SCATTER_COLORS.low;
    };

    const formatCurrency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

    return (
        <div className="d-grid gap-4 fade-in">
            {/* FILTROS */}
            <Card className="shadow-sm border-0">
                <Card.Body>
                    <Row className="g-3 align-items-end">
                        <Col md={3}>
                            <Form.Group>
                                <Form.Label className="d-flex align-items-center gap-2 text-muted fw-semibold small">
                                    <Building2 size={14} /> Visualização
                                </Form.Label>
                                <Form.Select size="sm" value={viewMode} onChange={(e) => setViewMode(e.target.value as ViewMode)}>
                                    <option value="melhores">🏆 Melhores Clientes</option>
                                    <option value="piores">⚠️ Piores Clientes</option>
                                    <option value="todos">📋 Todos os Clientes</option>
                                </Form.Select>
                            </Form.Group>
                        </Col>
                        <Col md={3}>
                            <Form.Group>
                                <Form.Label className="text-muted fw-semibold small">Funil</Form.Label>
                                <Form.Select size="sm" value={selectedFunil} onChange={(e) => setSelectedFunil(e.target.value)}>
                                    {funis.map(f => <option key={f} value={f}>{f === 'todos' ? 'Todos os Funis' : f}</option>)}
                                </Form.Select>
                            </Form.Group>
                        </Col>
                        <Col md={3}>
                            <Form.Group>
                                <Form.Label className="text-muted fw-semibold small">Período Início</Form.Label>
                                <Form.Control type="month" size="sm" value={periodoInicio} onChange={(e) => setPeriodoInicio(e.target.value)} />
                            </Form.Group>
                        </Col>
                        <Col md={3}>
                            <Form.Group>
                                <Form.Label className="text-muted fw-semibold small">Período Fim</Form.Label>
                                <Form.Control type="month" size="sm" value={periodoFim} onChange={(e) => setPeriodoFim(e.target.value)} />
                            </Form.Group>
                        </Col>
                    </Row>
                </Card.Body>
            </Card>

            {/* KPIs */}
            <Row xs={2} md={3} lg={5} className="g-3">
                <Col>
                    <Card className="shadow-sm h-100 border-0">
                        <Card.Body className="d-flex align-items-center gap-3 p-3">
                            <div className="p-2 rounded-circle bg-light text-primary"><Users size={20} /></div>
                            <div><h6 className="text-muted mb-0 small fw-bold text-uppercase">Clientes Únicos</h6><h5 className="fw-bold mb-0">{kpis.uniqueClients}</h5></div>
                        </Card.Body>
                    </Card>
                </Col>
                <Col>
                    <Card className="shadow-sm h-100 border-0">
                        <Card.Body className="d-flex align-items-center gap-3 p-3">
                            <div className="p-2 rounded-circle bg-light text-success"><Repeat size={20} /></div>
                            <div><h6 className="text-muted mb-0 small fw-bold text-uppercase">Recorrentes</h6><h5 className="fw-bold mb-0">{kpis.recorrentes}</h5></div>
                        </Card.Body>
                    </Card>
                </Col>
                <Col>
                    <Card className="shadow-sm h-100 border-0">
                        <Card.Body className="d-flex align-items-center gap-3 p-3">
                            <div className={`p-2 rounded-circle bg-light ${kpis.concentracao > 60 ? 'text-danger' : 'text-warning'}`}><ShieldAlert size={20} /></div>
                            <div>
                                <h6 className="text-muted mb-0 small fw-bold text-uppercase">Concentração Top 3</h6>
                                <h5 className="fw-bold mb-0">{kpis.concentracao.toFixed(1)}%</h5>
                            </div>
                        </Card.Body>
                    </Card>
                </Col>
                <Col>
                    <Card className="shadow-sm h-100 border-0">
                        <Card.Body className="d-flex align-items-center gap-3 p-3">
                            <div className="p-2 rounded-circle bg-light text-warning"><DollarSign size={20} /></div>
                            <div>
                                <h6 className="text-muted mb-0 small fw-bold text-uppercase">Ticket Médio</h6>
                                <h5 className="fw-bold mb-0">{formatCurrency(kpis.ticketMedioGlobal)}</h5>
                            </div>
                        </Card.Body>
                    </Card>
                </Col>
                <Col>
                    <Card className="shadow-sm h-100 border-0">
                        <Card.Body className="d-flex align-items-center gap-3 p-3">
                            <div className="p-2 rounded-circle bg-light text-success"><TrendingUp size={20} /></div>
                            <div>
                                <h6 className="text-muted mb-0 small fw-bold text-uppercase">Receita Total</h6>
                                <h5 className="fw-bold mb-0">{formatCurrency(kpis.receitaTotal)}</h5>
                            </div>
                        </Card.Body>
                    </Card>
                </Col>
            </Row>

            {/* GRÁFICOS */}
            <Row className="g-4">
                <Col lg={6}>
                    <Card className="shadow-lg h-100 border-0">
                        <Card.Header className="d-flex align-items-center gap-2 bg-white border-0 pt-3 px-4">
                            <Trophy className="text-warning" size={18} />
                            <h6 className="fw-bold mb-0 text-dark">Top 10 Clientes por Receita</h6>
                        </Card.Header>
                        <Card.Body className="px-4 pb-3">
                            <ResponsiveContainer width="100%" height={350}>
                                {topReceitaChart.length > 0 ? (
                                    <BarChart layout="vertical" data={topReceitaChart} margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                        <XAxis type="number" hide />
                                        <YAxis dataKey="nome" type="category" width={150} style={{ fontSize: 11, fontWeight: 500 }}
                                            tickFormatter={(val: string) => val.length > 18 ? val.substring(0, 18) + '...' : val} />
                                        <Tooltip formatter={(v: number) => formatCurrency(v)}
                                            labelFormatter={(label: string) => { const item = topReceitaChart.find(c => c.nome === label); return item ? item.nomeCompleto : label; }} />
                                        <Bar dataKey="receita" radius={[0, 6, 6, 0]} barSize={24} name="Receita">
                                            {topReceitaChart.map((_entry, index) => (
                                                <Cell key={`r-${index}`} fill={COLORS_GRADIENT[index] || '#10b981'} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                ) : (
                                    <div className="d-flex align-items-center justify-content-center h-100 text-muted">Sem dados de receita por cliente.</div>
                                )}
                            </ResponsiveContainer>
                        </Card.Body>
                    </Card>
                </Col>

                <Col lg={6}>
                    <Card className="shadow-lg h-100 border-0">
                        <Card.Header className="d-flex align-items-center gap-2 bg-white border-0 pt-3 px-4">
                            <TrendingUp className="text-success" size={18} />
                            <h6 className="fw-bold mb-0 text-dark">Top 10 Clientes por Conversão (min. 3 opps)</h6>
                        </Card.Header>
                        <Card.Body className="px-4 pb-3">
                            <ResponsiveContainer width="100%" height={350}>
                                {topConversaoChart.length > 0 ? (
                                    <BarChart layout="vertical" data={topConversaoChart} margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                        <XAxis type="number" unit="%" domain={[0, 100]} />
                                        <YAxis dataKey="nome" type="category" width={150} style={{ fontSize: 11, fontWeight: 500 }}
                                            tickFormatter={(val: string) => val.length > 18 ? val.substring(0, 18) + '...' : val} />
                                        <Tooltip formatter={(v: number) => v + '%'}
                                            labelFormatter={(label: string) => { const item = topConversaoChart.find(c => c.nome === label); return item ? item.nomeCompleto : label; }} />
                                        <Bar dataKey="conversao" radius={[0, 6, 6, 0]} barSize={24} name="Conversão %" fill="#3b82f6" />
                                    </BarChart>
                                ) : (
                                    <div className="d-flex align-items-center justify-content-center h-100 text-muted">Clientes com menos de 3 oportunidades.</div>
                                )}
                            </ResponsiveContainer>
                        </Card.Body>
                    </Card>
                </Col>
            </Row>

            {/* SCATTER CHART */}
            <Card className="shadow-lg border-0">
                <Card.Header className="d-flex align-items-center gap-2 bg-white border-0 pt-3 px-4">
                    <Building2 className="text-primary" size={18} />
                    <h6 className="fw-bold mb-0 text-dark">Mapa de Clientes: Volume x Ticket Médio</h6>
                    <span className="ms-auto small text-muted">
                        <span style={{ color: SCATTER_COLORS.high }}>●</span> Conv. ≥50%{' '}
                        <span style={{ color: SCATTER_COLORS.medium }}>●</span> 20-50%{' '}
                        <span style={{ color: SCATTER_COLORS.low }}>●</span> &lt;20%
                    </span>
                </Card.Header>
                <Card.Body className="px-4 pb-3">
                    <ResponsiveContainer width="100%" height={400}>
                        {scatterData.length > 0 ? (
                            <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="volume" type="number" name="Oportunidades"
                                    label={{ value: 'Nº de Oportunidades', position: 'insideBottom', offset: -10, style: { fontSize: 12 } }} />
                                <YAxis dataKey="ticketMedio" type="number" name="Ticket Médio"
                                    tickFormatter={(v: number) => 'R$' + (v / 1000).toFixed(0) + 'k'}
                                    label={{ value: 'Ticket Médio (R$)', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }} />
                                <ZAxis dataKey="receita" range={[60, 400]} name="Receita" />
                                <Tooltip content={<CustomTooltipScatter />} />
                                <Scatter name="Clientes" data={scatterData}>
                                    {scatterData.map((entry, index) => (
                                        <Cell key={`s-${index}`} fill={getScatterColor(entry.conversao)} fillOpacity={0.8} stroke={getScatterColor(entry.conversao)} strokeWidth={1} />
                                    ))}
                                </Scatter>
                            </ScatterChart>
                        ) : (
                            <div className="d-flex align-items-center justify-content-center h-100 text-muted">Sem dados para o mapa de clientes.</div>
                        )}
                    </ResponsiveContainer>
                </Card.Body>
            </Card>

            {/* TABELA COMPLETA */}
            <Card className="shadow-lg border-0">
                <Card.Header className="bg-white border-0 pt-4 px-4 d-flex align-items-center justify-content-between">
                    <h5 className="fw-bold d-flex align-items-center gap-2 mb-0">
                        <Users className="text-primary" size={20} />
                        {viewMode === 'melhores' ? '🏆 Ranking — Melhores Clientes' :
                            viewMode === 'piores' ? '⚠️ Ranking — Clientes com Mais Perdas' :
                                '📋 Todos os Clientes'}
                    </h5>
                    <Badge bg="secondary" className="rounded-pill">{displayClients.length} clientes</Badge>
                </Card.Header>
                <Card.Body className="p-0">
                    <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                        <Table responsive hover className="align-middle mb-0">
                            <thead className="bg-light text-muted small text-uppercase sticky-top">
                                <tr>
                                    <th className="ps-4" style={{ cursor: 'pointer' }} onClick={() => handleSort('nome')}>Cliente <SortIcon col="nome" /></th>
                                    <th className="text-center" style={{ cursor: 'pointer' }} onClick={() => handleSort('total')}>Opps <SortIcon col="total" /></th>
                                    <th className="text-center" style={{ cursor: 'pointer' }} onClick={() => handleSort('ganhas')}>Ganhas <SortIcon col="ganhas" /></th>
                                    <th className="text-center" style={{ cursor: 'pointer' }} onClick={() => handleSort('perdidas')}>Perdidas <SortIcon col="perdidas" /></th>
                                    <th className="text-center" style={{ cursor: 'pointer' }} onClick={() => handleSort('conversao')}>Conversão <SortIcon col="conversao" /></th>
                                    <th className="text-end" style={{ cursor: 'pointer' }} onClick={() => handleSort('receita')}>Receita <SortIcon col="receita" /></th>
                                    <th className="text-end pe-4" style={{ cursor: 'pointer' }} onClick={() => handleSort('ticketMedio')}>Ticket Médio <SortIcon col="ticketMedio" /></th>
                                </tr>
                            </thead>
                            <tbody>
                                {displayClients.slice(0, 50).map((client, index) => {
                                    const isTop = viewMode === 'melhores' && index < 3;
                                    const isBottom = viewMode === 'piores' && index < 3;
                                    return (
                                        <tr key={client.nome} className={isTop ? 'table-success' : isBottom ? 'table-danger' : ''}>
                                            <td className="ps-4 fw-bold text-dark">
                                                {isTop && <Trophy size={14} className="text-warning me-2" />}
                                                {isBottom && <AlertTriangle size={14} className="text-danger me-2" />}
                                                {client.nome.length > 35 ? client.nome.substring(0, 35) + '...' : client.nome}
                                            </td>
                                            <td className="text-center fw-semibold">{client.total}</td>
                                            <td className="text-center"><span className="text-success fw-bold">{client.ganhas}</span></td>
                                            <td className="text-center"><span className="text-danger fw-bold">{client.perdidas}</span></td>
                                            <td className="text-center">
                                                <Badge bg={client.conversao >= 50 ? 'success' : client.conversao >= 20 ? 'warning' : 'danger'} className="rounded-pill px-2">
                                                    {client.conversao.toFixed(1)}%
                                                </Badge>
                                            </td>
                                            <td className="text-end fw-bold text-dark">{client.receita.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                                            <td className="text-end pe-4 text-muted">{formatCurrency(client.ticketMedio)}</td>
                                        </tr>
                                    );
                                })}
                                {displayClients.length === 0 && (
                                    <tr><td colSpan={7} className="text-center text-muted py-5">Nenhum cliente encontrado para os filtros selecionados.</td></tr>
                                )}
                            </tbody>
                        </Table>
                    </div>
                </Card.Body>
            </Card>
        </div>
    );
};

export default ClientDashboard;
