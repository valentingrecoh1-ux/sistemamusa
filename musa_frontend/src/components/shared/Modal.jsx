import s from './Modal.module.css';

export default function Modal({ title, onClose, children, footer, fullscreen }) {
  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={`${s.modal} ${fullscreen ? s.fullscreen : ''}`} onClick={e => e.stopPropagation()}>
        {title && (
          <div className={s.header}>
            <h3>{title}</h3>
            <button className={s.close} onClick={onClose}><i className="bi bi-x-lg" /></button>
          </div>
        )}
        <div className={fullscreen ? s.fullBody : s.body}>{children}</div>
        {footer && <div className={s.footer}>{footer}</div>}
      </div>
    </div>
  );
}
