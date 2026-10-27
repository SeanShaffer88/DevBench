import React from 'react';
import { CheckCircle2, ShieldAlert, XCircle } from 'lucide-react';
import { useWorkbench } from '../context/WorkbenchContext';

export const ConsentModal: React.FC = () => {
  const { pendingConsent, resolveConsent } = useWorkbench();
  if (!pendingConsent) return null;

  const { request } = pendingConsent;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="consent-modal-title"
    >
      <div className="modal-panel" style={{ maxWidth: 620, padding: 20 }}>
        <div className="flex-row" style={{ marginBottom: 10 }}>
          <ShieldAlert size={22} style={{ color: 'var(--warning)' }} />
          <h2 id="consent-modal-title" style={{ margin: 0, fontSize: '1.1rem' }}>
            {request.title}
          </h2>
        </div>

        <p className="muted" style={{ marginTop: 0 }}>
          {request.description}
        </p>

        <div className="stack-sm" style={{ marginBottom: 16 }}>
          <div className="flex-row">
            <span className="badge badge-warn">Impact Scope: {request.impactScope}</span>
            <span className="badge">Action Type: {request.actionType}</span>
          </div>

          {request.commandPreview && (
            <div className="card-elevated">
              <div className="muted" style={{ fontSize: '0.76rem', marginBottom: 4 }}>
                Command / Operation Preview {request.cwd ? `(cwd: ${request.cwd})` : ''}
              </div>
              <code className="mono" style={{ wordBreak: 'break-all', color: 'var(--accent)' }}>
                {request.commandPreview}
              </code>
            </div>
          )}

          <div className="card-elevated" style={{ fontSize: '0.85rem' }}>
            <strong>Recovery & Reversibility:</strong> {request.reversibleNote}
          </div>
        </div>

        <div className="flex-between" style={{ justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" className="btn" onClick={() => resolveConsent(false)}>
            <XCircle size={15} /> Decline
          </button>
          <button
            type="button"
            className="btn btn-primary"
            autoFocus
            onClick={() => resolveConsent(true)}
          >
            <CheckCircle2 size={15} /> Approve & Run
          </button>
        </div>
      </div>
    </div>
  );
};
