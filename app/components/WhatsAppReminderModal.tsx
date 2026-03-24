'use client';

import React from 'react';

type Props = {
  open: boolean;
  message: string;
  copied: boolean;
  onCopy: () => Promise<void>;
  onClose: () => void;
};

export default function WhatsAppReminderModal({
  open,
  message,
  copied,
  onCopy,
  onClose,
}: Props) {
  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        zIndex: 1200,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 720,
          background: 'white',
          borderRadius: 20,
          padding: 20,
          border: '1px solid #e5e7eb',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        <h3 style={{ marginTop: 0, marginBottom: 12 }}>WhatsApp Reminder</h3>

        <div style={{ color: '#64748b', marginBottom: 12 }}>
          Copiá este mensaje y pegalo en el grupo.
        </div>

        <textarea
          value={message}
          readOnly
          rows={8}
          style={{
            width: '100%',
            padding: '12px 14px',
            borderRadius: 12,
            border: '1px solid #d1d5db',
            resize: 'vertical',
            fontFamily: 'Arial, sans-serif',
            fontSize: 14,
            lineHeight: 1.5,
            background: '#f8fafc',
          }}
        />

        <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid #d1d5db',
              background: 'white',
              cursor: 'pointer',
            }}
          >
            Cerrar
          </button>

          <button
            onClick={onCopy}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: 'none',
              background: '#111827',
              color: 'white',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  );
}
