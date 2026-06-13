import "dotenv/config";
import { ensureInvoiceSchema } from "../utils/ensureInvoiceSchema.js";
import { closePool } from "../config/db.js";

await ensureInvoiceSchema();
await closePool();
console.log("Invoice schema check complete.");
