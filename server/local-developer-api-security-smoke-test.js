import assert from "node:assert/strict";

process.env.NODE_ENV = "test";

const { app, resetLocalStateForTests, seedProtectedLocalAuditForTests } = await import("./index.js");

resetLocalStateForTests();

const server = await new Promise((resolve) => {
  const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
});

try {
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  const seeded = seedProtectedLocalAuditForTests({
    ownerEmail: "paid-owner@example.com",
    status: "paid"
  });

  const deleted = await fetch(`${origin}/v1/audits/${seeded.auditId}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${seeded.apiToken}` }
  });
  assert.equal(deleted.status, 409);
  const deletedBody = await deleted.json();
  assert.equal(deletedBody.code, "FIX_PACK_REPORT_LOCKED");
  assert.equal(deletedBody.fixRequestId, seeded.fixRequestId);

  const auditResponse = await fetch(`${origin}/v1/audits/${seeded.auditId}`, {
    headers: { authorization: `Bearer ${seeded.apiToken}` }
  });
  assert.equal(auditResponse.status, 200);
  const auditBody = await auditResponse.json();
  assert.equal(auditBody.audit.report_id, seeded.reportId);

  const reportResponse = await fetch(`${origin}/v1/audits/${seeded.auditId}/report`, {
    headers: { authorization: `Bearer ${seeded.apiToken}` }
  });
  assert.equal(reportResponse.status, 200);
  const reportBody = await reportResponse.json();
  assert.equal(reportBody.report.id, seeded.reportId);

  console.log(JSON.stringify({ ok: true, checked: "local developer API paid report delete lock" }, null, 2));
} finally {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}
