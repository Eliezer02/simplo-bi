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
import ClientDashboard from './components/ClientDashboard.tsx';
import MappingModal from './components/MappingModal.tsx';
import UploadHistory from './components/UploadHistory.tsx';
import Help from './components/Help.tsx';
import { Sparkles, LayoutDashboard, MessageSquare, LogOut, Map, Building2, RefreshCw, Settings, Sun, Moon } from 'lucide-react';
import { Container, Button, Navbar, Nav, Form } from 'react-bootstrap';

const API_URL = import.meta.env.VITE_API_URL || 'https://simplo-bi-api.onrender.com';

type ActiveTab = 'dashboard' | 'geo' | 'clients' | 'chat' | 'history' | 'help' | 'crm';
type AIProvider = 'openai' | 'gemini';

type Theme = 'light' | 'dark';

const App: React.FC = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('theme') as Theme) || 'light');
  const [data, setData] = useState<Opportunity[] | null>(null);
  const [aiProvider, setAiProvider] = useState<AIProvider>('openai');
  const [fileName, setFileName] = useState<string | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState<boolean>(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [detectedColumns, setDetectedColumns] = useState<string[]>([]);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  // Estados específicos para integração via API do CRM
  const [isCrmConfigured, setIsCrmConfigured] = useState<boolean>(false);
  const [isSyncingCrm, setIsSyncingCrm] = useState<boolean>(false);
  const [crmApiToken, setCrmApiToken] = useState<string>('');
  const [crmLastSync, setCrmLastSync] = useState<string | null>(null);
  const [crmSyncStatus, setCrmSyncStatus] = useState<string | null>(null);
  const [testConnectionStatus, setTestConnectionStatus] = useState<{ status: 'idle' | 'loading' | 'success' | 'error'; message: string | null }>({ status: 'idle', message: null });

  const getAuthHeaders = useCallback(() => {
    if (!session?.access_token) {
      return {};
    }
    return {
      Authorization: `Bearer ${session.access_token}`,
    };
  }, [session]);

  const fetchCrmConfig = useCallback(async () => {
    if (!session) return;
    try {
      const response = await axios.get(`${API_URL}/api/crm/config`, { headers: getAuthHeaders() });
      if (response.data.configured) {
        setIsCrmConfigured(true);
        setCrmApiToken(response.data.apiToken);
        setCrmLastSync(response.data.lastSync);
        setCrmSyncStatus(response.data.syncStatus);
      } else {
        setIsCrmConfigured(false);
      }
    } catch (error) {
      console.error('Erro ao buscar configuração CRM:', error);
    }
  }, [session, getAuthHeaders]);

  const fetchInitialData = useCallback(async () => {
    if (!session) return;
    setIsLoadingFile(true);
    try {
      const response = await axios.get(`${API_URL}/api/upload-status`, { headers: getAuthHeaders() });
      if (response.data.data && response.data.data.length > 0) {
        const mappedData = response.data.data.map((item: any) => ({
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
          motivoPerda: item.motivo_perda || 'Não informado',
          cliente: item.nome_cliente || 'Anônimo',
        }));
        setData(mappedData);
        setFileName(response.data.data[0]?.file_name || 'Dados do Banco');
      }
    } catch (error) {
      console.error('Erro ao buscar dados iniciais:', error);
    } finally {
      setIsLoadingFile(false);
    }
  }, [session, getAuthHeaders]);

  useEffect(() => {
    document.documentElement.setAttribute('data-bs-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  }, []);

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

  useEffect(() => {
    if (session) {
      fetchInitialData();
      fetchCrmConfig();
    }
  }, [session, fetchInitialData, fetchCrmConfig]);

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
    setProgressMessage('Detectando estrutura da planilha...');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post(`${API_URL}/api/detect-columns`, formData, {
        headers: { ...getAuthHeaders(), 'Content-Type': 'multipart/form-data' }
      });
      setDetectedColumns(response.data.columns);
      setPendingFile(file);
      setShowMappingModal(true);
    } catch (error: any) {
      setFileError(error.response?.data?.error || 'Erro ao ler arquivo.');
    } finally {
      setIsLoadingFile(false);
      setProgressMessage(null);
    }
  }, [session, getAuthHeaders]);

  const handleConfirmMapping = useCallback(async (mapping: Record<string, string>) => {
    if (!pendingFile || !session) return;
    setShowMappingModal(false);
    setIsLoadingFile(true);
    setProgressMessage('Importando dados com seu mapeamento...');

    const formData = new FormData();
    formData.append('file', pendingFile);
    formData.append('mapping', JSON.stringify(mapping));
    formData.append('fileName', pendingFile.name);

    try {
      const response = await axios.post(`${API_URL}/api/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          ...getAuthHeaders(),
        },
      });

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
        motivoPerda: item.motivo_perda || 'Não informado',
        cliente: item.nome_cliente || 'Anônimo',
      }));

      handleDataLoaded(dataFromBackend, pendingFile.name);
    } catch (error: any) {
      setFileError(error.response?.data?.error || 'Erro no processamento.');
    } finally {
      setIsLoadingFile(false);
      setProgressMessage(null);
      setPendingFile(null);
    }
  }, [pendingFile, session, getAuthHeaders, handleDataLoaded]);

  // Método de sincronização manual via API
  const handleSyncCrm = useCallback(async () => {
    if (!session) return;
    setIsLoadingFile(true);
    setIsSyncingCrm(true);
    setFileError(null);
    setProgressMessage('Sincronizando dados do Simplo CRM via API... (Páginas estão sendo processadas no servidor)');

    try {
      const response = await axios.post(`${API_URL}/api/crm/sync`, {}, {
        headers: getAuthHeaders()
      });

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
        motivoPerda: item.motivo_perda || 'Não informado',
        cliente: item.nome_cliente || 'Anônimo',
      }));

      handleDataLoaded(dataFromBackend, `Sincronização Simplo CRM`);
      fetchCrmConfig();
    } catch (error: any) {
      setFileError(error.response?.data?.error || 'Erro na sincronização manual.');
    } finally {
      setIsLoadingFile(false);
      setIsSyncingCrm(false);
      setProgressMessage(null);
    }
  }, [session, getAuthHeaders, handleDataLoaded, fetchCrmConfig]);

  // Conecta e salva a integração (URL e mapeamento são fixos no backend)
  const handleConnectCrm = async () => {
    if (!session || !crmApiToken) {
      setTestConnectionStatus({ status: 'error', message: 'Insira o código de autorização antes de conectar.' });
      return;
    }

    setTestConnectionStatus({ status: 'loading', message: 'Conectando à API do CRM...' });
    try {
      // Valida o token na API do CRM
      await axios.post(`${API_URL}/api/crm/test-connect`, { apiToken: crmApiToken }, { headers: getAuthHeaders() });

      // Salva a credencial (URL e mapeamento são definidos pelo backend)
      await axios.post(`${API_URL}/api/crm/config`, { apiToken: crmApiToken }, { headers: getAuthHeaders() });

      setIsCrmConfigured(true);
      setTestConnectionStatus({ status: 'success', message: 'Conectado! Agora clique em "Atualizar dados do CRM agora" para importar.' });
      fetchCrmConfig();
    } catch (error: any) {
      const msg = error.response?.data?.error || 'Erro ao conectar. Verifique o código de autorização.';
      setTestConnectionStatus({ status: 'error', message: msg });
    }
  };

  const handleGenerateAnalysis = useCallback(async () => {
    if (!data || !session) return;

    setIsChatLoading(true);
    setChatHistory([]);
    setActiveTab('chat');

    try {
      setChatHistory([{ role: 'model', content: '' }]);

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

    const historyToSend = chatHistory.slice(-12);
    setChatHistory(prev => [...prev, { role: 'user', content: message }, { role: 'model', content: '' }]);
    setIsChatLoading(true);

    const updateLast = (content: string) => {
      setChatHistory(prev => {
        const nh = [...prev];
        nh[nh.length - 1] = { role: 'model', content };
        return nh;
      });
    };

    try {
      const response = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(getAuthHeaders() as Record<string, string>) },
        body: JSON.stringify({ message, history: historyToSend, provider: aiProvider }),
      });

      if (!response.ok || !response.body) {
        let errMsg = 'Erro técnico na consulta.';
        try { const j = await response.json(); errMsg = j.error || errMsg; } catch { /* corpo não-JSON */ }
        updateLast(`⚠️ ${errMsg}`);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let acc = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          let evt: any;
          try { evt = JSON.parse(payload); } catch { continue; }

          if (evt.type === 'delta') {
            acc += evt.text;
            updateLast(acc);
          } else if (evt.type === 'status' && !acc) {
            updateLast(`_${evt.step}_`);
          } else if (evt.type === 'error') {
            updateLast(`⚠️ ${evt.message || 'Erro ao processar.'}`);
          } else if (evt.type === 'done' && Array.isArray(evt.debug) && evt.debug.length) {
            console.groupCollapsed(`🤖 Debug IA: "${message.slice(0, 30)}..."`);
            evt.debug.forEach((log: any, i: number) => {
              console.log(`%cPasso ${i + 1}: ${log.step}`, 'color:#0d6efd;font-weight:bold;');
              if (log.tool) console.log('🔧 Ferramenta:', log.tool);
              if (log.argumentos) console.log('📥 Argumentos:', log.argumentos);
              if (log.linhas_consideradas !== undefined) console.log('🔢 Linhas analisadas:', log.linhas_consideradas);
            });
            console.groupEnd();
          }
        }
      }

      if (!acc) updateLast('Sem resposta.');
    } catch (error: any) {
      console.error(error);
      updateLast('⚠️ Erro técnico na consulta.');
    } finally {
      setIsChatLoading(false);
    }
  }, [chatHistory, session, getAuthHeaders, aiProvider]);

  if (!session) {
    return (
      <>
        <button
          type="button"
          className="theme-toggle-btn position-fixed"
          style={{ top: 16, right: 16, zIndex: 1050 }}
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Mudar para modo claro' : 'Mudar para modo noturno'}
          aria-label="Alternar tema"
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <Auth />
      </>
    );
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
            Simplo CRM - <span className="text-primary ms-1">BI IA</span>
          </Navbar.Brand>
 
          <Nav className="me-auto d-none d-lg-flex ms-4">
            <Nav.Link active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')}>Painel</Nav.Link>
            <Nav.Link active={activeTab === 'chat'} onClick={() => setActiveTab('chat')}>Conversar</Nav.Link>
            <Nav.Link active={activeTab === 'history'} onClick={() => setActiveTab('history')}>Histórico</Nav.Link>
            <Nav.Link active={activeTab === 'crm'} onClick={() => setActiveTab('crm')}>Integração CRM</Nav.Link>
            <Nav.Link active={activeTab === 'help'} onClick={() => setActiveTab('help')}>Ajuda</Nav.Link>
          </Nav>
 
          <div className="d-flex gap-3 align-items-center">
            <MappingModal
              show={showMappingModal}
              columns={detectedColumns}
              onConfirm={(mapping) => handleConfirmMapping(mapping)}
              onCancel={() => {
                setShowMappingModal(false);
                setPendingFile(null);
              }}
            />
            
            {/* Botão Atualizar/Sincronizar CRM Sob Demanda (aparece assim que a integração está configurada) */}
            {isCrmConfigured && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleSyncCrm}
                disabled={isSyncingCrm}
                className="d-flex align-items-center gap-2 rounded-pill px-3 shadow-sm border-0 text-white"
                style={{
                  background: 'linear-gradient(135deg, #0d6efd 0%, #0a58ca 100%)',
                  fontWeight: 600
                }}
              >
                <RefreshCw className={isSyncingCrm ? 'spin' : ''} size={14} style={{ animation: isSyncingCrm ? 'spin 1s linear infinite' : 'none' }} />
                {isSyncingCrm ? 'Atualizando...' : 'Atualizar dados (CRM)'}
              </Button>
            )}

            {data && (
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={() => setData(null)}
                className="d-flex align-items-center gap-1 rounded-pill px-3"
                style={{ fontWeight: 500 }}
              >
                Subir Novo (CSV)
              </Button>
            )}
            <button
              type="button"
              className="theme-toggle-btn"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Mudar para modo claro' : 'Mudar para modo noturno'}
              aria-label="Alternar tema"
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <Button variant="link" className="text-muted p-0 ms-2" onClick={handleLogout} title="Sair">
              <LogOut size={20} />
            </Button>
          </div>
        </Container>
      </Navbar>
 
      <main>
        <Container className="py-4 py-lg-5">
          {activeTab === 'help' && <Help />}
          {activeTab === 'history' && (
            <UploadHistory
              apiUrl={API_URL}
              authHeaders={getAuthHeaders() as Record<string, string>}
              onDeleteSuccess={() => { setData(null); fetchInitialData(); }}
            />
          )}
 
          {activeTab !== 'help' && activeTab !== 'history' && (
            <>
              {activeTab === 'crm' ? (
                /* PAINEL DE CONFIGURAÇÃO DE INTEGRAÇÃO CRM (PREMIUM DESIGN) */
                <div className="bg-white p-4 p-lg-5 rounded-4 shadow-lg">
                  <div className="d-flex align-items-center gap-3 mb-4">
                    <div className="bg-primary bg-opacity-10 p-3 rounded-3 text-primary">
                      <Settings size={28} />
                    </div>
                    <div>
                      <h3 className="fw-bold mb-1 text-dark">Configuração da API do Simplo CRM</h3>
                      <p className="text-muted mb-0">Integre sua conta e sincronize as oportunidades comerciais sob demanda</p>
                    </div>
                  </div>

                  <div className="row g-4 mt-2">
                    <div className="col-lg-6">
                      <div className="card border-0 bg-light p-4 rounded-4 h-100 shadow-sm">
                        <h5 className="fw-bold mb-3 d-flex align-items-center gap-2 text-dark">
                          <span className="bg-primary text-white rounded-circle d-inline-flex align-items-center justify-content-center" style={{ width: '24px', height: '24px', fontSize: '12px' }}>1</span>
                          Credenciais de Acesso
                        </h5>
                        <Form.Group className="mb-4">
                          <Form.Label className="fw-semibold text-muted small mb-1">Código de Autorização (API Token)</Form.Label>
                          <Form.Control
                            type="password"
                            placeholder="Cole aqui o código de autorização da API"
                            value={crmApiToken}
                            onChange={(e) => setCrmApiToken(e.target.value)}
                            className="rounded-3 py-2 border-secondary border-opacity-25"
                          />
                        </Form.Group>

                        <Button
                          variant="primary"
                          onClick={handleConnectCrm}
                          disabled={testConnectionStatus.status === 'loading'}
                          className="w-100 py-2.5 rounded-3 d-flex align-items-center justify-content-center gap-2 fw-semibold shadow-sm border-0"
                          style={{ background: 'linear-gradient(135deg, #0d6efd 0%, #0a58ca 100%)' }}
                        >
                          {testConnectionStatus.status === 'loading' ? (
                            <>
                              <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} />
                              Conectando...
                            </>
                          ) : (
                            <>
                              <Sparkles size={18} />
                              {isCrmConfigured ? 'Atualizar código de autorização' : 'Conectar'}
                            </>
                          )}
                        </Button>

                        {testConnectionStatus.message && (
                          <div className={`alert mt-3 mb-0 rounded-3 ${testConnectionStatus.status === 'success' ? 'alert-success' : 'alert-danger'}`}>
                            {testConnectionStatus.message}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="col-lg-6">
                      <div className="card border-0 bg-light p-4 rounded-4 h-100 d-flex flex-column justify-content-between shadow-sm">
                        <div>
                          <h5 className="fw-bold mb-3 d-flex align-items-center gap-2 text-dark">
                            <span className="bg-primary text-white rounded-circle d-inline-flex align-items-center justify-content-center" style={{ width: '24px', height: '24px', fontSize: '12px' }}>2</span>
                            Status da Integração
                          </h5>
                          <div className="d-grid gap-3 my-4">
                            <div className="d-flex justify-content-between align-items-center border-bottom pb-2">
                              <span className="text-muted small">Estado atual:</span>
                              <span className={`badge rounded-pill px-3 py-1.5 ${isCrmConfigured ? 'bg-success bg-opacity-10 text-success' : 'bg-warning bg-opacity-10 text-warning'}`}>
                                {isCrmConfigured ? 'Conectado' : 'Não Configurado'}
                              </span>
                            </div>
                            <div className="d-flex justify-content-between align-items-center border-bottom pb-2">
                              <span className="text-muted small">Última Sincronização:</span>
                              <span className="fw-semibold text-dark">
                                {crmLastSync ? new Date(crmLastSync).toLocaleString('pt-BR') : 'Nunca sincronizado'}
                              </span>
                            </div>
                            <div className="d-flex justify-content-between align-items-center border-bottom pb-2">
                              <span className="text-muted small">Status do Último Sync:</span>
                              <span className={`fw-semibold ${crmSyncStatus === 'sucesso' ? 'text-success' : crmSyncStatus === 'erro' ? 'text-danger' : 'text-muted'}`}>
                                {crmSyncStatus === 'sucesso' ? 'Sucesso' : crmSyncStatus === 'erro' ? 'Falhou' : 'N/A'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {isCrmConfigured && (
                          <Button
                            variant="primary"
                            onClick={handleSyncCrm}
                            disabled={isSyncingCrm}
                            className="w-100 py-2.5 rounded-3 d-flex align-items-center justify-content-center gap-2 fw-semibold shadow-sm border-0 mb-3"
                            style={{ background: 'linear-gradient(135deg, #0d6efd 0%, #0a58ca 100%)' }}
                          >
                            <RefreshCw size={18} style={{ animation: isSyncingCrm ? 'spin 1s linear infinite' : 'none' }} />
                            {isSyncingCrm ? 'Extraindo dados do CRM...' : 'Atualizar dados do CRM agora'}
                          </Button>
                        )}

                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {!data ? (
                    <div className="mt-5">
                      <FileUpload
                        onFileSelected={handleFileSelected}
                        isLoading={isLoadingFile}
                        progressMessage={progressMessage}
                      />

                      {/* Fluxo de Entrada Direto para Configuração da API */}
                      <div className="text-center mt-4 bg-white p-4 rounded-4 shadow-sm max-w-2xl mx-auto border border-secondary border-opacity-10">
                        <span className="text-muted small fw-semibold uppercase tracking-wider d-block mb-3">OU IMPORTE DIRETAMENTE DA API</span>
                        <Button 
                          variant="outline-primary" 
                          onClick={() => setActiveTab('crm')}
                          className="rounded-pill px-4 py-2 fw-semibold d-inline-flex align-items-center gap-2"
                        >
                          <Settings size={16} />
                          Configurar API Simplo CRM (Recomendado)
                        </Button>
                      </div>

                      {fileError && (
                        <div className="alert alert-danger max-w-2xl mx-auto mt-4 rounded-3">
                          <h5 className="alert-heading fw-bold">Erro de Processamento</h5>
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
                              Base de Dados: <span className="fw-semibold text-dark">{fileName}</span>
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
 
                      <Nav variant="pills" fill className="bg-white p-2 rounded-4 shadow-lg mb-4">
                        <Nav.Item>
                          <Nav.Link active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} className="gap-2 d-flex align-items-center justify-content-center">
                            <LayoutDashboard size={18} /> Dashboard
                          </Nav.Link>
                        </Nav.Item>
                        <Nav.Item>
                          <Nav.Link active={activeTab === 'geo'} onClick={() => setActiveTab('geo')} className="gap-2 d-flex align-items-center justify-content-center">
                            <Map size={18} /> Geografia
                          </Nav.Link>
                        </Nav.Item>
                        <Nav.Item>
                          <Nav.Link active={activeTab === 'clients'} onClick={() => setActiveTab('clients')} className="gap-2 d-flex align-items-center justify-content-center">
                            <Building2 size={18} /> Clientes
                          </Nav.Link>
                        </Nav.Item>
                        <Nav.Item>
                          <Nav.Link active={activeTab === 'chat'} onClick={() => setActiveTab('chat')} className="gap-2 d-flex align-items-center justify-content-center">
                            <MessageSquare size={18} /> Chat com IA
                          </Nav.Link>
                        </Nav.Item>
                      </Nav>
 
                      {activeTab === 'dashboard' && <Dashboard data={data} />}
                      {activeTab === 'geo' && <GeoDashboard data={data} />}
                      {activeTab === 'clients' && <ClientDashboard data={data} />}
                      {activeTab === 'chat' && (
                        <>
                          {chatHistory.length === 0 && (
                            <div className="text-center p-5">
                              <h4>Vamos analisar seus dados?</h4>
                              <p className="text-muted mb-4">A IA vai ler toda a sua base e gerar insights estratégicos.</p>
                              <Button onClick={handleGenerateAnalysis} disabled={isChatLoading} size="lg" className="d-flex align-items-center gap-2 mx-auto">
                                <Sparkles size={20} />
                                {isChatLoading ? 'Gerando...' : 'Gerar Análise Completa'}
                              </Button>

                              <p className="text-muted small mt-4 mb-2">Ou pergunte algo:</p>
                              <div className="d-flex flex-wrap gap-2 justify-content-center">
                                {[
                                  'Qual o ranking de vendedores por receita?',
                                  'Quais os principais motivos de perda?',
                                  'Como está a taxa de conversão por funil?',
                                  'Qual foi o melhor mês em vendas?',
                                ].map(q => (
                                  <Button
                                    key={q}
                                    variant="outline-secondary"
                                    size="sm"
                                    className="rounded-pill"
                                    disabled={isChatLoading}
                                    onClick={() => handleSendMessage(q)}
                                  >
                                    {q}
                                  </Button>
                                ))}
                              </div>
                            </div>
                          )}
                          <ChatUI history={chatHistory} onSendMessage={handleSendMessage} isLoading={isChatLoading} />
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </Container>
      </main>
    </div>
  );
};
 
export default App;