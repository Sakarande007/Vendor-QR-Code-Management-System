const STEPS = [
  { id: 1, label: "Select PO" },
  { id: 2, label: "Invoice Details" },
  { id: 3, label: "Review & Submit" },
];

/**
 * @param {object} props
 * @param {number} props.currentStep
 */
export function InvoiceWizardSteps({ currentStep }) {
  return (
    <nav aria-label="Invoice creation progress" className="mb-8">
      <ol className="flex items-center justify-between gap-2">
        {STEPS.map((step, index) => {
          const done = currentStep > step.id;
          const active = currentStep === step.id;
          return (
            <li key={step.id} className="flex flex-1 items-center">
              <div className="flex flex-col items-center flex-1">
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ${
                    done
                      ? "bg-accent text-white"
                      : active
                        ? "bg-navy text-white ring-4 ring-accent/20"
                        : "bg-slate-200 text-slate-500"
                  }`}
                  aria-current={active ? "step" : undefined}
                >
                  {done ? "✓" : step.id}
                </span>
                <span
                  className={`mt-1 hidden text-center text-xs font-medium sm:block ${
                    active ? "text-navy" : "text-slate-500"
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {index < STEPS.length - 1 && (
                <div
                  className={`mx-1 h-0.5 flex-1 ${done ? "bg-accent" : "bg-slate-200"}`}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
