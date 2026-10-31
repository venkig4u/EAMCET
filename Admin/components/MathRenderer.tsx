'use client';

import React, { useMemo } from 'react';
import katex from 'katex';

interface MathRendererProps {
  content: string;
  className?: string;
  inline?: boolean;
}

export default function MathRenderer({ content, className = '', inline = false }: MathRendererProps) {
  const renderedHtml = useMemo(() => {
    if (!content) return '';

    // Regex to detect math parts: $$...$$ for display math, $...$ for inline math
    const parts = content.split(/(\$\$[\s\S]+?\$\$|\$[^\$]+?\$)/g);

    return parts.map((part) => {
      if (part.startsWith('$$') && part.endsWith('$$')) {
        const math = part.slice(2, -2).trim();
        try {
          return katex.renderToString(math, {
            displayMode: true,
            throwOnError: false,
            strict: false,
          });
        } catch {
          return `<span class="text-red-500 font-mono">${math}</span>`;
        }
      } else if (part.startsWith('$') && part.endsWith('$')) {
        const math = part.slice(1, -1).trim();
        try {
          return katex.renderToString(math, {
            displayMode: false,
            throwOnError: false,
            strict: false,
          });
        } catch {
          return `<span class="text-red-500 font-mono">${math}</span>`;
        }
      } else {
        // Return escaped HTML for plain text, preserving newlines
        return part
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/\n/g, '<br/>');
      }
    }).join('');
  }, [content]);

  if (inline) {
    return (
      <span
        className={`math-rendered-inline ${className}`}
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
      />
    );
  }

  return (
    <div
      className={`math-rendered-block ${className}`}
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
    />
  );
}
