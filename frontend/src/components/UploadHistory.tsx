import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Table, Button, Spinner, Badge, Card } from 'react-bootstrap';
import { Trash2, Calendar, FileText, History } from 'lucide-react';

interface UploadHistoryProps {
    apiUrl: string;
    authHeaders: Record<string, string>;
    onDeleteSuccess: () => void;
}

interface HistoryItem {
    id: string;
    file_name: string;
    rows_count: number;
    created_at: string;
}

const UploadHistory: React.FC<UploadHistoryProps> = ({ apiUrl, authHeaders, onDeleteSuccess }) => {
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const fetchHistory = async () => {
        try {
            const res = await axios.get(`${apiUrl}/api/history`, { headers: authHeaders });
            setHistory(res.data);
        } catch (err) {
            console.error('Erro ao buscar histórico:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchHistory();
    }, []);

    const handleDelete = async (id: string) => {
        if (!window.confirm('Tem certeza que deseja apagar esta importação? Isso removerá permanentemente os dados vinculados a este arquivo.')) return;

        setDeletingId(id);
        try {
            await axios.delete(`${apiUrl}/api/history/${id}`, { headers: authHeaders });
            setHistory(prev => prev.filter(item => item.id !== id));
            onDeleteSuccess();
        } catch (err) {
            alert('Erro ao excluir lote.');
        } finally {
            setDeletingId(null);
        }
    };

    if (loading) return <div className="text-center p-5"><Spinner animation="border" /></div>;

    return (
        <Card className="shadow-lg border-0 rounded-4">
            <Card.Header className="bg-white border-0 pt-4 px-4">
                <h5 className="fw-bold d-flex align-items-center gap-2">
                    <History className="text-primary" /> Histórico de Importações
                </h5>
                <p className="text-muted small mb-0">Gerencie seus arquivos enviados e remova dados incorretos.</p>
            </Card.Header>
            <Card.Body className="p-0">
                {history.length === 0 ? (
                    <div className="text-center py-5 text-muted">
                        <FileText size={48} className="mb-3 opacity-25" />
                        <p>Nenhuma importação encontrada.</p>
                    </div>
                ) : (
                    <Table responsive hover className="align-middle mb-0">
                        <thead className="bg-light text-muted small text-uppercase">
                            <tr>
                                <th className="ps-4">Arquivo</th>
                                <th>Data de Envio</th>
                                <th className="text-center">Linhas</th>
                                <th className="text-end pe-4">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {history.map(item => (
                                <tr key={item.id}>
                                    <td className="ps-4">
                                        <div className="fw-bold text-dark">{item.file_name}</div>
                                        <div className="text-muted smallest">ID: {item.id.slice(0, 8)}...</div>
                                    </td>
                                    <td>
                                        <div className="d-flex align-items-center gap-2 small">
                                            <Calendar size={14} className="text-muted" />
                                            {new Date(item.created_at).toLocaleString('pt-BR')}
                                        </div>
                                    </td>
                                    <td className="text-center">
                                        <Badge bg="secondary" pill>{item.rows_count}</Badge>
                                    </td>
                                    <td className="text-end pe-4">
                                        <Button
                                            variant="outline-danger"
                                            size="sm"
                                            className="rounded-circle p-2"
                                            onClick={() => handleDelete(item.id)}
                                            disabled={deletingId === item.id}
                                        >
                                            {deletingId === item.id ? <Spinner animation="border" size="sm" /> : <Trash2 size={16} />}
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </Table>
                )}
            </Card.Body>
        </Card>
    );
};


export default UploadHistory;
