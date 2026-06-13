import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { parseApiError } from "../../api/errors.js";
import { Button } from "../ui/Button.jsx";
import { Modal } from "../ui/Modal.jsx";
import { cn } from "../../lib/cn.js";

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = {
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/vnd.ms-excel": [".xls"],
};

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {(file: File, onProgress: (n: number) => void) => Promise<object>} props.onUpload
 */
export function POExcelUploadModal({ open, onClose, onUpload }) {
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [uploadErrors, setUploadErrors] = useState([]);

  const reset = useCallback(() => {
    setFile(null);
    setProgress(0);
    setUploadResult(null);
    setUploadErrors([]);
  }, []);

  const handleClose = useCallback(() => {
    if (uploading) return;
    reset();
    onClose();
  }, [uploading, onClose, reset]);

  const onDrop = useCallback((accepted, rejected) => {
    if (rejected.length) return;
    const f = accepted[0];
    if (f && f.size <= MAX_BYTES) {
      setFile(f);
      setUploadResult(null);
      setUploadErrors([]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPT,
    maxFiles: 1,
    maxSize: MAX_BYTES,
    disabled: uploading,
  });

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setProgress(0);
    try {
      const body = await onUpload(file, setProgress);
      const summary = body.summary ?? body;
      setUploadResult(summary);
      setUploadErrors(body.errors ?? []);
      setFile(null);
    } catch (err) {
      setUploadErrors([{ row: "—", field: "upload", message: parseApiError(err).message }]);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <Modal open={open} onClose={handleClose} title="Upload SAP PO Excel" className="max-w-lg">
      <div
        {...getRootProps()}
        className={cn(
          "rounded-lg border-2 border-dashed p-8 text-center transition-colors cursor-pointer",
          isDragActive ? "border-accent bg-blue-50" : "border-slate-300"
        )}
      >
        <input {...getInputProps()} />
        <p className="text-3xl mb-2" aria-hidden="true">
          📄
        </p>
        {file ? (
          <div>
            <p className="text-sm font-medium text-navy">{file.name}</p>
            <p className="text-xs text-slate-500 mt-1">{formatFileSize(file.size)}</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-600">
              Drag & drop BAR-code Excel here (.xlsx / .xls)
            </p>
            <p className="text-xs text-slate-500 mt-1">Max 10MB</p>
            <p className="text-xs text-slate-500 mt-2">
              PO rows are linked to vendors onboarded in Admin → Vendors (SAP vendor code must
              match).
            </p>
          </>
        )}
      </div>

      {uploading && (
        <div className="mt-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full bg-accent transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-slate-500 mt-1">Processing… {progress}%</p>
        </div>
      )}

      {uploadResult && (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs space-y-1">
          <p>✅ {uploadResult.inserted ?? 0} rows inserted</p>
          <p>🔄 {uploadResult.updated ?? 0} rows updated</p>
          <p>❌ {uploadResult.errors ?? 0} errors</p>
          {uploadResult.vendors_not_onboarded?.length > 0 && (
            <p className="text-amber-800">
              Not onboarded (add in Admin → Vendors first):{" "}
              <span className="font-mono">{uploadResult.vendors_not_onboarded.join(", ")}</span>
            </p>
          )}
          {uploadResult.vendors_processed?.length > 0 && (
            <p>
              Vendors processed:{" "}
              <span className="font-mono">{uploadResult.vendors_processed.join(", ")}</span>
            </p>
          )}
          {uploadResult.pos_created?.length > 0 && (
            <p>
              POs: <span className="font-mono">{uploadResult.pos_created.join(", ")}</span>
            </p>
          )}
        </div>
      )}

      {uploadErrors.length > 0 && (
        <div className="mt-3 max-h-40 overflow-auto rounded border border-red-200 text-xs">
          <table className="min-w-full">
            <thead className="bg-red-50 sticky top-0">
              <tr>
                <th className="px-2 py-1 text-left">Row</th>
                <th className="px-2 py-1 text-left">Field</th>
                <th className="px-2 py-1 text-left">Error</th>
              </tr>
            </thead>
            <tbody>
              {uploadErrors.map((e, i) => (
                <tr key={i} className="border-t border-red-100 text-red-800">
                  <td className="px-2 py-1">{e.row}</td>
                  <td className="px-2 py-1 font-mono">{e.field}</td>
                  <td className="px-2 py-1">{e.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={handleClose} disabled={uploading}>
          Close
        </Button>
        <Button type="button" size="sm" loading={uploading} disabled={!file} onClick={handleUpload}>
          Upload & Process
        </Button>
      </div>
    </Modal>
  );
}
