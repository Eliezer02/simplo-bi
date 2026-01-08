import React, { useState, useEffect } from 'react';
import { Modal, Button, Form, Row, Col, Alert } from 'react-bootstrap';

interface MappingModalProps {
    show: boolean;
    columns: string[];
    onConfirm: (mapping: Record<string, string>) => void;
    onCancel: () => void;
}

const MappingModal: React.FC<MappingModalProps> = ({ show, columns, onConfirm, onCancel }) => {
    const fields = [
        { key: 'protocolo', label: 'ID/Protocolo' },
        { key: 'responsavel', label: 'Responsável/Vendedor' },
        { key: 'funil', label: 'Funil/Pipeline' },
        { key: 'etapa', label: 'Etapa/Fase' },
        { key: 'status', label: 'Status/Situação' },
        { key: 'valor', label: 'Valor/Receita' },
        { key: 'data_criacao', label: 'Data de Criação' },
        { key: 'data_conclusao', label: 'Data de Conclusão' },
        { key: 'origem', label: 'Origem do Lead' },
        { key: 'cliente', label: 'Nome do Cliente' },
        { key: 'estado', label: 'Estado/UF' },
        { key: 'cidade', label: 'Cidade' },
        { key: 'produto', label: 'Produto/Serviço' },
        { key: 'motivo', label: 'Motivo da Perda' },
    ];

    const [mapping, setMapping] = useState<Record<string, string>>({});

    // Tentativa de mapeamento automático (Fuzzy Lite)
    useEffect(() => {
        if (show && columns.length > 0) {
            const autoMapping: Record<string, string> = {};
            fields.forEach(f => {
                const match = columns.find(c =>
                    c.toLowerCase().includes(f.key.toLowerCase()) ||
                    c.toLowerCase().includes(f.label.toLowerCase().split('/')[0].toLowerCase())
                );
                if (match) autoMapping[f.key] = match;
            });
            setMapping(autoMapping);
        }
    }, [show, columns]);

    const handleSelect = (fieldKey: string, column: string) => {
        setMapping(prev => ({ ...prev, [fieldKey]: column }));
    };

    const isComplete = fields.every(f => mapping[f.key]);

    return (
        <Modal show={show} onHide={onCancel} size="lg" centered backdrop="static">
            <Modal.Header closeButton>
                <Modal.Title className="fw-bold">Mapeamento de Colunas (Tradutor)</Modal.Title>
            </Modal.Header>
            <Modal.Body style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                <Alert variant="info" className="small">
                    Relacione as colunas da sua planilha com os campos do sistema. Se uma coluna não existir, selecione a mais próxima.
                </Alert>
                <Form>
                    <Row className="fw-bold mb-2 pb-2 border-bottom text-muted small">
                        <Col>Campo do Sistema</Col>
                        <Col>Coluna na sua Planilha</Col>
                    </Row>
                    {fields.map(f => (
                        <Form.Group as={Row} key={f.key} className="mb-2 align-items-center">
                            <Form.Label column sm={5} className="small">
                                {f.label} {f.key === 'protocolo' || f.key === 'valor' ? <span className="text-danger">*</span> : ''}
                            </Form.Label>
                            <Col sm={7}>
                                <Form.Select
                                    size="sm"
                                    value={mapping[f.key] || ''}
                                    onChange={(e) => handleSelect(f.key, e.target.value)}
                                    className={mapping[f.key] ? 'border-success' : 'border-warning'}
                                >
                                    <option value="">-- Selecione --</option>
                                    {columns.map(c => <option key={c} value={c}>{c}</option>)}
                                </Form.Select>
                            </Col>
                        </Form.Group>
                    ))}
                </Form>
            </Modal.Body>
            <Modal.Footer className="bg-light">
                <Button variant="outline-secondary" onClick={onCancel}>Cancelar</Button>
                <Button
                    variant="primary"
                    onClick={() => onConfirm(mapping)}
                    disabled={!mapping.protocolo || !mapping.valor}
                >
                    Confirmar e Importar
                </Button>
            </Modal.Footer>
        </Modal>
    );
};

export default MappingModal;
