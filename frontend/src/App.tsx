import React, { useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import type { Opportunity, ChatMessage } from './types/types.ts';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './services/supabase';
import { Auth } from './components/Auth';
import FileUpload from './components/FileUpload.tsx';
import Dashboard from './components/Dashboard.tsx';
import ChatUI from './components/ChatUI.tsx';
import { GeoDashboard } from './components/GeoDashboard';
import { Sparkles, Trash2, LayoutDashboard, MessageSquare, LogOut, Map } from 'lucide-react';
import { Container, Button, Navbar, Nav, Form } from 'react-bootstrap';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

type ActiveTab = 'dashboard' | 'geo' | 'chat';
type AIProvider = 'openai' | 'gemini';

const App: React.FC = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [data, setData] = useState<Opportunity[] | null>(null);
  const [aiProvider, setAiProvider] = useState<AIProvider>('openai');
  const [fileName, setFileName] = useState<string | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState<boolean>(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const getAuthHeaders = useCallback(() => {
    if (!session?.access_token) {
      return {};
    }
    return {
      Authorization: `Bearer ${session.access_token}`,
    };
  }, [session]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setData(null);
  };

  const handleDataLoaded = useCallback((loadedData: Opportunity[], name: string) => {
    setData(loadedData);
    setFileName(name);
    setFileError(null);
    setChatHistory([]);
    setActiveTab('dashboard');
  }, []);

  const handleFileSelected = useCallback(async (file: File) => {
    if (!session) return;

    setIsLoadingFile(true);
    setFileError(null);
    setData(null);
    setFileName(null);
    setProgressMessage('Enviando arquivo para o servidor...');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post(`${API_URL}/api/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          ...getAuthHeaders(),
        },
      });

      setProgressMessage('Processando e padronizando dados...');

      
     
      const dataFromBackend: Opportunity[] = response.data.importedData.map((item: any) => ({
        responsavel: item.responsavel || 'N/A',
        status: item.status,
        valor: Number(item.valor),
        dataCriacao: new Date(item.data_criacao),
        dataConclusao: item.data_conclusao ? new Date(item.data_conclusao) : null,
        origemLead: item.origem_lead || 'N/A',
        funil: item.funil || 'Geral',
        estado: item.estado || 'NA',
        cidade: item.cidade || 'N/A',
        produto: item.produto || 'Geral',
      }));

      handleDataLoaded(dataFromBackend, file.name);
    } catch (error: any) {
      console.error('Erro no upload:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Erro desconhecido.';
      setFileError(errorMessage);
    } finally {
      setIsLoadingFile(false);
      setProgressMessage(null);
    }
  }, [handleDataLoaded, session, getAuthHeaders]);

  const handleGenerateAnalysis = useCallback(async () => {
    if (!data || !session) return;

    setIsChatLoading(true);
    setChatHistory([]);
    setActiveTab('chat');

    try {
      const providerName = aiProvider === 'openai' ? 'GPT-4o' : 'Gemini 1.5';
      setChatHistory([{ role: 'model', content: `Analisando dados via **${providerName}**...` }]);

      const response = await axios.post(
        `${API_URL}/api/analyze`,
        { provider: aiProvider },
        { headers: getAuthHeaders() }
      );

      const analysisResult = response.data.analysis;
      setChatHistory([{ role: 'model', content: analysisResult }]);
    } catch (error: any) {
      const msg = error.response?.data?.error || error.message;
      setChatHistory([{ role: 'model', content: `Erro ao gerar análise: ${msg}` }]);
    } finally {
      setIsChatLoading(false);
    }
  }, [data, aiProvider, session, getAuthHeaders]);

  const handleSendMessage = useCallback(async (message: string) => {
    if (!session) return;

    const userMessage: ChatMessage = { role: 'user', content: message };
    setChatHistory(prev => [...prev, userMessage]);
    setIsChatLoading(true);

    try {
      setChatHistory(prev => [...prev, { role: 'model', content: '' }]);

      const response = await axios.post(
        `${API_URL}/api/chat`,
        {
          message,
          history: chatHistory,
        },
        { headers: getAuthHeaders() }
      );

      const { reply } = response.data;
      const botResponse = reply || 'Sem resposta.';

      setChatHistory(prev => {
        const newHistory = [...prev];
        newHistory[newHistory.length - 1] = { role: 'model', content: botResponse };
        return newHistory;
      });
    } catch (error: any) {
      setChatHistory(prev => {
        const newHistory = [...prev];
        newHistory[newHistory.length - 1] = { role: 'model', content: 'Erro técnico na consulta.' };
        return newHistory;
      });
    } finally {
      setIsChatLoading(false);
    }
  }, [chatHistory, session, getAuthHeaders]);

  const handleReset = () => {
    setData(null);
    setFileName(null);
    setIsLoadingFile(false);
    setFileError(null);
    setProgressMessage(null);
    setChatHistory([]);
    setIsChatLoading(false);
  };

  if (!session) {
    return <Auth />;
  }

  return (
    <div className="min-vh-100 bg-light">
      <Navbar bg="white" expand="lg" className="shadow-sm sticky-top">
        <Container>
          <Navbar.Brand className="fw-bold text-dark d-flex align-items-center">
            <img
              src="https://arquivos-meets.s3.amazonaws.com/whitelabel/simplo-crm_2024-05-21_favicon-32x32.png"
              width="30"
              height="30"
              className="me-2"
              alt="Logo"
            />
            Simplo CRM - <span className="text-primary ms-1">Analista de BI</span>
          </Navbar.Brand>

          <div className="d-flex gap-3 align-items-center">
            {data && (
              <Button
                variant="outline-danger"
                size="sm"
                onClick={handleReset}
                className="d-flex align-items-center gap-1"
              >
                <Trash2 size={16} /> Novo
              </Button>
            )}
            <Button variant="link" className="text-muted p-0" onClick={handleLogout} title="Sair">
              <LogOut size={20} />
            </Button>
          </div>
        </Container>
      </Navbar>
      <main>
        <Container className="py-4 py-lg-5">
          {!data ? (
            <div className="mt-5">
              <FileUpload
                onFileSelected={handleFileSelected}
                isLoading={isLoadingFile}
                progressMessage={progressMessage}
              />
              {fileError && (
                <div className="alert alert-danger max-w-2xl mx-auto mt-4">
                  <h5 className="alert-heading">Erro ao Carregar</h5>
                  <p className="mb-0">{fileError}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="d-grid gap-4">
              <div className="bg-white p-4 rounded-4 shadow-lg">
                <div className="d-flex flex-column flex-lg-row justify-content-between align-items-lg-center gap-3">
                  <div>
                    <h2 className="h3 fw-bold text-dark">Análise de Vendas</h2>
                    <p className="text-muted mb-0">
                      Arquivo: <span className="fw-semibold text-dark">{fileName}</span>
                    </p>
                  </div>

                  <div className="d-flex align-items-center gap-3 bg-light p-2 rounded-pill border">
                    <span className="ms-2 text-muted small fw-bold">IA:</span>
                    <Form.Check
                      type="radio"
                      id="ai-openai"
                      name="ai-provider"
                      label="GPT-4o"
                      checked={aiProvider === 'openai'}
                      onChange={() => setAiProvider('openai')}
                      className="mb-0"
                    />
                    <Form.Check
                      type="radio"
                      id="ai-gemini"
                      name="ai-provider"
                      label="Gemini 1.5"
                      checked={aiProvider === 'gemini'}
                      onChange={() => setAiProvider('gemini')}
                      className="mb-0 me-2"
                    />
                  </div>

                </div>
              </div>

              {data && (
                <Nav variant="pills" fill className="bg-white p-2 rounded-4 shadow-lg mb-4">
                  <Nav.Item>
                    <Nav.Link
                      active={activeTab === 'dashboard'}
                      onClick={() => setActiveTab('dashboard')}
                      className="d-flex align-items-center justify-content-center gap-2"
                    >
                      <LayoutDashboard size={18} /> Dashboard
                    </Nav.Link>
                  </Nav.Item>
                  <Nav.Item>
                    <Nav.Link
                      active={activeTab === 'geo'}
                      onClick={() => setActiveTab('geo')}
                      className="d-flex align-items-center justify-content-center gap-2"
                    >
                      <Map size={18} /> Geografia
                    </Nav.Link>
                  </Nav.Item>
                  <Nav.Item>
                    <Nav.Link
                      active={activeTab === 'chat'}
                      onClick={() => setActiveTab('chat')}
                      className="d-flex align-items-center justify-content-center gap-2"
                    >
                      <MessageSquare size={18} /> Chat com IA
                    </Nav.Link>
                  </Nav.Item>
                </Nav>
              )}

              {activeTab === 'dashboard' && <Dashboard data={data} />}
              {activeTab === 'geo' && <GeoDashboard data={data} />}
              {activeTab === 'chat' && (
                <>
                  {chatHistory.length === 0 && (
                    <div className="text-center p-5">
                      <h4>Vamos analisar seus dados?</h4>
                      <p className="text-muted mb-4">A IA vai ler toda a sua base e gerar insights estratégicos.</p>
                      <Button
                        onClick={handleGenerateAnalysis}
                        disabled={isChatLoading}
                        size="lg"
                        className="d-flex align-items-center gap-2 mx-auto"
                      >
                        <Sparkles size={20} />
                        {isChatLoading ? 'Gerando...' : 'Gerar Análise Completa'}
                      </Button>
                    </div>
                  )}
                  <ChatUI history={chatHistory} onSendMessage={handleSendMessage} isLoading={isChatLoading} />
                </>
              )}
            </div>
          )}
        </Container>
      </main>
    </div>
  );
};

export default App;