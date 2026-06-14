import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { parseApiError } from "../../api/errors.js";
import * as vendorApi from "../../api/vendorApi.js";
import { usePODetailQuery } from "../../hooks/queries/usePODetailQuery.js";
import { usePersistInvoiceMutation } from "../../hooks/queries/useInvoiceMutations.js";
import { useAuth } from "../../hooks/useAuth.js";
import { useApp } from "../../hooks/useApp.js";
import { InvoiceWizardSteps } from "../../components/vendor/invoice/InvoiceWizardSteps.jsx";
import { POSelector } from "../../components/vendor/invoice/POSelector.jsx";
import { InvoiceLineItemsEditor } from "../../components/vendor/invoice/InvoiceLineItemsEditor.jsx";
import { InvoiceLinesReadOnly } from "../../components/vendor/invoice/InvoiceLinesReadOnly.jsx";
import { ConfirmSubmitModal } from "../../components/vendor/invoice/ConfirmSubmitModal.jsx";
import { Input } from "../../components/ui/Input.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { Alert } from "../../components/ui/Alert.jsx";
import { Spinner } from "../../components/ui/Spinner.jsx";
import { formatDate } from "../../lib/format.js";
import { todayInputDate, toInputDate } from "../../lib/dates.js";
import {
  createInvoiceWizardSchema,
  getActiveInvoiceLines,
  toCreateInvoicePayload,
  validateInvoiceLineQty,
} from "../../validation/invoiceSchemas.js";

/**
 * @param {object[]} poLines
 * @param {string} plantCode
 */
function mapPoLinesToForm(poLines, plantCode) {
  return poLines.map((line) => ({
    poLineNo: line.lineNo,
    materialCode: line.materialCode,
    materialDescription: line.materialDescription,
    pendingQty: line.pendingQty,
    maxInvoiceQty: line.pendingQty,
    currentInvoicedQty: 0,
    selected: line.pendingQty > 0.001,
    invoiceQty: "",
    uom: line.uom,
    storageLocationCode: line.storageLocationCode,
    plantCode,
    unitPrice: Number(line.unitPrice ?? 0),
    isDisabled: line.pendingQty <= 0.001,
  }));
}

export function CreateInvoicePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialPo = searchParams.get("po") ?? "";
  const { user } = useAuth();
  const { showToast } = useApp();

  const [step, setStep] = useState(1);
  const [submitMode, setSubmitMode] = useState(null);
  const persistMutation = usePersistInvoiceMutation();
  const submitting = persistMutation.isPending;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [existingAppendInvoice, setExistingAppendInvoice] = useState(null);
  const submitLockRef = useRef(false);

  const [selectedPo, setSelectedPo] = useState(initialPo);

  const {
    data: poDetails,
    isLoading: loadingPo,
    error: poQueryError,
    refetch: refetchPo,
  } = usePODetailQuery(selectedPo, { enabled: Boolean(selectedPo) });

  const poDateInput = poDetails?.header?.poDate ? toInputDate(poDetails.header.poDate) : null;
  const schema = useMemo(() => createInvoiceWizardSchema(poDateInput), [poDateInput]);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    trigger,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: {
      poNumber: initialPo,
      invoiceNumber: "",
      invoiceDate: todayInputDate(),
      lines: [],
    },
  });

  const poNumber = watch("poNumber");
  const watchedLines = watch("lines");
  const invoiceNumber = watch("invoiceNumber");
  const invoiceDate = watch("invoiceDate");

  const poLoadError = poQueryError ? parseApiError(poQueryError).message : null;
  const loadedPoRef = useRef(null);
  const existingInvoiceLimitsRef = useRef(null);

  useEffect(() => {
    if (!poDetails?.header || !selectedPo) return;
    if (poDetails.header.poNumber !== selectedPo) return;
    if (loadedPoRef.current === selectedPo) return;

    loadedPoRef.current = selectedPo;
    reset({
      poNumber: selectedPo,
      invoiceNumber: "",
      invoiceDate: todayInputDate(),
      lines: mapPoLinesToForm(poDetails.lines ?? [], poDetails.header.plantCode),
    });
  }, [poDetails, selectedPo, reset]);

  useEffect(() => {
    const num = String(invoiceNumber ?? "").trim();
    if (!num || !selectedPo) {
      setExistingAppendInvoice(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const result = await vendorApi.getMyInvoices({ search: num, pageSize: 50 });
        const match = (result.invoices ?? []).find(
          (inv) =>
            inv.invoiceNumber === num &&
            inv.poNumber === selectedPo &&
            ["submitted", "qr_generated", "verified"].includes(inv.status)
        );
        if (!cancelled) setExistingAppendInvoice(match ?? null);
      } catch {
        if (!cancelled) setExistingAppendInvoice(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [invoiceNumber, selectedPo]);

  useEffect(() => {
    if (!existingAppendInvoice?.invoiceId || !watchedLines?.length) {
      existingInvoiceLimitsRef.current = null;
      return;
    }

    if (existingInvoiceLimitsRef.current === existingAppendInvoice.invoiceId) {
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const detail = await vendorApi.getInvoiceDetails(existingAppendInvoice.invoiceId);
        if (cancelled) return;

        const invoicedMap = new Map(
          (detail.lines ?? []).map((line) => [line.poLineNo, Number(line.invoiceQty)])
        );

        watchedLines.forEach((line, index) => {
          const currentInvoiced = invoicedMap.get(line.poLineNo) ?? 0;
          const maxInvoiceQty =
            Math.round((Number(line.pendingQty) + currentInvoiced) * 1000) / 1000;
          setValue(`lines.${index}.currentInvoicedQty`, currentInvoiced, {
            shouldValidate: true,
          });
          setValue(`lines.${index}.maxInvoiceQty`, maxInvoiceQty, { shouldValidate: true });
        });

        existingInvoiceLimitsRef.current = existingAppendInvoice.invoiceId;
      } catch {
        /* ignore lookup errors */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [existingAppendInvoice, watchedLines, setValue]);

  const handlePoChange = (poNum) => {
    loadedPoRef.current = null;
    setValue("poNumber", poNum, { shouldValidate: true });
    setSelectedPo(poNum);
  };

  const hasLineErrors = useMemo(() => {
    return getActiveInvoiceLines(watchedLines ?? []).some(
      (line) => !validateInvoiceLineQty(line).valid
    );
  }, [watchedLines]);

  const activeLineCount = getActiveInvoiceLines(watchedLines ?? []).length;
  const hasInvoiceNumber = Boolean(String(invoiceNumber ?? "").trim());
  const canProceedStep2 =
    activeLineCount > 0 && !hasLineErrors && hasInvoiceNumber;

  const goNext = async () => {
    setApiError(null);
    if (step === 1) {
      if (!poNumber) {
        await trigger("poNumber");
        return;
      }
      if (!poDetails || poDetails.header?.poNumber !== poNumber) {
        const { data, error } = await refetchPo();
        if (error || !data) {
          return;
        }
      }
      if (poLoadError) return;
      setStep(2);
      return;
    }
    if (step === 2) {
      const valid = await trigger();
      if (!valid || hasLineErrors) return;
      setStep(3);
    }
  };

  const goBack = () => {
    setApiError(null);
    setStep((s) => Math.max(1, s - 1));
  };

  const persistInvoice = async (mode) => {
    if (submitLockRef.current || !poDetails?.header) return;
    submitLockRef.current = true;
    setSubmitMode(mode);
    setApiError(null);

    try {
      const values = watch();
      const payload = toCreateInvoicePayload(values, poDetails.header.plantCode);
      const { invoiceId, partialAppend, regeneratedFromRejected } =
        await persistMutation.mutateAsync({ payload, mode });

      if (mode === "submit") {
        showToast(
          regeneratedFromRejected
            ? "Invoice regenerated and QR code updated."
            : partialAppend
              ? "Invoice quantities updated and QR code regenerated."
              : "Invoice submitted and QR code generated.",
          "success"
        );
      } else {
        showToast("Invoice saved as draft.", "success");
      }

      navigate(`/invoices/${invoiceId}`, { replace: true });
    } catch (err) {
      const parsed = parseApiError(err);
      setApiError(parsed.message);
      showToast(parsed.message, "error");
      submitLockRef.current = false;
    } finally {
      setSubmitMode(null);
      setConfirmOpen(false);
    }
  };

  const onSaveDraft = handleSubmit(() => persistInvoice("draft"));
  const onConfirmGenerate = () => persistInvoice("submit");

  const handleGenerateClick = handleSubmit(async () => {
    const valid = await trigger();
    if (!valid || hasLineErrors) {
      showToast("Fix validation errors before submitting.", "error");
      return;
    }
    setConfirmOpen(true);
  });

  const handleQtyChange = (index, value) => {
    setValue(`lines.${index}.invoiceQty`, value, { shouldValidate: true });
  };

  const handleLineSelect = (index, selected) => {
    setValue(`lines.${index}.selected`, selected, { shouldValidate: true, shouldDirty: true });
    if (!selected) {
      setValue(`lines.${index}.invoiceQty`, "", { shouldValidate: true, shouldDirty: true });
    }
  };

  const maxDate = todayInputDate();
  const minDate = poDateInput ?? undefined;

  return (
    <div className="mx-auto max-w-5xl">
      <InvoiceWizardSteps currentStep={step} />

      {apiError && (
        <Alert variant="error" className="mb-6" onDismiss={() => setApiError(null)}>
          {apiError}
        </Alert>
      )}

      {step === 1 && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
          <h2 className="text-lg font-semibold text-navy">Select purchase order</h2>
          <POSelector
            value={poNumber}
            onChange={handlePoChange}
            error={errors.poNumber?.message}
          />
          {loadingPo && (
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Spinner size="sm" />
              Loading PO details…
            </div>
          )}

          {poLoadError && (
            <Alert variant="error" title="Could not load PO">
              {poLoadError}
            </Alert>
          )}

          {poDetails?.header && !loadingPo && (
            <div className="rounded-lg bg-slate-50 p-4 text-sm">
              <p className="font-medium text-navy">Selected PO summary</p>
              <dl className="mt-3 grid gap-2 sm:grid-cols-3">
                <div>
                  <dt className="text-slate-500">PO Number</dt>
                  <dd className="font-mono font-medium">{poDetails.header.poNumber}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Date</dt>
                  <dd>{formatDate(poDetails.header.poDate)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Plant</dt>
                  <dd>{poDetails.header.plantName || poDetails.header.plantCode}</dd>
                </div>
              </dl>
            </div>
          )}

          <div className="flex justify-end">
            <Button type="button" onClick={goNext} disabled={loadingPo}>
              Continue
            </Button>
          </div>
        </section>
      )}

      {step === 2 && poDetails && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
          <h2 className="text-lg font-semibold text-navy">Invoice details</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Vendor invoice number"
              required
              placeholder="Your tax invoice number"
              helperText="Use a unique invoice number. Reuse the same number on this PO only to update quantities on an existing invoice."
              error={errors.invoiceNumber?.message}
              {...register("invoiceNumber")}
            />
            <Input
              label="Invoice date"
              type="date"
              required
              max={maxDate}
              min={minDate}
              error={errors.invoiceDate?.message}
              {...register("invoiceDate")}
            />
          </div>

          {existingAppendInvoice && (
            <Alert variant="warning" title="Existing invoice">
              Invoice <strong>{invoiceNumber}</strong> already exists for this PO. Enter the
              <strong> total quantity</strong> you want on each line (not an additional amount).
              You can invoice up to the available balance plus what is already on this invoice.
            </Alert>
          )}

          {errors.lines?.message && (
            <p className="text-sm text-red-600" role="alert">
              {errors.lines.message}
            </p>
          )}

          <p className="text-sm text-slate-600">
            Select materials and enter the total invoice quantity per line. Partial quantities are
            allowed up to the available PO balance.
          </p>

          <InvoiceLineItemsEditor
            lines={watchedLines ?? []}
            register={register}
            errors={errors}
            selectable
            onLineSelect={handleLineSelect}
            onQtyChange={handleQtyChange}
            onQtyBlur={(index) => trigger(`lines.${index}.invoiceQty`)}
          />

          {!canProceedStep2 && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 space-y-1">
              {!hasInvoiceNumber && (
                <span className="block">Enter your <strong>vendor invoice number</strong>.</span>
              )}
              {activeLineCount === 0 && (
                <span className="block">
                  Check <strong>Include</strong> on at least one line and enter invoice quantity
                  (partial qty allowed up to pending).
                </span>
              )}
              {hasLineErrors && activeLineCount > 0 && (
                <span className="block">
                  Fix quantity errors — each qty must be &gt; 0 and ≤ available balance (partial
                  invoicing allowed).
                </span>
              )}
            </p>
          )}

          <div className="flex justify-between gap-3">
            <Button type="button" variant="secondary" onClick={goBack}>
              Back
            </Button>
            <Button type="button" onClick={goNext} disabled={!canProceedStep2}>
              Review
            </Button>
          </div>
        </section>
      )}

      {step === 3 && poDetails && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
          <h2 className="text-lg font-semibold text-navy">Review & submit</h2>

          <dl className="grid gap-4 sm:grid-cols-2 text-sm">
            <div>
              <dt className="text-slate-500">Vendor invoice number</dt>
              <dd className="font-medium text-navy">{invoiceNumber}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Invoice date</dt>
              <dd className="font-medium text-navy">{formatDate(invoiceDate)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">PO number</dt>
              <dd className="font-mono font-medium">{poDetails.header.poNumber}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Vendor</dt>
              <dd>
                {user?.vendor?.vendorName || user?.email}
                {user?.vendorCode && (
                  <span className="block font-mono text-xs text-slate-500">{user.vendorCode}</span>
                )}
              </dd>
            </div>
          </dl>

          <InvoiceLinesReadOnly
            lines={getActiveInvoiceLines(watchedLines ?? [])}
            highlightIssues
          />

          <div className="flex flex-wrap justify-between gap-3">
            <Button type="button" variant="secondary" onClick={goBack} disabled={submitting}>
              Back
            </Button>
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={onSaveDraft}
                loading={submitting && submitMode === "draft"}
                disabled={submitting}
              >
                Save as Draft
              </Button>
              <Button
                type="button"
                onClick={handleGenerateClick}
                loading={submitting && submitMode === "submit"}
                disabled={submitting || hasLineErrors}
              >
                Generate Invoice & QR
              </Button>
            </div>
          </div>
        </section>
      )}

      <ConfirmSubmitModal
        open={confirmOpen}
        onClose={() => !submitting && setConfirmOpen(false)}
        onConfirm={onConfirmGenerate}
        loading={submitting && submitMode === "submit"}
      />
    </div>
  );
}
