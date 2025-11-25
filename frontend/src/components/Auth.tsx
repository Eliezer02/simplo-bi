import React, { useState } from 'react';
import { supabase } from '../services/supabase';
import { Card, Form, Button, Alert, Container } from 'react-bootstrap';

export const Auth: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [message, setMessage] = useState<{type: 'error'|'success', text: string} | null>(null);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage({ type: 'success', text: 'Cadastro realizado! Verifique seu e-mail ou faça login.' });
        setIsSignUp(false); 
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Erro na autenticação.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container className="d-flex align-items-center justify-content-center bg-light" style={{ minHeight: '100vh' }}>
      <Card className="shadow-lg p-4 border-0" style={{ maxWidth: '400px', width: '100%' }}>
        <div className="text-center mb-4">
           <h3 className="fw-bold text-dark">Simplo CRM <span className="text-primary">BI</span></h3>
           <p className="text-muted small">{isSignUp ? 'Crie sua conta para começar' : 'Faça login para acessar'}</p>
        </div>

        {message && <Alert variant={message.type === 'error' ? 'danger' : 'success'}>{message.text}</Alert>}
        
        <Form onSubmit={handleAuth}>
          <Form.Group className="mb-3">
            <Form.Label>Email</Form.Label>
            <Form.Control type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="seu@email.com" />
          </Form.Group>
          <Form.Group className="mb-4">
            <Form.Label>Senha</Form.Label>
            <Form.Control type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="******" minLength={6} />
          </Form.Group>
          <Button disabled={loading} className="w-100 mb-3 fw-bold" type="submit" size="lg">
            {loading ? 'Carregando...' : (isSignUp ? 'Cadastrar' : 'Entrar')}
          </Button>
        </Form>
        <div className="text-center">
          <Button variant="link" onClick={() => setIsSignUp(!isSignUp)} className="text-decoration-none text-muted">
            {isSignUp ? 'Já tem conta? Faça login' : 'Não tem conta? Cadastre-se'}
          </Button>
        </div>
      </Card>
    </Container>
  );
};