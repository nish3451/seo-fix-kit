import {
  agencyWorkspaceAccessFromEntitlements,
  monitoringAccessFromEntitlements,
  offerCatalog
} from "../../shared/offers.js";

async function offerEntitlementsForOwner(env, ownerEmail) {
  if (!env.WAITLIST_DB || !ownerEmail) return [];
  try {
    const rows = await env.WAITLIST_DB.prepare(
      `SELECT *
       FROM offer_entitlements
       WHERE owner_email = ?
         AND revoked_at IS NULL
       ORDER BY updated_at DESC
       LIMIT 20`
    )
      .bind(ownerEmail)
      .all();
    return rows.results || [];
  } catch {
    return [];
  }
}

async function offerCatalogForOwner(env, ownerEmail, options = {}) {
  const entitlements = await offerEntitlementsForOwner(env, ownerEmail);
  return offerCatalog({ ...options, entitlements });
}

async function monitoringAccessForOwner(env, ownerEmail, activeCount = 0) {
  const entitlements = await offerEntitlementsForOwner(env, ownerEmail);
  return monitoringAccessFromEntitlements(entitlements, activeCount);
}

async function agencyWorkspaceAccessForOwner(env, ownerEmail, usage = {}) {
  const entitlements = await offerEntitlementsForOwner(env, ownerEmail);
  return agencyWorkspaceAccessFromEntitlements(entitlements, usage);
}

export {
  agencyWorkspaceAccessForOwner,
  offerCatalogForOwner,
  offerEntitlementsForOwner,
  monitoringAccessForOwner
};
