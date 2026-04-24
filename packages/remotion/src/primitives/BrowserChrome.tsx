import React from 'react';

export interface BrowserChromeProps {
  url: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export const BrowserChrome: React.FC<BrowserChromeProps> = ({ url, children, style }) => (
  <div
    style={{
      borderRadius: 16,
      overflow: 'hidden',
      boxShadow: '0 40px 80px rgba(0,0,0,0.25)',
      background: '#fff',
      ...style,
    }}
  >
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 14px',
        background: '#f2f3f5',
        borderBottom: '1px solid #e2e4e8',
      }}
    >
      <div style={{ width: 12, height: 12, borderRadius: 6, background: '#ff5f57' }} />
      <div style={{ width: 12, height: 12, borderRadius: 6, background: '#febc2e' }} />
      <div style={{ width: 12, height: 12, borderRadius: 6, background: '#28c840' }} />
      <div
        style={{
          flex: 1,
          marginLeft: 16,
          padding: '4px 12px',
          background: '#fff',
          borderRadius: 8,
          fontSize: 14,
          color: '#6b6f76',
          fontFamily: 'monospace',
        }}
      >
        {url}
      </div>
    </div>
    <div style={{ position: 'relative' }}>{children}</div>
  </div>
);
