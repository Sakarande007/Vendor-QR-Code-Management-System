import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { parseApiError } from "../../api/errors.js";
import { useAdminVendorsQuery } from "../../hooks/queries/useAdminVendorsQuery.js";
import {
  useCreateVendorMutation,
  useResetVendorPasswordMutation,
  useToggleVendorStatusMutation,
  useUpdateVendorMutation,
} from "../../hooks/queries/useAdminMutations.js";
import { DataTable } from "../../components/admin/DataTable.jsx";
import { AdminSlideOver } from "../../components/admin/AdminSlideOver.jsx";
import { ApiErrorState } from "../../components/vendor/ApiErrorState.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { Input } from "../../components/ui/Input.jsx";
import { Modal } from "../../components/ui/Modal.jsx";
import { Badge } from "../../components/ui/Badge.jsx";
import { useApp } from "../../hooks/useApp.js";
import { useDebounce } from "../../hooks/useDebounce.js";

const vendorSchema = z.object({
  vendorCode: z
    .string()
    .min(1)
    .max(20)
    .regex(/^[A-Za-z0-9_-]+$/, "Alphanumeric code only"),
  vendorName: z.string().min(1).max(255),
  email: z.string().email(),
  address: z.string().max(5000).optional().or(z.literal("")),
  gstNo: z.string().max(20).optional().or(z.literal("")),
  contactPerson: z.string().max(100).optional().or(z.literal("")),
  phone: z.string().max(20).optional().or(z.literal("")),
  status: z.enum(["active", "inactive"]).default("active"),
  password: z
    .string()
    .optional()
    .refine((v) => !v || v.length >= 8, "Password must be at least 8 characters"),
});

const editSchema = vendorSchema.omit({ vendorCode: true });

export function VendorManagementPage() {
  const { showToast } = useApp();
  const [page, setPage] = useState(1);
  const [cursorStack, setCursorStack] = useState([null]);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  const [addOpen, setAddOpen] = useState(false);
  const [editVendor, setEditVendor] = useState(null);
  const [toggleTarget, setToggleTarget] = useState(null);
  const [credentials, setCredentials] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [resetPassword, setResetPassword] = useState("");

  const createMutation = useCreateVendorMutation();
  const updateMutation = useUpdateVendorMutation();
  const toggleMutation = useToggleVendorStatusMutation();
  const resetPasswordMutation = useResetVendorPasswordMutation();
  const saving =
    createMutation.isPending ||
    updateMutation.isPending ||
    toggleMutation.isPending ||
    resetPasswordMutation.isPending;

  const addForm = useForm({
    resolver: zodResolver(vendorSchema),
    defaultValues: { status: "active" },
  });

  const editForm = useForm({
    resolver: zodResolver(editSchema),
  });

  const pageSize = 20;
  const cursor = cursorStack[page - 1] ?? null;

  const { data, isLoading, error, refetch } = useAdminVendorsQuery({
    cursor,
    search: debouncedSearch,
    pageSize,
  });

  const vendors = data?.vendors ?? [];
  const totalCount = data?.totalCount ?? 0;
  const hasMore = data?.pagination?.hasMore ?? false;
  const nextCursor = data?.pagination?.nextCursor ?? null;
  const errorMessage = error ? parseApiError(error).message : null;

  useEffect(() => {
    setCursorStack([null]);
    setPage(1);
  }, [debouncedSearch]);

  const goNext = () => {
    if (!hasMore || !nextCursor) return;
    setCursorStack((prev) => [...prev, nextCursor]);
    setPage((p) => p + 1);
  };

  const goPrev = () => {
    if (page <= 1) return;
    setCursorStack((stack) => stack.slice(0, -1));
    setPage((p) => p - 1);
  };

  const openEdit = (vendor) => {
    setEditVendor(vendor);
    editForm.reset({
      vendorName: vendor.vendorName,
      email: vendor.email,
      address: vendor.address ?? "",
      gstNo: vendor.gstNo ?? "",
      contactPerson: vendor.contactPerson ?? "",
      phone: vendor.phone ?? "",
    });
  };

  const showLoginCredentials = (data) => {
    const creds = data?.login_credentials ?? data?.loginCredentials;
    if (!creds) return;
    setCredentials({
      vendorCode: data.vendor_code ?? data.vendorCode,
      vendorName: data.vendor_name ?? data.vendorName,
      email: data.email,
      username: creds.username,
      password: creds.temporary_password ?? creds.temporaryPassword,
      note: creds.note,
    });
  };

  const onCreate = async (values) => {
    try {
      const result = await createMutation.mutateAsync({
        vendorCodeSap: values.vendorCode,
        vendorName: values.vendorName,
        email: values.email,
        password: values.password?.trim() || undefined,
        address: values.address || null,
        gstNo: values.gstNo || null,
        contactPerson: values.contactPerson || null,
        phone: values.phone || null,
        status: values.status,
      });
      showToast("Vendor created", "success");
      setAddOpen(false);
      addForm.reset({ status: "active" });
      setCursorStack([null]);
      setPage(1);
      showLoginCredentials(result);
    } catch (err) {
      showToast(parseApiError(err).message, "error");
    }
  };

  const onResetPassword = async () => {
    if (!resetTarget) return;
    try {
      const result = await resetPasswordMutation.mutateAsync({
        vendorCode: resetTarget.vendorCode,
        password: resetPassword.trim() || undefined,
      });
      showToast("Password updated", "success");
      setResetTarget(null);
      setResetPassword("");
      showLoginCredentials(result);
    } catch (err) {
      showToast(parseApiError(err).message, "error");
    }
  };

  const onUpdate = async (values) => {
    if (!editVendor) return;
    try {
      await updateMutation.mutateAsync({
        vendorCode: editVendor.vendorCode,
        payload: {
          ...values,
          address: values.address || null,
          gstNo: values.gstNo || null,
          contactPerson: values.contactPerson || null,
          phone: values.phone || null,
        },
      });
      showToast("Vendor updated", "success");
      setEditVendor(null);
    } catch (err) {
      showToast(parseApiError(err).message, "error");
    }
  };

  const onToggleStatus = async () => {
    if (!toggleTarget) return;
    const next = toggleTarget.status === "active" ? "inactive" : "active";
    try {
      await toggleMutation.mutateAsync({
        vendorCode: toggleTarget.vendorCode,
        status: next,
      });
      showToast(`Vendor ${next}`, "success");
      setToggleTarget(null);
    } catch (err) {
      showToast(parseApiError(err).message, "error");
    }
  };

  if (errorMessage && !vendors.length) {
    return <ApiErrorState message={errorMessage} onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-[220px] flex-1 max-w-md">
          <Input
            label="Search vendors"
            placeholder="Name or code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button type="button" size="sm" onClick={() => setAddOpen(true)}>
          Add vendor
        </Button>
      </div>

      <DataTable
        dense
        loading={isLoading}
        columns={[
          { key: "vendorCode", label: "Code", sortable: true, filterable: true },
          { key: "vendorName", label: "Name", sortable: true, filterable: true },
          { key: "email", label: "Email", sortable: true },
          { key: "status", label: "Status", sortable: true },
          { key: "userCount", label: "Users", sortable: true },
          { key: "actions", label: "Actions" },
        ]}
        data={vendors}
        exportFilename="vendors.csv"
        pagination={{
          page,
          pageSize,
          totalCount,
          hasMore,
          loading: isLoading,
          onPrevious: goPrev,
          onNext: goNext,
        }}
        renderRow={(row) => (
          <tr key={row.vendorCode} className="hover:bg-slate-50/80">
            <td className="px-3 py-2 font-mono text-xs">{row.vendorCode}</td>
            <td className="px-3 py-2 text-xs">{row.vendorName}</td>
            <td className="px-3 py-2 text-xs">{row.email}</td>
            <td className="px-3 py-2">
              <Badge status={row.status}>{row.status}</Badge>
            </td>
            <td className="px-3 py-2 text-xs tabular-nums">{row.userCount ?? 0}</td>
            <td className="px-3 py-2">
              <div className="flex gap-1">
                <Button type="button" variant="ghost" size="sm" onClick={() => openEdit(row)}>
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setResetTarget(row);
                    setResetPassword("");
                  }}
                >
                  Set password
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setToggleTarget(row)}
                >
                  {row.status === "active" ? "Deactivate" : "Activate"}
                </Button>
              </div>
            </td>
          </tr>
        )}
      />

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add vendor">
        <form onSubmit={addForm.handleSubmit(onCreate)} className="space-y-3">
          <Input label="Vendor code" error={addForm.formState.errors.vendorCode?.message} {...addForm.register("vendorCode")} />
          <Input label="Name" error={addForm.formState.errors.vendorName?.message} {...addForm.register("vendorName")} />
          <Input label="Email" type="email" error={addForm.formState.errors.email?.message} {...addForm.register("email")} />
          <Input
            label="Login password"
            type="password"
            autoComplete="new-password"
            placeholder="Leave blank to auto-generate"
            helperText="Min 8 chars, uppercase, digit, special (@#$!%*?). Vendor must change on first login."
            error={addForm.formState.errors.password?.message}
            {...addForm.register("password")}
          />
          <Input label="GST No" {...addForm.register("gstNo")} />
          <Input label="Contact person" {...addForm.register("contactPerson")} />
          <Input label="Phone" {...addForm.register("phone")} />
          <Input label="Address" {...addForm.register("address")} />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Create
            </Button>
          </div>
        </form>
      </Modal>

      <AdminSlideOver open={!!editVendor} onClose={() => setEditVendor(null)} title="Edit vendor">
        {editVendor && (
          <form onSubmit={editForm.handleSubmit(onUpdate)} className="space-y-3">
            <p className="text-xs text-slate-500">Code: {editVendor.vendorCode}</p>
            <Input label="Name" error={editForm.formState.errors.vendorName?.message} {...editForm.register("vendorName")} />
            <Input label="Email" type="email" error={editForm.formState.errors.email?.message} {...editForm.register("email")} />
            <Input label="GST No" {...editForm.register("gstNo")} />
            <Input label="Contact person" {...editForm.register("contactPerson")} />
            <Input label="Phone" {...editForm.register("phone")} />
            <Input label="Address" {...editForm.register("address")} />
            <Button type="submit" loading={saving} fullWidth>
              Save changes
            </Button>
          </form>
        )}
      </AdminSlideOver>

      <Modal
        open={!!credentials}
        onClose={() => setCredentials(null)}
        title="Vendor login credentials"
      >
        {credentials && (
          <div className="space-y-3 text-sm">
            <p className="text-slate-600">
              Share these with <strong>{credentials.vendorName}</strong>. The vendor must change
              the password on first login.
            </p>
            <dl className="rounded-lg bg-slate-50 p-3 space-y-2 font-mono text-xs">
              <div>
                <dt className="text-slate-500">Vendor code (login)</dt>
                <dd className="text-navy font-semibold">{credentials.username}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Email (alternate login)</dt>
                <dd>{credentials.email}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Password</dt>
                <dd className="text-navy font-semibold">{credentials.password}</dd>
              </div>
            </dl>
            {credentials.note && (
              <p className="text-xs text-slate-500">{credentials.note}</p>
            )}
            <div className="flex justify-end">
              <Button type="button" onClick={() => setCredentials(null)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!resetTarget}
        onClose={() => {
          setResetTarget(null);
          setResetPassword("");
        }}
        title="Set vendor password"
      >
        {resetTarget && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Set a new password for vendor <strong>{resetTarget.vendorCode}</strong> (
              {resetTarget.vendorName}). Leave blank to auto-generate.
            </p>
            <Input
              label="New password"
              type="password"
              autoComplete="new-password"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              placeholder="Optional — auto-generate if empty"
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setResetTarget(null);
                  setResetPassword("");
                }}
              >
                Cancel
              </Button>
              <Button type="button" loading={resetPasswordMutation.isPending} onClick={onResetPassword}>
                Save password
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!toggleTarget}
        onClose={() => setToggleTarget(null)}
        title={toggleTarget?.status === "active" ? "Deactivate vendor?" : "Activate vendor?"}
      >
        <p className="text-sm text-slate-600">
          {toggleTarget?.status === "active"
            ? `Deactivate ${toggleTarget?.vendorName}? Users will lose access.`
            : `Reactivate ${toggleTarget?.vendorName}?`}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => setToggleTarget(null)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={toggleTarget?.status === "active" ? "danger" : "primary"}
            loading={saving}
            onClick={onToggleStatus}
          >
            Confirm
          </Button>
        </div>
      </Modal>
    </div>
  );
}
