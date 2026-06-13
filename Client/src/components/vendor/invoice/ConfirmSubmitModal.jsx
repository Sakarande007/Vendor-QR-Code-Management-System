import { Modal } from "../../ui/Modal.jsx";
import { Button } from "../../ui/Button.jsx";

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {() => void} props.onConfirm
 * @param {boolean} props.loading
 */
export function ConfirmSubmitModal({ open, onClose, onConfirm, loading }) {
  return (
    <Modal open={open} onClose={onClose} title="Generate invoice & QR code?">
      <p className="text-sm text-slate-600">
        This will submit your invoice for processing and generate a QR code. You will not be able
        to edit quantities after submission.
      </p>
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button type="button" onClick={onConfirm} loading={loading}>
          Confirm & generate QR
        </Button>
      </div>
    </Modal>
  );
}
