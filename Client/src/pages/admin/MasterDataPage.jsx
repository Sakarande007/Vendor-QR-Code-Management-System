import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as masterApi from "../../api/masterApi.js";
import { usePlantsQuery } from "../../hooks/queries/usePlantsQuery.js";
import { useMaterialsQuery } from "../../hooks/queries/useMaterialsQuery.js";
import { useStorageLocationsQuery } from "../../hooks/queries/useStorageLocationsQuery.js";
import { queryKeys } from "../../lib/queryKeys.js";
import { parseApiError } from "../../api/errors.js";
import { DataTable } from "../../components/admin/DataTable.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { Input } from "../../components/ui/Input.jsx";
import { Modal } from "../../components/ui/Modal.jsx";
import { useApp } from "../../hooks/useApp.js";
import { downloadCsv } from "../../lib/csvExport.js";
import { formatCurrency } from "../../lib/format.js";
import { cn } from "../../lib/cn.js";

const TABS = [
  { id: "plants", label: "Plants" },
  { id: "materials", label: "Materials" },
  { id: "storage", label: "Storage Locations" },
];

const PLANT_TEMPLATE = "plantCode,plantName,companyCode,status\n1000,Main Plant,1000,active";
const MATERIAL_TEMPLATE =
  "materialCode,materialDescription,uom,unitPrice,materialType,status\nMAT001,Sample Material,EA,10.50,RAW,active";
const STORAGE_TEMPLATE = "plantCode,storageLocationCode,description\n1000,SL01,Main store";

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim());
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]));
  });
}

export function MasterDataPage() {
  const { showToast } = useApp();
  const qc = useQueryClient();
  const [tab, setTab] = useState("plants");
  const [plantCodeFilter, setPlantCodeFilter] = useState("");
  const [editRow, setEditRow] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: plants = [], isLoading: plantsLoading } = usePlantsQuery();
  const { data: materialsData, isLoading: materialsLoading } = useMaterialsQuery({
    pageSize: 100,
  });
  const materials = materialsData?.materials ?? [];
  const storagePlantCode = plantCodeFilter || plants[0]?.plantCode || "";
  const { data: storage = [], isLoading: storageLoading } = useStorageLocationsQuery(
    storagePlantCode
  );
  const loading = plantsLoading || materialsLoading || storageLoading;

  const invalidateMasters = () => {
    qc.invalidateQueries({ queryKey: queryKeys.plants });
    qc.invalidateQueries({ queryKey: ["masters", "materials"] });
    if (storagePlantCode) {
      qc.invalidateQueries({ queryKey: queryKeys.storageLocations(storagePlantCode) });
    }
  };

  const downloadTemplate = () => {
    const templates = {
      plants: PLANT_TEMPLATE,
      materials: MATERIAL_TEMPLATE,
      storage: STORAGE_TEMPLATE,
    };
    const blob = new Blob([templates[tab]], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${tab}-import-template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const savePlant = async (row, isNew) => {
    setSaving(true);
    try {
      if (isNew) {
        await masterApi.createPlant(row);
      } else {
        await masterApi.updatePlant(row.plantCode, {
          plantName: row.plantName,
          companyCode: row.companyCode,
          status: row.status,
        });
      }
      showToast("Plant saved", "success");
      setEditRow(null);
      setAddOpen(false);
      invalidateMasters();
    } catch (err) {
      showToast(parseApiError(err).message, "error");
    } finally {
      setSaving(false);
    }
  };

  const saveMaterial = async (row, isNew) => {
    setSaving(true);
    try {
      if (isNew) {
        await masterApi.createMaterial(row);
      } else {
        const priceRaw = row.unitPriceInput ?? String(row.unitPrice ?? "");
        const unitPrice =
          priceRaw === "" || priceRaw === "." ? 0 : Number.parseFloat(priceRaw);

        await masterApi.updateMaterial(row.materialCode, {
          materialDescription: row.materialDescription,
          uom: row.uom,
          unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
          materialType: row.materialType,
          status: row.status,
        });
      }
      showToast("Material saved", "success");
      setEditRow(null);
      setAddOpen(false);
      invalidateMasters();
    } catch (err) {
      showToast(parseApiError(err).message, "error");
    } finally {
      setSaving(false);
    }
  };

  const saveStorage = async (row, isNew) => {
    setSaving(true);
    try {
      if (isNew) {
        await masterApi.createStorageLocation(row);
      } else {
        await masterApi.updateStorageLocation(row.id, {
          description: row.description,
          storageLocationCode: row.storageLocationCode,
        });
      }
      showToast("Storage location saved", "success");
      setEditRow(null);
      setAddOpen(false);
      invalidateMasters();
    } catch (err) {
      showToast(parseApiError(err).message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleBulkImport = async () => {
    setSaving(true);
    try {
      const rows = parseCsv(importText);
      if (tab === "materials") {
        await masterApi.bulkImportMaterials({ materials: rows });
      } else if (tab === "plants") {
        for (const row of rows) {
          await masterApi.createPlant({
            plantCode: row.plantCode,
            plantName: row.plantName,
            companyCode: row.companyCode,
            status: row.status || "active",
          });
        }
      } else {
        for (const row of rows) {
          await masterApi.createStorageLocation({
            plantCode: row.plantCode,
            storageLocationCode: row.storageLocationCode,
            description: row.description,
          });
        }
      }
      showToast("Import completed", "success");
      setImportOpen(false);
      invalidateMasters();
    } catch (err) {
      showToast(parseApiError(err).message, "error");
    } finally {
      setSaving(false);
    }
  };

  const renderInlinePlant = (row) => {
    const isEdit = editRow?.plantCode === row.plantCode;
    const data = isEdit ? editRow : row;
    return (
      <tr key={row.plantCode}>
        <td className="px-3 py-1">
          {isEdit ? (
            <input className="w-full rounded border px-1 text-xs" value={data.plantCode} disabled />
          ) : (
            row.plantCode
          )}
        </td>
        <td className="px-3 py-1">
          {isEdit ? (
            <input
              className="w-full rounded border px-1 text-xs"
              value={data.plantName}
              onChange={(e) => setEditRow({ ...data, plantName: e.target.value })}
            />
          ) : (
            row.plantName
          )}
        </td>
        <td className="px-3 py-1">
          {isEdit ? (
            <input
              className="w-full rounded border px-1 text-xs"
              value={data.companyCode}
              onChange={(e) => setEditRow({ ...data, companyCode: e.target.value })}
            />
          ) : (
            row.companyCode
          )}
        </td>
        <td className="px-3 py-1">
          {isEdit ? (
            <select
              className="rounded border text-xs"
              value={data.status}
              onChange={(e) => setEditRow({ ...data, status: e.target.value })}
            >
              <option value="active">active</option>
              <option value="inactive">inactive</option>
            </select>
          ) : (
            row.status
          )}
        </td>
        <td className="px-3 py-1">
          {isEdit ? (
            <Button type="button" size="sm" loading={saving} onClick={() => savePlant(data, false)}>
              Save
            </Button>
          ) : (
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditRow({ ...row })}>
              Edit
            </Button>
          )}
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "px-3 py-2 text-sm font-medium",
              tab === t.id
                ? "border-b-2 border-accent text-accent"
                : "text-slate-600 hover:text-navy"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => setAddOpen(true)}>
          Add row
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
          Bulk import
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={downloadTemplate}>
          Download template
        </Button>
        {tab === "storage" && (
          <select
            className="h-8 rounded border border-slate-200 px-2 text-sm"
            value={plantCodeFilter}
            onChange={(e) => setPlantCodeFilter(e.target.value)}
          >
            <option value="">Select plant</option>
            {plants.map((p) => (
              <option key={p.plantCode} value={p.plantCode}>
                {p.plantCode}
              </option>
            ))}
          </select>
        )}
      </div>

      {tab === "plants" && (
        <DataTable
          dense
          loading={loading}
          columns={[
            { key: "plantCode", label: "Code", sortable: true },
            { key: "plantName", label: "Name", sortable: true },
            { key: "companyCode", label: "Company", sortable: true },
            { key: "status", label: "Status", sortable: true },
            { key: "actions", label: "" },
          ]}
          data={plants}
          exportFilename="plants.csv"
          renderRow={renderInlinePlant}
        />
      )}

      {tab === "materials" && (
        <DataTable
          dense
          loading={loading}
          columns={[
            { key: "materialCode", label: "Code", sortable: true },
            { key: "materialDescription", label: "Description", sortable: true },
            { key: "uom", label: "UOM", sortable: true },
            { key: "unitPrice", label: "Price", sortable: true },
            { key: "status", label: "Status", sortable: true },
            { key: "actions", label: "" },
          ]}
          data={materials}
          exportFilename="materials.csv"
          renderRow={(row) => (
            <tr key={row.materialCode}>
              <td className="px-3 py-2 text-xs font-mono">{row.materialCode}</td>
              <td className="px-3 py-2 text-xs">{row.materialDescription}</td>
              <td className="px-3 py-2 text-xs">{row.uom}</td>
              <td className="px-3 py-2 text-xs tabular-nums">
                {formatCurrency(row.unitPrice ?? 0)}
              </td>
              <td className="px-3 py-2 text-xs">{row.status}</td>
              <td className="px-3 py-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setEditRow({
                      ...row,
                      unitPriceInput: String(row.unitPrice ?? ""),
                    })
                  }
                >
                  Edit
                </Button>
              </td>
            </tr>
          )}
        />
      )}

      {tab === "storage" && (
        <DataTable
          dense
          loading={loading}
          columns={[
            { key: "storageLocationCode", label: "Code", sortable: true },
            { key: "plantCode", label: "Plant", sortable: true },
            { key: "description", label: "Description", sortable: true },
            { key: "actions", label: "" },
          ]}
          data={storage}
          exportFilename="storage-locations.csv"
          renderRow={(row) => (
            <tr key={row.id}>
              <td className="px-3 py-2 text-xs font-mono">{row.storageLocationCode}</td>
              <td className="px-3 py-2 text-xs">{row.plantCode}</td>
              <td className="px-3 py-2 text-xs">{row.description ?? "—"}</td>
              <td className="px-3 py-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setEditRow({ ...row })}>
                  Edit
                </Button>
              </td>
            </tr>
          )}
        />
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title={`Add ${tab}`}>
        <p className="text-xs text-slate-500 mb-2">Use bulk import for many rows.</p>
        <Button type="button" size="sm" onClick={() => setImportOpen(true)}>
          Open import
        </Button>
      </Modal>

      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="Bulk import (CSV)">
        <textarea
          className="h-48 w-full rounded border p-2 font-mono text-xs"
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder="Paste CSV content…"
        />
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => setImportOpen(false)}>
            Cancel
          </Button>
          <Button type="button" loading={saving} onClick={handleBulkImport}>
            Import
          </Button>
        </div>
      </Modal>

      <Modal open={!!editRow && tab === "materials"} onClose={() => setEditRow(null)} title="Edit material">
        {editRow && tab === "materials" && (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              saveMaterial(editRow, false);
            }}
          >
            <Input label="Code" value={editRow.materialCode} disabled />
            <Input
              label="Description"
              value={editRow.materialDescription}
              onChange={(e) => setEditRow({ ...editRow, materialDescription: e.target.value })}
            />
            <Input
              label="UOM"
              value={editRow.uom}
              onChange={(e) => setEditRow({ ...editRow, uom: e.target.value })}
            />
            <Input
              label="Price"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={editRow.unitPriceInput ?? String(editRow.unitPrice ?? "")}
              onChange={(e) => {
                const raw = e.target.value;
                setEditRow({
                  ...editRow,
                  unitPriceInput: raw,
                  unitPrice: raw === "" || raw === "." ? 0 : Number(raw),
                });
              }}
            />
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Status</label>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
                value={editRow.status ?? "active"}
                onChange={(e) => setEditRow({ ...editRow, status: e.target.value })}
              >
                <option value="active">active</option>
                <option value="inactive">inactive</option>
              </select>
            </div>
            <Button type="submit" loading={saving}>
              Save
            </Button>
          </form>
        )}
      </Modal>
    </div>
  );
}
