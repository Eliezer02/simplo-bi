import React, { useState, useMemo } from 'react';
import { Chart } from 'react-google-charts';
import { Card, Row, Col, Form,  Badge } from 'react-bootstrap';
import { MapPin, Filter, Box, TrendingDown, Megaphone } from 'lucide-react';
import type { Opportunity } from '../types/types';

interface GeoDashboardProps {
  data: Opportunity[];
}

export const GeoDashboard: React.FC<GeoDashboardProps> = ({ data }) => {
  const [selectedEstado, setSelectedEstado] = useState('Todos');
  const [selectedCidade, setSelectedCidade] = useState('Todas');
  const [selectedProduto, setSelectedProduto] = useState('Todos');

  // 1. Extração de Listas Únicas
  const uniqueEstados = useMemo(() => ['Todos', ...Array.from(new Set(data.map(d => d.estado))).filter(e => e !== 'NA').sort()], [data]);
  const uniqueProdutos = useMemo(() => ['Todos', ...Array.from(new Set(data.map(d => d.produto))).filter(p => p !== 'Geral').sort()], [data]);
  
  const uniqueCidades = useMemo(() => {
    if (selectedEstado === 'Todos') return ['Todas'];
    return ['Todas', ...Array.from(new Set(data.filter(d => d.estado === selectedEstado).map(d => d.cidade))).sort()];
  }, [data, selectedEstado]);

  // 2. Filtragem dos Dados
  const filteredData = useMemo(() => {
    return data.filter(d => {
      const matchEstado = selectedEstado === 'Todos' || d.estado === selectedEstado;
      const matchCidade = selectedCidade === 'Todas' || d.cidade === selectedCidade;
      const matchProd = selectedProduto === 'Todos' || d.produto === selectedProduto;
      return matchEstado && matchCidade && matchProd;
    });
  }, [data, selectedEstado, selectedCidade, selectedProduto]);

  // 3. Dados Avançados para o Mapa (Com Tooltip Customizado)
  const mapData = useMemo(() => {
    // Agrupa dados por Estado
    const stats: Record<string, { receita: number, total: number, ganhas: number }> = {};
    
    // 'data' completo se o filtro de estado for 'Todos' para mostrar o mapa do Brasil inteiro,
    // mas respeitamos o filtro de produto.
    const mapSource = selectedEstado === 'Todos' 
        ? data.filter(d => selectedProduto === 'Todos' || d.produto === selectedProduto)
        : filteredData;

    mapSource.forEach(d => {
      const uf = `BR-${d.estado}`;
      if (!stats[uf]) stats[uf] = { receita: 0, total: 0, ganhas: 0 };
      
      stats[uf].total++;
      if (d.status === 'Ganha') {
          stats[uf].receita += d.valor;
          stats[uf].ganhas++;
      }
    });

    // Cabeçalho para Google Charts
    const chartData: any[] = [['Estado', 'Receita (Color)', { role: 'tooltip', p: { html: true } }]];

    Object.entries(stats).forEach(([uf, stat]) => {
        const ufClean = uf.replace('BR-', '');
        // HTML do Tooltip
        const tooltipHtml = `
            <div style="padding: 10px; font-family: sans-serif; min-width: 150px;">
                <h6 style="margin: 0 0 5px 0; font-weight: bold;">${ufClean}</h6>
                <div style="margin-bottom: 3px;">💰 <b>Receita:</b> R$ ${stat.receita.toLocaleString('pt-BR')}</div>
                <div style="margin-bottom: 3px;">📂 <b>Oportunidades:</b> ${stat.total}</div>
                <div>🏆 <b>Conquistadas:</b> ${stat.ganhas}</div>
            </div>
        `;
        chartData.push([uf, stat.receita, tooltipHtml]);
    });

    return chartData;
  }, [data, filteredData, selectedEstado, selectedProduto]);

  // 4. Métricas de Perda e Origem (Baseadas no filtro atual)
  const chartsData = useMemo(() => {
    const perdasPorEstado: Record<string, number> = {};
    const origemPorCanal: Record<string, { total: number, valor: number }> = {};

    filteredData.forEach(d => {
        // Lógica de Perda
        if (d.status === 'Perdida') {
            const label = d.estado;
            perdasPorEstado[label] = (perdasPorEstado[label] || 0) + 1;
        }

        // Lógica de Origem
        const origem = d.origemLead || 'Desconhecido';
        if (!origemPorCanal[origem]) origemPorCanal[origem] = { total: 0, valor: 0 };
        origemPorCanal[origem].total++;
        if (d.status === 'Ganha') origemPorCanal[origem].valor += d.valor;
    });

    // Formatação para Gráficos
    const perdasChart = [['Estado', 'Perdas'], ...Object.entries(perdasPorEstado).sort((a,b) => b[1] - a[1]).slice(0, 5)];
    const origemChart = [['Origem', 'Oportunidades', 'Receita'], ...Object.entries(origemPorCanal).sort((a,b) => b[1].valor - a[1].valor).map(([k,v]) => [k, v.total, v.valor])];

    return { perdasChart, origemChart };
  }, [filteredData]);

  // 5. KPIs Rápidos
  const kpis = useMemo(() => {
      const total = filteredData.length;
      const ganhas = filteredData.filter(d => d.status === 'Ganha').length;
      return { total, ganhas };
  }, [filteredData]);

  return (
    <div className="d-grid gap-4 fade-in">
      {}
      <Card className="shadow-sm border-0">
        <Card.Body>
            <Row className="g-3">
                <Col md={4}>
                    <Form.Label className="d-flex align-items-center gap-2 fw-semibold text-muted small"><MapPin size={14}/> Estado</Form.Label>
                    <Form.Select size="sm" value={selectedEstado} onChange={e => { setSelectedEstado(e.target.value); setSelectedCidade('Todas'); }}>
                        {uniqueEstados.map(e => <option key={e} value={e}>{e}</option>)}
                    </Form.Select>
                </Col>
                <Col md={4}>
                    <Form.Label className="d-flex align-items-center gap-2 fw-semibold text-muted small"><Filter size={14}/> Cidade</Form.Label>
                    <Form.Select size="sm" value={selectedCidade} onChange={e => setSelectedCidade(e.target.value)} disabled={selectedEstado === 'Todos'}>
                        {uniqueCidades.map(c => <option key={c} value={c}>{c}</option>)}
                    </Form.Select>
                </Col>
                <Col md={4}>
                    <Form.Label className="d-flex align-items-center gap-2 fw-semibold text-muted small"><Box size={14}/> Produto</Form.Label>
                    <Form.Select size="sm" value={selectedProduto} onChange={e => setSelectedProduto(e.target.value)}>
                        {uniqueProdutos.map(p => <option key={p} value={p}>{p}</option>)}
                    </Form.Select>
                </Col>
            </Row>
        </Card.Body>
      </Card>

      <Row className="g-4">
        {}
        <Col lg={8}>
            <Card className="shadow-lg border-0 h-100">
                <Card.Header className="bg-white border-0 pt-4 px-4 d-flex justify-content-between">
                    <h5 className="fw-bold mb-0">Mapa de Performance</h5>
                    <Badge bg="info" className="align-self-center">
                        {selectedEstado === 'Todos' ? 'Brasil' : selectedEstado}
                    </Badge>
                </Card.Header>
                <Card.Body className="position-relative">
                    <Chart
                        chartType="GeoChart"
                        width="100%"
                        height="400px"
                        data={mapData}
                        options={{
                            region: 'BR',
                            resolution: 'provinces',
                            colorAxis: { colors: ['#e0f2fe', '#0284c7', '#0c4a6e'] },
                            backgroundColor: '#fff',
                            datalessRegionColor: '#f8f9fa',
                            tooltip: { isHtml: true } 
                        }}
                    />
                    <div className="d-flex gap-3 justify-content-center mt-2 small text-muted">
                        <span>📊 Total na Visão: <b>{kpis.total}</b></span>
                        <span>🏆 Ganhas: <b>{kpis.ganhas}</b></span>
                    </div>
                </Card.Body>
            </Card>
        </Col>

        {}
        <Col lg={4}>
             <Card className="shadow-lg border-0 h-100">
                <Card.Header className="bg-white border-0 pt-4 px-4">
                    <h6 className="fw-bold d-flex align-items-center gap-2 text-danger">
                        <TrendingDown size={18}/> Onde mais perdemos?
                    </h6>
                </Card.Header>
                <Card.Body>
                    {chartsData.perdasChart.length > 1 ? (
                        <Chart
                            chartType="BarChart"
                            width="100%"
                            height="350px"
                            data={chartsData.perdasChart}
                            options={{
                                legend: { position: 'none' },
                                colors: ['#ef4444'],
                                hAxis: { title: 'Qtd. Perdida' },
                                vAxis: { textStyle: { fontSize: 11 } }
                            }}
                        />
                    ) : (
                        <div className="text-center text-muted py-5">Sem dados de perdas para este filtro.</div>
                    )}
                </Card.Body>
             </Card>
        </Col>

        {}
        <Col lg={12}>
            <Card className="shadow-lg border-0">
                 <Card.Header className="bg-white border-0 pt-4 px-4">
                    <h5 className="fw-bold d-flex align-items-center gap-2">
                        <Megaphone size={20} className="text-primary"/> Origem & Conversão (Cruzamento Atual)
                    </h5>
                    <small className="text-muted">Analisando origem para: <b>{selectedProduto}</b> em <b>{selectedCidade}</b></small>
                </Card.Header>
                <Card.Body>
                    <Chart
                        chartType="ColumnChart"
                        width="100%"
                        height="300px"
                        data={chartsData.origemChart}
                        options={{
                            isStacked: false,
                            series: {
                                0: { targetAxisIndex: 0, color: '#94a3b8' }, 
                                1: { targetAxisIndex: 1, type: 'line', color: '#10b981', pointSize: 5 } 
                            },
                            vAxes: {
                                0: { title: 'Volume (Qtd)' },
                                1: { title: 'Receita (R$)', format: 'short' }
                            }
                        }}
                    />
                </Card.Body>
            </Card>
        </Col>
      </Row>
    </div>
  );
};