import { Alert } from "../ui/Alert.jsx";
import { Button } from "../ui/Button.jsx";

/**
 * @param {object} props
 * @param {string} props.message
 * @param {() => void} [props.onRetry]
 * @param {boolean} [props.retrying]
 */
export function ApiErrorState({ message, onRetry, retrying = false }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <Alert variant="error" title="Unable to load data" className="mb-6 text-left">
        {message}
      </Alert>
      {onRetry && (
        <Button type="button" onClick={onRetry} loading={retrying} variant="secondary">
          Try again
        </Button>
      )}
    </div>
  );
}

