import React from 'react';
import { Card, Accordion, Row, Col, Alert } from 'react-bootstrap';
import { HelpCircle, Book, ShieldCheck, Zap, Info } from 'lucide-react';

const Help: React.FC = () => {
    return (
        <div className="fade-in">
            <Row className="mb-4">
                <Col>
                    <div className="d-flex align-items-center gap-3 bg-white p-4 rounded-4 shadow-sm">
                        <div className="p-3 bg-primary-subtle rounded-circle">
                            <HelpCircle size={32} className="text-primary" />
                        </div>
                        <div>
                            <h3 className="fw-bold mb-1">Central de Ajuda</h3>
                            <p className="text-muted mb-0">Tudo o que você precisa saber para dominar o Simplo BI.</p>
                        </div>
                    </div>
                </Col>
            </Row>

            <Row className="g-4">
                <Col lg={8}>
                    <Card className="shadow-lg border-0 rounded-4 mb-4">
                        <Card.Header className="bg-white border-0 pt-4 px-4">
                            <h5 className="fw-bold d-flex align-items-center gap-2">
                                <Book size={20} className="text-primary" /> Guia de Uso
                            </h5>
                        </Card.Header>
                        <Card.Body className="px-4 pb-4">
                            <Accordion defaultActiveKey="0" flush>
                                <Accordion.Item eventKey="0" className="border-bottom py-2">
                                    <Accordion.Header className="fw-bold">1. Como importar meus dados?</Accordion.Header>
                                    <Accordion.Body className="text-muted">
                                        Basta clicar na área de upload na página inicial e selecionar sua planilha em formato .CSV.
                                        O sistema agora possui um <strong>Tradutor Automático</strong>: você poderá dizer qual coluna da sua planilha representa o valor, o vendedor, a data, etc.
                                    </Accordion.Body>
                                </Accordion.Item>
                                <Accordion.Item eventKey="1" className="border-bottom py-2">
                                    <Accordion.Header className="fw-bold">2. O que fazer com dados em duplicidade?</Accordion.Header>
                                    <Accordion.Body className="text-muted">
                                        Nosso sistema possui uma <strong>Deduplicação Inteligente</strong>. Ele analisa o conteúdo da linha (cliente, valor, data).
                                        Se você subir a mesma planilha duas vezes, ele só importará o que for novo. Se precisar remover um arquivo enviado por engano, use a aba "Histórico" para deletar o lote completo.
                                    </Accordion.Body>
                                </Accordion.Item>
                                <Accordion.Item eventKey="2" className="border-bottom py-2">
                                    <Accordion.Header className="fw-bold">3. Como usar o Chat com IA?</Accordion.Header>
                                    <Accordion.Body className="text-muted">
                                        Após importar os dados, vá na aba "Chat com IA". Você pode pedir análises complexas como:
                                        <em>"Qual vendedor tem o melhor ciclo de fechamento?"</em> ou <em>"Compare a performance do funil de vendas com o de suporte"</em>.
                                        A IA usa métricas estatísticas de BI para te dar insights reais.
                                    </Accordion.Body>
                                </Accordion.Item>
                            </Accordion>
                        </Card.Body>
                    </Card>

                    <Alert variant="warning" className="rounded-4 border-0 shadow-sm d-flex gap-3">
                        <Info className="flex-shrink-0" />
                        <div>
                            <h6 className="fw-bold">Dica de Ouro: Sazonalidade</h6>
                            <p className="small mb-0">Use o filtro de <strong>Ano (2026)</strong> no chat para comparar seu desempenho atual com as metas projetadas. A IA entende o contexto temporal de hoje.</p>
                        </div>
                    </Alert>
                </Col>

                <Col lg={4}>
                    <Card className="shadow-lg border-0 rounded-4 bg-primary text-white mb-4">
                        <Card.Body className="p-4">
                            <h6 className="fw-bold d-flex align-items-center gap-2 mb-3">
                                <Zap size={18} /> Resumo Técnico
                            </h6>
                            <ul className="list-unstyled small mb-0 d-grid gap-3">
                                <li className="d-flex gap-2">
                                    <ShieldCheck size={16} className="flex-shrink-0" />
                                    <span><strong>Segurança:</strong> Seus dados são criptografados e vinculados apenas à sua conta Supabase.</span>
                                </li>
                                <li className="d-flex gap-2">
                                    <ShieldCheck size={16} className="flex-shrink-0" />
                                    <span><strong>Precisão:</strong> Todos os valores monetários são normalizados para o formato brasileiro (R$).</span>
                                </li>
                                <li className="d-flex gap-2">
                                    <ShieldCheck size={16} className="flex-shrink-0" />
                                    <span><strong>Batch ID:</strong> Cada arquivo enviado gera um rastreador único para permitir reversão de erros.</span>
                                </li>
                            </ul>
                        </Card.Body>
                    </Card>

                    <Card className="shadow-sm border-0 rounded-4 bg-light">
                        <Card.Body className="p-4 text-center">
                            <p className="text-muted small mb-0">Precisa de ajuda avançada?<br /><strong>contato@simplocrm.com.br</strong></p>
                        </Card.Body>
                    </Card>
                </Col>
            </Row>
        </div>
    );
};

export default Help;
