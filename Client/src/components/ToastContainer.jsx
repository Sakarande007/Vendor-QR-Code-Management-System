import { useContext } from "react";
import { AppContext } from "../context/AppContext.jsx";
import "./ToastContainer.css";

export function ToastContainer() {
  const { toasts, dismissToast } = useContext(AppContext);

  if (!toasts?.length) {
    return null;
  }

  return (
    <div className="toast-container" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.type}`}>
          <span className="toast__message">{toast.message}</span>
          <button
            type="button"
            className="toast__dismiss"
            onClick={() => dismissToast(toast.id)}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
