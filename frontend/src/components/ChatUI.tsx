import React, { useState, useRef, useEffect } from 'react';
import type { ChatMessage } from '../types/types.ts';
import { Send, User, Bot } from 'lucide-react';
import { Form, Button, InputGroup, Card } from 'react-bootstrap';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatUIProps {
  history: ChatMessage[];
  onSendMessage: (message: string) => void;
  isLoading: boolean;
}

// Componentes para renderizar o markdown da IA (tabelas, listas, links) com estilo Bootstrap
const mdComponents = {
  table: ({ node, ...props }: any) => (
    <div className="table-responsive my-2">
      <table className="table table-sm table-bordered align-middle mb-0" {...props} />
    </div>
  ),
  a: ({ node, ...props }: any) => <a target="_blank" rel="noopener noreferrer" {...props} />,
  h1: ({ node, ...props }: any) => <h4 className="fw-bold mt-2 mb-2" {...props} />,
  h2: ({ node, ...props }: any) => <h5 className="fw-bold mt-2 mb-2" {...props} />,
  h3: ({ node, ...props }: any) => <h6 className="fw-semibold mt-2 mb-1" {...props} />,
  p: ({ node, ...props }: any) => <p className="mb-2" {...props} />,
};

const ChatUI: React.FC<ChatUIProps> = ({ history, onSendMessage, isLoading }) => {
  const [input, setInput] = useState('');
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [history]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  return (
    <Card className="shadow-lg d-flex flex-column" style={{ height: '70vh' }}>
      <Card.Body
        ref={chatContainerRef}
        className="flex-grow-1 p-3"
        style={{ overflowY: 'auto' }}
      >
        <div className="d-grid gap-3">
          {history.map((msg, index) => (
            <div key={index} className={`d-flex align-items-start gap-3 ${msg.role === 'user' ? 'justify-content-end' : ''}`}>
              {msg.role === 'model' && (
                <div className="flex-shrink-0 p-2 rounded-circle bg-primary-subtle d-flex">
                  <Bot className="text-primary" size={20} />
                </div>
              )}
              <div className={`p-3 rounded-3 mw-75 ${msg.role === 'user' ? 'bg-primary text-white' : 'bg-light text-dark'}`}>
                {msg.content === '' && isLoading ? (
                  <span className="typing-indicator" aria-label="Gerando resposta">
                    <span></span><span></span><span></span>
                  </span>
                ) : msg.role === 'user' ? (
                  <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
                ) : (
                  <div className="chat-bubble-content">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
              {msg.role === 'user' && (
                <div className="flex-shrink-0 p-2 rounded-circle bg-secondary-subtle d-flex">
                  <User className="text-secondary" size={20} />
                </div>
              )}
            </div>
          ))}
        </div>
      </Card.Body>

      <Card.Footer className="p-3 border-top-0 bg-white">
        <Form onSubmit={handleSubmit}>
          <InputGroup>
            <Form.Control
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Faça uma pergunta sobre os dados..."
              disabled={isLoading}
              size="lg"
            />
            <Button type="submit" disabled={isLoading || !input.trim()}>
              <Send size={20} />
            </Button>
          </InputGroup>
        </Form>
      </Card.Footer>
    </Card>
  );
};

export default ChatUI;
