import {
  agencyWorkspaceAccessFromEntitlements,
  monitoringAccessFromEntitlements,
  offerCatalog
} from "../../shared/offers.js";
import { dodoMonitoringCheckoutConfigStatus } from "../../shared/dodo.js";

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
  return offerCatalog({
    monitoringCheckoutReady: await monitoringCheckoutReady(env),
    ...options,
    entitlements
  });
}

async function monitoringAccessForOwner(env, ownerEmail, activeCount = 0) {
  const entitlements = await offerEntitlementsForOwner(env, ownerEmail);
  return monitoringAccessFromEntitlements(entitlements, activeCount, {
    checkoutLive: await monitoringCheckoutReady(env)
  });
}

async function agencyWorkspaceAccessForOwner(env, ownerEmail, usage = {}) {
  const entitlements = await offerEntitlementsForOwner(env, ownerEmail);
  return agencyWorkspaceAccessFromEntitlements(entitlements, usage);
}

async function monitoringCheckoutReady(env = {}) {
  if (!dodoMonitoringCheckoutConfigStatus(env).checkoutReady) return false;
  return monitoringEntitlementSchemaReady(env);
}

async function monitoringEntitlementSchemaReady(env = {}) {
  if (!env.WAITLIST_DB) return false;
  try {
    await env.WAITLIST_DB.prepare(
      "SELECT owner_email, offer_key, subscription_id, limits_json, revoked_at FROM offer_entitlements LIMIT 1"
    ).first();
    await env.WAITLIST_DB.prepare(
      "SELECT owner_email, offer_key, event FROM offer_entitlement_events LIMIT 1"
    ).first();
    return true;
  } catch {
    return false;
  }
}

export {
  agencyWorkspaceAccessForOwner,
  offerCatalogForOwner,
  offerEntitlementsForOwner,
  monitoringAccessForOwner,
  monitoringCheckoutReady
};
