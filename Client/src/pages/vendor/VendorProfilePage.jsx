import { useAuth } from "../../hooks/useAuth.js";

export function VendorProfilePage() {
  const { user } = useAuth();

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm max-w-lg">
      <h2 className="text-lg font-semibold text-navy">My Profile</h2>
      <dl className="mt-6 space-y-4">
        <div>
          <dt className="text-xs font-medium uppercase text-slate-500">Email</dt>
          <dd className="mt-1 text-sm text-navy">{user?.email}</dd>
        </div>
        {user?.vendorCode && (
          <div>
            <dt className="text-xs font-medium uppercase text-slate-500">Vendor code</dt>
            <dd className="mt-1 font-mono text-sm text-navy">{user.vendorCode}</dd>
          </div>
        )}
        {user?.vendor?.vendorName && (
          <div>
            <dt className="text-xs font-medium uppercase text-slate-500">Company</dt>
            <dd className="mt-1 text-sm text-navy">{user.vendor.vendorName}</dd>
          </div>
        )}
        <div>
          <dt className="text-xs font-medium uppercase text-slate-500">Role</dt>
          <dd className="mt-1 text-sm capitalize text-navy">{user?.role}</dd>
        </div>
      </dl>
      <p className="mt-6 text-sm text-slate-500">
        Profile editing will be available in a future update.
      </p>
    </div>
  );
}
