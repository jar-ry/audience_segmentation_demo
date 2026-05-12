import { useState, useRef, useEffect } from 'react';
import type { ChatMessage } from '../types';
import { callAgent } from '../hooks/api';
import { formatMarkdown } from './FormatMarkdown';

interface Props {
  filterContext: string;
  onAgentSQL?: (sql: string) => void;
}

export default function ChatBox({ filterContext, onAgentSQL }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [expandedSQL, setExpandedSQL] = useState<Set<number>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    const augmented = filterContext
      ? `${text}\n\n[Current sidebar filters: ${filterContext}]`
      : text;

    const userMsg: ChatMessage = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const result = await callAgent(augmented);
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: result.text || 'I received a response but could not extract the text.',
        sql: result.sql,
        data: result.data,
        suggested: result.suggested,
      };
      setMessages((prev) => [...prev, assistantMsg]);

      if (result.sql && onAgentSQL) {
        onAgentSQL(result.sql);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const toggleSQL = (idx: number) => {
    setExpandedSQL((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <div className="chat-container">
      <div className="chat-messages">
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: 12, opacity: 0.4 }}>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <p style={{ fontSize: 14, marginBottom: 8 }}>Ask me about your audience</p>
            <p style={{ fontSize: 12 }}>Try: "How many customers in NSW with abandoned carts over $100?"</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`chat-msg ${msg.role}`}>
            {msg.role === 'assistant' ? (
              <>
                {formatMarkdown(msg.content)}
                {msg.sql && (
                  <>
                    <div className="sql-toggle" onClick={() => toggleSQL(i)}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        {expandedSQL.has(i) ? (
                          <polyline points="18 15 12 9 6 15" />
                        ) : (
                          <polyline points="6 9 12 15 18 9" />
                        )}
                      </svg>
                      {expandedSQL.has(i) ? 'Hide SQL' : 'Show SQL'}
                    </div>
                    {expandedSQL.has(i) && <div className="sql-block">{msg.sql}</div>}
                  </>
                )}
                {msg.suggested && msg.suggested.length > 0 && (
                  <div className="suggested-chips">
                    {msg.suggested.map((s, j) => (
                      <button
                        key={j}
                        className="suggested-chip"
                        onClick={() => sendMessage(s)}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              msg.content
            )}
          </div>
        ))}

        {loading && (
          <div className="thinking-bubble">
            <div className="thinking-dot" />
            <div className="thinking-dot" />
            <div className="thinking-dot" />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="chat-compose">
        <input
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              sendMessage(input);
            }
          }}
          placeholder="Ask about your audience..."
          disabled={loading}
        />
        <button
          className="btn btn-primary"
          onClick={() => sendMessage(input)}
          disabled={loading || !input.trim()}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
