import { createRoot } from 'react-dom/client';
import DialogBox from './DialogBox';

function showDialog({ type, title, message, defaultValue }) {
  return new Promise((resolve) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const destroy = () => {
      setTimeout(() => {
        root.unmount();
        container.remove();
      }, 200);
    };

    root.render(
      <DialogBox
        type={type}
        title={title}
        message={message}
        defaultValue={defaultValue}
        onResolve={(value) => {
          destroy();
          resolve(value);
        }}
      />
    );
  });
}

export const dialog = {
  alert(titleOrMsg, msg) {
    const title = msg ? titleOrMsg : undefined;
    const message = msg || titleOrMsg;
    return showDialog({ type: 'alert', title, message });
  },
  confirm(titleOrMsg, msg) {
    const title = msg ? titleOrMsg : undefined;
    const message = msg || titleOrMsg;
    return showDialog({ type: 'confirm', title, message });
  },
  prompt(message, defaultValue) {
    return showDialog({ type: 'prompt', message, defaultValue: defaultValue || '' });
  },
};
