import { useState, useRef, useEffect } from 'react';
import type { ChatMessage } from '../types';
import { callAgent } from '../hooks/api';

interface Props {
  filterContext: string;
  onAgentSQL?: (sql: string) => void;
}

function formatContent(text: string): JSX.Element[] {
  const lines = text.split('\n');
  const elements: JSX.Element[] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];
  let listItems: { text: string; ordered: boolean; idx: number }[] = [];

  const flushList = () => {
    if (listItems.length === 0) return;
    const ordered = listItems[0].ordered;
    const Tag = ordered ? 'ol' : 'ul';
    elements.push(
      <Tag key={`list-${elements.length}`}>
        {listItems.map((li, i) => (
          <li key={i}>{inlineFormat(li.text)}</li>
        ))}
      </Tag>
    );
    listItems = [];
  };

  const inlineFormat = (s: string): JSX.Element | string => {
    // Bold
    const parts = s.split(/\*\*(.*?)\*\*/g);
    if (parts.length > 1) {
      return (
        <>
          {parts.map((p, i) =>
            i % 2 === 1 ? <strong key={i}>{p}</strong> : formatInlineCode(p, i)
          )}
        </>
      );
    }
    return formatInlineCode(s, 0);
  };

  const formatInlineCode = (s: string, baseKey: number): JSX.Element | string => {
    const parts = s.split(/`([^`]+)`/g);
    if (parts.length > 1) {
      return (
        <>
          {parts.map((p, i) =>
            i % 2 === 1 ? <code key={`${baseKey}-${i}`}>{p}</code> : p
          )}
        </>
      );
    }
    return s;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code blocks
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <pre key={`code-${i}`}>
            <code>{codeLines.join('\n')}</code>
          </pre>
        );
        codeLines = [];
        inCodeBlock = false;
      } else {
        flushList();
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    // Headers
    const headerMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headerMatch) {
      flushList();
      const level = headerMatch[1].length;
      const Tag = `h${level}` as keyof JSX.IntrinsicElements;
      elements.push(<Tag key={`h-${i}`}>{inlineFormat(headerMatch[2])}</Tag>);
      continue;
    }

    // Unordered list
    if (/^[-*]\s+/.test(line)) {
      if (listItems.length > 0 && listItems[0].ordered) flushList();
      listItems.push({ text: line.replace(/^[-*]\s+/, ''), ordered: false, idx: i });
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(line)) {
      if (listItems.length > 0 && !listItems[0].ordered) flushList();
      listItems.push({ text: line.replace(/^\d+\.\s+/, ''), ordered: true, idx: i });
      continue;
    }

    flushList();

    // Empty line
    if (line.trim() === '') continue;

    // Regular paragraph
    elements.push(<p key={`p-${i}`}>{inlineFormat(line)}</p>);
  }

  flushList();

  return elements;
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
            <p style={{ fontSize: 12 }}>Try: "How many Kmart customers in NSW are aged 25-40?"</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`chat-msg ${msg.role}`}>
            {msg.role === 'assistant' ? (
              <>
                {formatContent(msg.content)}
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
