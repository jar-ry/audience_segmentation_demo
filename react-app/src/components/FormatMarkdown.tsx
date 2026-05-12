import React from 'react';

export function formatMarkdown(text: string): JSX.Element[] {
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

    const headerMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headerMatch) {
      flushList();
      const level = headerMatch[1].length;
      const Tag = `h${level}` as keyof React.JSX.IntrinsicElements;
      elements.push(React.createElement(Tag, { key: `h-${i}` }, inlineFormat(headerMatch[2])));
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      if (listItems.length > 0 && listItems[0].ordered) flushList();
      listItems.push({ text: line.replace(/^[-*]\s+/, ''), ordered: false, idx: i });
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      if (listItems.length > 0 && !listItems[0].ordered) flushList();
      listItems.push({ text: line.replace(/^\d+\.\s+/, ''), ordered: true, idx: i });
      continue;
    }

    flushList();

    if (line.trim() === '') continue;

    elements.push(<p key={`p-${i}`}>{inlineFormat(line)}</p>);
  }

  flushList();

  return elements;
}
