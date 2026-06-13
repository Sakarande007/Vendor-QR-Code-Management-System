import apiClient from "./apiClient.js";
import { unwrapResponse } from "./errors.js";

// ─── Plants ──────────────────────────────────────────────────────────────────

export async function getPlants() {
  const response = await apiClient.get("/api/masters/plants");
  return unwrapResponse(response);
}

export async function createPlant(payload) {
  const response = await apiClient.post("/api/masters/plants", payload);
  return unwrapResponse(response);
}

export async function updatePlant(plantCode, payload) {
  const response = await apiClient.put(
    `/api/masters/plants/${encodeURIComponent(plantCode)}`,
    payload
  );
  return unwrapResponse(response);
}

export async function deletePlant(plantCode) {
  const response = await apiClient.delete(
    `/api/masters/plants/${encodeURIComponent(plantCode)}`
  );
  return unwrapResponse(response);
}

// ─── Storage locations ───────────────────────────────────────────────────────

/**
 * @param {string} plantCode
 */
export async function getStorageLocations(plantCode) {
  const response = await apiClient.get("/api/masters/storage-locations", {
    params: { plantCode },
  });
  return unwrapResponse(response);
}

export async function createStorageLocation(payload) {
  const response = await apiClient.post("/api/masters/storage-locations", payload);
  return unwrapResponse(response);
}

export async function updateStorageLocation(id, payload) {
  const response = await apiClient.put(`/api/masters/storage-locations/${id}`, payload);
  return unwrapResponse(response);
}

// ─── Materials ───────────────────────────────────────────────────────────────

export async function getMaterials(params = {}) {
  const response = await apiClient.get("/api/masters/materials", { params });
  return unwrapResponse(response);
}

export async function getMaterialByCode(materialCode) {
  const response = await apiClient.get(
    `/api/masters/materials/${encodeURIComponent(materialCode)}`
  );
  return unwrapResponse(response);
}

export async function createMaterial(payload) {
  const response = await apiClient.post("/api/masters/materials", payload);
  return unwrapResponse(response);
}

export async function updateMaterial(materialCode, payload) {
  const response = await apiClient.put(
    `/api/masters/materials/${encodeURIComponent(materialCode)}`,
    payload
  );
  return unwrapResponse(response);
}

/**
 * @param {{ materials: object[] }} payload
 */
export async function bulkImportMaterials(payload) {
  const response = await apiClient.post("/api/masters/materials/bulk-import", payload);
  return unwrapResponse(response);
}
