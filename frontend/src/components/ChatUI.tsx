import React, { useState, useRef, useEffect } from 'react';
import type { ChatMessage } from '../types/types.ts';
import { Send, User, Bot } from 'lucide-react';
import { Form, Button, InputGroup, Spinner, Card } from 'react-bootstrap';

interface ChatUIProps {
  history: ChatMessage[];
  onSendMessage: (message: string) => void;
  isLoading: boolean;
}

const formatMessage = (content: string) => {
    const escapeHtml = (unsafe: string) => {
        return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }
    const safeContent = escapeHtml(content);
    return safeContent
      .replace(/# (.*)/g, '<h1 class="h4 fw-bold text-dark mt-3 mb-2">$1</h1>')
      .replace(/## (.*)/g, '<h2 class="h5 fw-semibold text-dark mt-3 mb-2">$1</h2>')
      .replace(/### (.*)/g, '<h3 class="h6 fw-semibold text-dark mt-2 mb-1">$1</h3>')
      .replace(/\*\*(.*?)\*\*/g, '<strong class="fw-semibold text-dark">$1</strong>')
      .replace(/\* (.*)/g, '<li>$1</li>')
      .replace(/^- (.*)/gm, '<li>$1</li>')
      .replace(/\n/g, '<br />');
};

const ChatUI: React.FC<ChatUIProps> = ({ history, onSendMessage, isLoading }) => {
  const [input, setInput] = useState('');
  const endOfMessagesRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {

    if (chatContainerRef.current) {
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [history]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSendMessage(input.trim()); setInput('');
    }
  };
  
  return (
 
    <Card className="shadow-lg d-flex flex-column" style={{height: '70vh'}}>
      
      {}
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
                {msg.content === '' && isLoading ? 
                  <Spinner animation="grow" size="sm" /> :
                  <div 
                    className="chat-bubble-content" 
                    dangerouslySetInnerHTML={{ __html: formatMessage(msg.content) }} 
                  />
                }
              </div>
              {msg.role === 'user' && (
                <div className="flex-shrink-0 p-2 rounded-circle bg-secondary-subtle d-flex">
                  <User className="text-secondary" size={20} />
                </div>
              )}
            </div>
          ))}
          <div ref={endOfMessagesRef} />
        </div>
      </Card.Body>

      {}
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