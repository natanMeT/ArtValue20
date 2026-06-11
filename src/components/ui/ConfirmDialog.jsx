import Modal from './Modal.jsx';

export default function ConfirmDialog({ open, onClose, onConfirm, title = 'אישור מחיקה', message, confirmLabel = 'מחיקה', danger = true }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      maxWidth={420}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>ביטול</button>
          <button
            className={danger ? 'btn btn-danger' : 'btn btn-primary'}
            onClick={() => {
              onConfirm?.();
              onClose?.();
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="muted" style={{ fontSize: '0.95rem', lineHeight: 1.6 }}>{message}</p>
    </Modal>
  );
}
