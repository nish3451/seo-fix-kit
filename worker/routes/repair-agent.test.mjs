import assert from "node:assert/strict";
import test from "node:test";
import {
  createRepairAction,
  getRepairActionImplementationPack,
  getRepairQueue,
  saveRepairQueue,
  updateRepairAction
} from "./repair-agent.js";

test("repair agent route derives queue rows and records approval-safe actions", async () => {
  const env = fakeRepairEnv();
  const reportId = "example-report-1";

  const queueResponse = await getRepairQueue(sessionRequest(`/api/reports/${reportId}/repair-queue`), env);
  assert.equal(queueResponse.status, 200);
  const queueBody = await queueResponse.json();
  assert.equal(queueBody.items.length, 1);
  assert.equal(queueBody.items[0].issueId, "issue-1");
  assert.equal(queueBody.items[0].status, "open");
  assert.equal(env.queueItems.length, 1);

  const actionResponse = await createRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions`, {
      method: "POST",
      body: JSON.stringify({
        issueId: "issue-1",
        actionMode: "cms_draft",
        proposedChange: "Draft the fixed title for review."
      })
    }),
    env
  );
  assert.equal(actionResponse.status, 201);
  const actionBody = await actionResponse.json();
  assert.equal(actionBody.action.approvalState, "drafted");
  assert.equal(actionBody.action.executionState, "not_started");
  assert.equal(env.actions.length, 1);
  assert.equal(env.queueItems[0].status, "drafted");
  assert.equal(env.queueItems[0].action_mode, "cms_draft");

  const approvedResponse = await updateRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions/${env.actions[0].id}`, {
      method: "PATCH",
      body: JSON.stringify({ approvalState: "approved" })
    }),
    env
  );
  assert.equal(approvedResponse.status, 200);
  const approvedBody = await approvedResponse.json();
  assert.equal(approvedBody.action.approvalState, "approved");
  assert.equal(env.queueItems[0].status, "approved");
  assert.equal(env.actions[0].execution_state, "not_started");

  const packResponse = await getRepairActionImplementationPack(
    sessionRequest(`/api/reports/${reportId}/repair-actions/${env.actions[0].id}/implementation.md`),
    env
  );
  assert.equal(packResponse.status, 200);
  assert.match(packResponse.headers.get("content-type") || "", /text\/markdown/);
  assert.equal(packResponse.headers.get("cache-control"), "no-store");
  assert.equal(packResponse.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.match(packResponse.headers.get("content-disposition") || "", /implementation-pack\.md/);
  const packMarkdown = await packResponse.text();
  assert.match(packMarkdown, /# SEOFixKit Implementation Pack/);
  assert.match(packMarkdown, /Missing title/);
  assert.match(packMarkdown, /Rendered title is missing/);
  assert.match(packMarkdown, /Draft the fixed title for review/);
  assert.match(packMarkdown, /Rerun Proof/);
  assert.doesNotMatch(packMarkdown, /checkoutUrl|sfk_beta_session|DODO_SEOFIXKIT_API_KEY/i);
});

test("repair action implementation pack requires owner-approved action", async () => {
  const env = fakeRepairEnv();
  const reportId = "example-report-1";
  await getRepairQueue(sessionRequest(`/api/reports/${reportId}/repair-queue`), env);
  await createRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions`, {
      method: "POST",
      body: JSON.stringify({ issueId: "issue-1", proposedChange: "Draft the fixed title for review." })
    }),
    env
  );

  const draftResponse = await getRepairActionImplementationPack(
    sessionRequest(`/api/reports/${reportId}/repair-actions/${env.actions[0].id}/implementation.md`),
    env
  );
  assert.equal(draftResponse.status, 409);
  assert.match((await draftResponse.json()).error, /Approve the repair action/i);

  await updateRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions/${env.actions[0].id}`, {
      method: "PATCH",
      body: JSON.stringify({ approvalState: "ignored" })
    }),
    env
  );
  const ignoredResponse = await getRepairActionImplementationPack(
    sessionRequest(`/api/reports/${reportId}/repair-actions/${env.actions[0].id}/implementation.md`),
    env
  );
  assert.equal(ignoredResponse.status, 409);
  assert.match((await ignoredResponse.json()).error, /Ignored repair actions/i);
});

test("repair action implementation pack fails closed for auth and stale queue state", async () => {
  const env = fakeRepairEnv();
  const reportId = "example-report-1";
  await getRepairQueue(sessionRequest(`/api/reports/${reportId}/repair-queue`), env);
  await createRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions`, {
      method: "POST",
      body: JSON.stringify({ issueId: "issue-1", proposedChange: "Draft the fixed title for review." })
    }),
    env
  );
  await updateRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions/${env.actions[0].id}`, {
      method: "PATCH",
      body: JSON.stringify({ approvalState: "approved" })
    }),
    env
  );

  const noSessionResponse = await getRepairActionImplementationPack(
    new Request(`https://seofixkit.test/api/reports/${reportId}/repair-actions/${env.actions[0].id}/implementation.md`),
    env
  );
  assert.equal(noSessionResponse.status, 401);

  env.actions[0].action_mode = "unsupported";
  const unsupportedResponse = await getRepairActionImplementationPack(
    sessionRequest(`/api/reports/${reportId}/repair-actions/${env.actions[0].id}/implementation.md`),
    env
  );
  assert.equal(unsupportedResponse.status, 409);
  assert.match((await unsupportedResponse.json()).error, /Unsupported repair actions/i);
  env.actions[0].action_mode = "self_serve";

  env.queueItems[0].status = "ignored";
  const ignoredItemResponse = await getRepairActionImplementationPack(
    sessionRequest(`/api/reports/${reportId}/repair-actions/${env.actions[0].id}/implementation.md`),
    env
  );
  assert.equal(ignoredItemResponse.status, 409);
  assert.match((await ignoredItemResponse.json()).error, /Ignored repair items/i);
  env.queueItems[0].status = "approved";

  env.actions[0].queue_item_id = "missing-queue-row";
  const staleQueueResponse = await getRepairActionImplementationPack(
    sessionRequest(`/api/reports/${reportId}/repair-actions/${env.actions[0].id}/implementation.md`),
    env
  );
  assert.equal(staleQueueResponse.status, 409);
  assert.match((await staleQueueResponse.json()).error, /Repair item not found/i);
});

test("repair action implementation pack is owner scoped", async () => {
  const env = fakeRepairEnv();
  const reportId = "example-report-1";
  await getRepairQueue(sessionRequest(`/api/reports/${reportId}/repair-queue`), env);
  await createRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions`, {
      method: "POST",
      body: JSON.stringify({ issueId: "issue-1", proposedChange: "Draft the fixed title for review." })
    }),
    env
  );
  await updateRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions/${env.actions[0].id}`, {
      method: "PATCH",
      body: JSON.stringify({ approvalState: "approved" })
    }),
    env
  );

  env.ownerEmail = "other@example.com";
  const response = await getRepairActionImplementationPack(
    sessionRequest(`/api/reports/${reportId}/repair-actions/${env.actions[0].id}/implementation.md`),
    env
  );
  assert.equal(response.status, 404);
});

test("repair action create does not persist when the queue row disappears", async () => {
  const env = fakeRepairEnv();
  const reportId = "example-report-1";
  await getRepairQueue(sessionRequest(`/api/reports/${reportId}/repair-queue`), env);
  env.dropQueueBeforeActionInsert = true;

  const response = await createRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions`, {
      method: "POST",
      body: JSON.stringify({ issueId: "issue-1", proposedChange: "Draft the fixed title for review." })
    }),
    env
  );

  assert.equal(response.status, 409);
  assert.equal(env.actions.length, 0);
  assert.equal(env.queueItems.length, 0);
});

test("repair action create clears stale rerun proof when reopening a fixed item", async () => {
  const env = fakeRepairEnv();
  const reportId = "example-report-1";
  await getRepairQueue(sessionRequest(`/api/reports/${reportId}/repair-queue`), env);
  env.queueItems[0].status = "fixed";
  env.queueItems[0].rerun_status = "fixed";
  env.queueItems[0].last_rerun_report_id = "rerun-report-1";

  const response = await createRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions`, {
      method: "POST",
      body: JSON.stringify({
        issueId: "issue-1",
        proposedChange: "Draft the corrected title again."
      })
    }),
    env
  );

  assert.equal(response.status, 201);
  assert.equal(env.queueItems[0].status, "drafted");
  assert.equal(env.queueItems[0].rerun_status, "not_run");
  assert.equal(env.queueItems[0].last_rerun_report_id, null);
});

test("repair action update does not persist when the queue row disappears", async () => {
  const env = fakeRepairEnv();
  const reportId = "example-report-1";
  await getRepairQueue(sessionRequest(`/api/reports/${reportId}/repair-queue`), env);
  await createRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions`, {
      method: "POST",
      body: JSON.stringify({ issueId: "issue-1", proposedChange: "Draft the fixed title for review." })
    }),
    env
  );
  env.dropQueueBeforeActionUpdate = true;

  const response = await updateRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions/${env.actions[0].id}`, {
      method: "PATCH",
      body: JSON.stringify({ approvalState: "approved" })
    }),
    env
  );

  assert.equal(response.status, 409);
  assert.equal(env.actions[0].approval_state, "drafted");
  assert.equal(env.queueItems.length, 0);
});

test("repair action ignored state closes the queue item", async () => {
  const env = fakeRepairEnv();
  const reportId = "example-report-1";
  await getRepairQueue(sessionRequest(`/api/reports/${reportId}/repair-queue`), env);
  await createRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions`, {
      method: "POST",
      body: JSON.stringify({ issueId: "issue-1", proposedChange: "Draft the fixed title for review." })
    }),
    env
  );

  const response = await updateRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions/${env.actions[0].id}`, {
      method: "PATCH",
      body: JSON.stringify({ approvalState: "ignored" })
    }),
    env
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.action.approvalState, "ignored");
  assert.equal(body.queue.items[0].status, "ignored");
  assert.equal(body.queue.counts.ignored, 1);
  assert.equal(env.queueItems[0].status, "ignored");
});

test("repair agent route rejects another owner's rerun report", async () => {
  const env = fakeRepairEnv();
  const reportId = "example-report-1";
  await getRepairQueue(sessionRequest(`/api/reports/${reportId}/repair-queue`), env);
  await createRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions`, {
      method: "POST",
      body: JSON.stringify({ issueId: "issue-1", proposedChange: "Draft the fixed title for review." })
    }),
    env
  );

  const applied = await updateRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions/${env.actions[0].id}`, {
      method: "PATCH",
      body: JSON.stringify({
        approvalState: "approved",
        executionState: "applied"
      })
    }),
    env
  );
  assert.equal(applied.status, 200);

  const response = await updateRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions/${env.actions[0].id}`, {
      method: "PATCH",
      body: JSON.stringify({
        rerunState: "fixed",
        rerunReportId: "other-report-1"
      })
    }),
    env
  );

  assert.equal(response.status, 404);
});

test("repair agent route rejects same-owner rerun proof from another host", async () => {
  const env = fakeRepairEnv();
  const reportId = "example-report-1";
  env.reports.push({
    id: "rerun-other-host-1",
    owner_email: "owner@example.com",
    owner_invite_id: null,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    created_at: new Date(Date.now() + 60_000).toISOString(),
    updated_at: new Date(Date.now() + 60_000).toISOString(),
    url: "https://other.example/",
    target_host: "other.example",
    report_json: JSON.stringify({ id: "rerun-other-host-1", url: "https://other.example/", findings: [], repairPlan: [] })
  });
  await getRepairQueue(sessionRequest(`/api/reports/${reportId}/repair-queue`), env);
  await createRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions`, {
      method: "POST",
      body: JSON.stringify({ issueId: "issue-1", proposedChange: "Draft the fixed title for review." })
    }),
    env
  );

  const applied = await updateRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions/${env.actions[0].id}`, {
      method: "PATCH",
      body: JSON.stringify({
        approvalState: "approved",
        executionState: "applied"
      })
    }),
    env
  );
  assert.equal(applied.status, 200);

  const response = await updateRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions/${env.actions[0].id}`, {
      method: "PATCH",
      body: JSON.stringify({
        rerunState: "fixed",
        rerunReportId: "rerun-other-host-1"
      })
    }),
    env
  );

  assert.equal(response.status, 404);
  assert.equal(env.queueItems[0].status, "applied");
});

test("repair agent route rejects source report as rerun proof", async () => {
  const env = fakeRepairEnv();
  const reportId = "example-report-1";
  await getRepairQueue(sessionRequest(`/api/reports/${reportId}/repair-queue`), env);
  await createRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions`, {
      method: "POST",
      body: JSON.stringify({ issueId: "issue-1", proposedChange: "Draft the fixed title for review." })
    }),
    env
  );

  const applied = await updateRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions/${env.actions[0].id}`, {
      method: "PATCH",
      body: JSON.stringify({
        approvalState: "approved",
        executionState: "applied"
      })
    }),
    env
  );
  assert.equal(applied.status, 200);

  const response = await updateRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions/${env.actions[0].id}`, {
      method: "PATCH",
      body: JSON.stringify({
        rerunState: "fixed",
        rerunReportId: reportId
      })
    }),
    env
  );

  assert.equal(response.status, 404);
  assert.equal(env.actions[0].rerun_state, "not_run");
  assert.equal(env.queueItems[0].status, "applied");
});

test("repair queue save validates all items before writing", async () => {
  const env = fakeRepairEnv();
  const reportId = "example-report-1";
  await getRepairQueue(sessionRequest(`/api/reports/${reportId}/repair-queue`), env);

  const response = await saveRepairQueue(
    sessionRequest(`/api/reports/${reportId}/repair-queue`, {
      method: "PATCH",
      body: JSON.stringify({
        items: [
          { issueId: "issue-1", status: "ignored" },
          { issueId: "missing-issue", status: "ignored" }
        ]
      })
    }),
    env
  );

  assert.equal(response.status, 400);
  assert.equal(env.queueItems[0].status, "open");
});

test("repair queue save clears stale rerun proof when a fixed repair is reopened manually", async () => {
  const env = fakeRepairEnv();
  const reportId = "example-report-1";
  await getRepairQueue(sessionRequest(`/api/reports/${reportId}/repair-queue`), env);
  env.queueItems[0].status = "fixed";
  env.queueItems[0].rerun_status = "fixed";
  env.queueItems[0].last_rerun_report_id = "rerun-report-1";

  const response = await saveRepairQueue(
    sessionRequest(`/api/reports/${reportId}/repair-queue`, {
      method: "PATCH",
      body: JSON.stringify({
        items: [{ issueId: "issue-1", status: "open", rerunStatus: "not_run" }]
      })
    }),
    env
  );

  assert.equal(response.status, 200);
  assert.equal(env.queueItems[0].status, "open");
  assert.equal(env.queueItems[0].rerun_status, "not_run");
  assert.equal(env.queueItems[0].last_rerun_report_id, null);
});

test("repair queue save clears stale rerun proof when manually reopened without rerun fields", async () => {
  const env = fakeRepairEnv();
  const reportId = "example-report-1";
  await getRepairQueue(sessionRequest(`/api/reports/${reportId}/repair-queue`), env);
  env.queueItems[0].status = "fixed";
  env.queueItems[0].rerun_status = "fixed";
  env.queueItems[0].last_rerun_report_id = "rerun-report-1";

  const response = await saveRepairQueue(
    sessionRequest(`/api/reports/${reportId}/repair-queue`, {
      method: "PATCH",
      body: JSON.stringify({
        items: [{ issueId: "issue-1", status: "open" }]
      })
    }),
    env
  );

  assert.equal(response.status, 200);
  assert.equal(env.queueItems[0].status, "open");
  assert.equal(env.queueItems[0].rerun_status, "not_run");
  assert.equal(env.queueItems[0].last_rerun_report_id, null);
});

test("repair queue save rejects terminal rerun proof without matching status", async () => {
  const env = fakeRepairEnv();
  const reportId = "example-report-1";
  env.reports.push({
    id: "rerun-report-1",
    owner_email: "owner@example.com",
    owner_invite_id: null,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    url: "https://example.com/",
    target_host: "example.com",
    report_json: JSON.stringify({ id: "rerun-report-1", url: "https://example.com/", findings: [], repairPlan: [] })
  });
  await getRepairQueue(sessionRequest(`/api/reports/${reportId}/repair-queue`), env);

  for (const rerunStatus of ["fixed", "regressed"]) {
    const response = await saveRepairQueue(
      sessionRequest(`/api/reports/${reportId}/repair-queue`, {
        method: "PATCH",
        body: JSON.stringify({
          items: [{
            issueId: "issue-1",
            status: "applied",
            rerunStatus,
            lastRerunReportId: "rerun-report-1"
          }]
        })
      }),
      env
    );

    assert.equal(response.status, 400);
    assert.equal(env.queueItems[0].status, "open");
    assert.equal(env.queueItems[0].rerun_status, "not_run");
  }
});

test("repair queue save rejects terminal statuses without matching rerun proof", async () => {
  const env = fakeRepairEnv();
  const reportId = "example-report-1";
  await getRepairQueue(sessionRequest(`/api/reports/${reportId}/repair-queue`), env);

  const cases = [
    { status: "drafted" },
    { status: "approved" },
    { status: "applied" },
    { status: "fixed" },
    { status: "regressed", rerunStatus: "not_run" },
    { status: "open", rerunStatus: "still_open" }
  ];

  for (const item of cases) {
    const response = await saveRepairQueue(
      sessionRequest(`/api/reports/${reportId}/repair-queue`, {
        method: "PATCH",
        body: JSON.stringify({ items: [{ issueId: "issue-1", ...item }] })
      }),
      env
    );

    assert.equal(response.status, 400);
    assert.equal(env.queueItems[0].status, "open");
    assert.equal(env.queueItems[0].rerun_status, "not_run");
    assert.ok(!env.queueItems[0].last_rerun_report_id);
  }
});

test("repair queue save rejects invalid explicit queue states", async () => {
  const env = fakeRepairEnv();
  const reportId = "example-report-1";
  await getRepairQueue(sessionRequest(`/api/reports/${reportId}/repair-queue`), env);

  const badStatus = await saveRepairQueue(
    sessionRequest(`/api/reports/${reportId}/repair-queue`, {
      method: "PATCH",
      body: JSON.stringify({ items: [{ issueId: "issue-1", status: "opne" }] })
    }),
    env
  );
  assert.equal(badStatus.status, 400);

  const badRerunStatus = await saveRepairQueue(
    sessionRequest(`/api/reports/${reportId}/repair-queue`, {
      method: "PATCH",
      body: JSON.stringify({ items: [{ issueId: "issue-1", rerunStatus: "fixedd" }] })
    }),
    env
  );
  assert.equal(badRerunStatus.status, 400);

  const badActionMode = await saveRepairQueue(
    sessionRequest(`/api/reports/${reportId}/repair-queue`, {
      method: "PATCH",
      body: JSON.stringify({ items: [{ issueId: "issue-1", actionMode: "typo" }] })
    }),
    env
  );
  assert.equal(badActionMode.status, 400);
  assert.equal(env.queueItems[0].status, "open");
  assert.equal(env.queueItems[0].action_mode, "self_serve");
  assert.equal(env.queueItems[0].rerun_status, "not_run");
  assert.ok(!env.queueItems[0].last_rerun_report_id);
});

test("repair queue save rejects unknown-only queue patches", async () => {
  const env = fakeRepairEnv();
  const reportId = "example-report-1";
  await getRepairQueue(sessionRequest(`/api/reports/${reportId}/repair-queue`), env);
  const updatedAt = env.queueItems[0].updated_at;

  const emptyResponse = await saveRepairQueue(
    sessionRequest(`/api/reports/${reportId}/repair-queue`, {
      method: "PATCH",
      body: JSON.stringify({ items: [] })
    }),
    env
  );

  assert.equal(emptyResponse.status, 400);
  const emptyBody = await emptyResponse.json();
  assert.match(emptyBody.error, /mutable field/i);
  assert.equal(env.queueItems[0].updated_at, updatedAt);

  const response = await saveRepairQueue(
    sessionRequest(`/api/reports/${reportId}/repair-queue`, {
      method: "PATCH",
      body: JSON.stringify({ items: [{ issueId: "issue-1", note: "noop" }] })
    }),
    env
  );

  assert.equal(response.status, 400);
  const body = await response.json();
  assert.match(body.error, /mutable field/i);
  assert.equal(env.queueItems[0].updated_at, updatedAt);
  assert.equal(env.queueItems[0].status, "open");
});

test("repair action create rejects invalid explicit action options", async () => {
  const env = fakeRepairEnv();
  const reportId = "example-report-1";
  await getRepairQueue(sessionRequest(`/api/reports/${reportId}/repair-queue`), env);
  const updatedAt = env.queueItems[0].updated_at;

  const badMode = await createRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions`, {
      method: "POST",
      body: JSON.stringify({
        issueId: "issue-1",
        actionMode: "typo",
        proposedChange: "Draft the fixed title for review."
      })
    }),
    env
  );
  assert.equal(badMode.status, 400);
  const badModeBody = await badMode.json();
  assert.match(badModeBody.error, /mode/i);

  const badType = await createRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions`, {
      method: "POST",
      body: JSON.stringify({
        issueId: "issue-1",
        actionType: "typo",
        proposedChange: "Draft the fixed title for review."
      })
    }),
    env
  );
  assert.equal(badType.status, 400);
  const badTypeBody = await badType.json();
  assert.match(badTypeBody.error, /type/i);
  assert.equal(env.actions.length, 0);
  assert.equal(env.queueItems[0].status, "open");
  assert.equal(env.queueItems[0].updated_at, updatedAt);
});

test("repair queue save rejects direct fixed closure after apply", async () => {
  const env = fakeRepairEnv();
  const reportId = "example-report-1";
  await getRepairQueue(sessionRequest(`/api/reports/${reportId}/repair-queue`), env);
  await createRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions`, {
      method: "POST",
      body: JSON.stringify({ issueId: "issue-1", proposedChange: "Draft the fixed title for review." })
    }),
    env
  );
  const applied = await updateRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions/${env.actions[0].id}`, {
      method: "PATCH",
      body: JSON.stringify({ approvalState: "approved", executionState: "applied" })
    }),
    env
  );
  assert.equal(applied.status, 200);
  env.reports.push({
    id: "rerun-report-1",
    owner_email: "owner@example.com",
    owner_invite_id: null,
    expires_at: new Date(Date.now() + 7_200_000).toISOString(),
    created_at: "2021-01-01T00:00:00.000Z",
    updated_at: "2021-01-01T00:00:00.000Z",
    url: "https://example.com/",
    target_host: "example.com",
    report_json: JSON.stringify(fixedRerunReport("rerun-report-1"))
  });

  const response = await saveRepairQueue(
    sessionRequest(`/api/reports/${reportId}/repair-queue`, {
      method: "PATCH",
      body: JSON.stringify({
        items: [{
          issueId: "issue-1",
          status: "fixed",
          rerunStatus: "fixed",
          lastRerunReportId: "rerun-report-1"
        }]
      })
    }),
    env
  );

  assert.equal(response.status, 400);
  assert.equal(env.queueItems[0].status, "applied");
  assert.equal(env.queueItems[0].rerun_status, "not_run");
  assert.equal(env.queueItems[0].last_rerun_report_id, null);
});

test("repair queue save rejects direct fixed closure when newer draft hides applied action", async () => {
  const env = fakeRepairEnv();
  const reportId = "example-report-1";
  await getRepairQueue(sessionRequest(`/api/reports/${reportId}/repair-queue`), env);
  await createRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions`, {
      method: "POST",
      body: JSON.stringify({ issueId: "issue-1", proposedChange: "Draft the fixed title for review." })
    }),
    env
  );
  const applied = await updateRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions/${env.actions[0].id}`, {
      method: "PATCH",
      body: JSON.stringify({ approvalState: "approved", executionState: "applied" })
    }),
    env
  );
  assert.equal(applied.status, 200);
  const laterDraft = await createRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions`, {
      method: "POST",
      body: JSON.stringify({ issueId: "issue-1", proposedChange: "Draft a follow-up title for review." })
    }),
    env
  );
  assert.equal(laterDraft.status, 201);
  env.actions[1].updated_at = new Date(Date.now() + 60_000).toISOString();
  env.reports.push({
    id: "rerun-report-1",
    owner_email: "owner@example.com",
    owner_invite_id: null,
    expires_at: new Date(Date.now() + 7_200_000).toISOString(),
    created_at: "2021-01-01T00:00:00.000Z",
    updated_at: "2021-01-01T00:00:00.000Z",
    url: "https://example.com/",
    target_host: "example.com",
    report_json: JSON.stringify(fixedRerunReport("rerun-report-1"))
  });

  const response = await saveRepairQueue(
    sessionRequest(`/api/reports/${reportId}/repair-queue`, {
      method: "PATCH",
      body: JSON.stringify({
        items: [{
          issueId: "issue-1",
          status: "fixed",
          rerunStatus: "fixed",
          lastRerunReportId: "rerun-report-1"
        }]
      })
    }),
    env
  );

  assert.equal(response.status, 400);
  assert.equal(env.queueItems[0].status, "drafted");
  assert.equal(env.queueItems[0].rerun_status, "not_run");
});

test("repair queue save returns conflict when a row disappears before update", async () => {
  const env = fakeRepairEnv();
  const reportId = "example-report-1";
  await getRepairQueue(sessionRequest(`/api/reports/${reportId}/repair-queue`), env);
  env.dropQueueBeforeQueueSave = true;

  const response = await saveRepairQueue(
    sessionRequest(`/api/reports/${reportId}/repair-queue`, {
      method: "PATCH",
      body: JSON.stringify({
        items: [{ issueId: "issue-1", status: "ignored" }]
      })
    }),
    env
  );

  assert.equal(response.status, 409);
  assert.equal(env.queueItems.length, 0);
});

test("repair action fixed state requires owned rerun proof", async () => {
  const env = fakeRepairEnv();
  const reportId = "example-report-1";
  await getRepairQueue(sessionRequest(`/api/reports/${reportId}/repair-queue`), env);
  await createRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions`, {
      method: "POST",
      body: JSON.stringify({ issueId: "issue-1", proposedChange: "Draft the fixed title for review." })
    }),
    env
  );

  const response = await updateRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions/${env.actions[0].id}`, {
      method: "PATCH",
      body: JSON.stringify({ rerunState: "fixed" })
    }),
    env
  );

  assert.equal(response.status, 400);
  assert.equal(env.queueItems[0].status, "drafted");
});

test("repair action still-open rerun state requires applied action and proof", async () => {
  const env = fakeRepairEnv();
  const reportId = "example-report-1";
  await getRepairQueue(sessionRequest(`/api/reports/${reportId}/repair-queue`), env);
  await createRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions`, {
      method: "POST",
      body: JSON.stringify({ issueId: "issue-1", proposedChange: "Draft the fixed title for review." })
    }),
    env
  );

  const response = await updateRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions/${env.actions[0].id}`, {
      method: "PATCH",
      body: JSON.stringify({ approvalState: "approved", rerunState: "still_open" })
    }),
    env
  );

  assert.equal(response.status, 400);
  assert.equal(env.actions[0].rerun_state, "not_run");
  assert.equal(env.queueItems[0].status, "drafted");
});

test("repair action cannot be applied before approval", async () => {
  const env = fakeRepairEnv();
  const reportId = "example-report-1";
  await getRepairQueue(sessionRequest(`/api/reports/${reportId}/repair-queue`), env);
  await createRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions`, {
      method: "POST",
      body: JSON.stringify({ issueId: "issue-1", proposedChange: "Draft the fixed title for review." })
    }),
    env
  );

  const response = await updateRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions/${env.actions[0].id}`, {
      method: "PATCH",
      body: JSON.stringify({ executionState: "applied" })
    }),
    env
  );

  assert.equal(response.status, 400);
  assert.equal(env.actions[0].execution_state, "not_started");
  assert.equal(env.queueItems[0].status, "drafted");
});

test("repair action records fixed state after owned rerun proof", async () => {
  const env = fakeRepairEnv();
  const reportId = "example-report-1";
  await getRepairQueue(sessionRequest(`/api/reports/${reportId}/repair-queue`), env);
  await createRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions`, {
      method: "POST",
      body: JSON.stringify({ issueId: "issue-1", proposedChange: "Draft the fixed title for review." })
    }),
    env
  );

  const applied = await updateRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions/${env.actions[0].id}`, {
      method: "PATCH",
      body: JSON.stringify({
        approvalState: "approved",
        executionState: "applied"
      })
    }),
    env
  );
  assert.equal(applied.status, 200);
  env.reports.push({
    id: "rerun-report-1",
    owner_email: "owner@example.com",
    owner_invite_id: null,
    expires_at: new Date(Date.now() + 7_200_000).toISOString(),
    created_at: new Date(Date.now() + 60_000).toISOString(),
    updated_at: new Date(Date.now() + 60_000).toISOString(),
    url: "https://example.com/",
    target_host: "example.com",
    report_json: JSON.stringify(fixedRerunReport("rerun-report-1"))
  });

  const response = await updateRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions/${env.actions[0].id}`, {
      method: "PATCH",
      body: JSON.stringify({
        rerunState: "fixed",
        rerunReportId: "rerun-report-1"
      })
    }),
    env
  );

  assert.equal(response.status, 200);
  assert.equal(env.actions[0].rerun_state, "fixed");
  assert.equal(env.queueItems[0].status, "fixed");
  assert.equal(env.queueItems[0].last_rerun_report_id, "rerun-report-1");
});

test("repair action webhook delivers lifecycle transitions without private draft payload", async () => {
  const env = fakeRepairEnv();
  env.SEOFIXKIT_API_WEBHOOK_SECRET = "test-secret";
  env.webhooks = [{
    id: "webhook-1",
    owner_email: "owner@example.com",
    url: "https://hooks.example.com/seo",
    events_json: JSON.stringify([
      "repair_action.drafted",
      "repair_action.approved",
      "repair_action.applied",
      "repair_action.fixed",
      "repair_action.regressed"
    ]),
    status: "active",
    revoked_at: null,
    created_at: new Date().toISOString()
  }];
  const reportId = "example-report-1";
  const waitUntilPromises = [];
  const sentPayloads = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.startsWith("https://cloudflare-dns.com/dns-query")) {
      return new Response(JSON.stringify({ Answer: [{ type: 1, data: "93.184.216.34" }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    sentPayloads.push(JSON.parse(options.body || "{}"));
    return new Response("", { status: 200 });
  };

  try {
    await getRepairQueue(sessionRequest(`/api/reports/${reportId}/repair-queue`), env);
    await createRepairAction(
      sessionRequest(`/api/reports/${reportId}/repair-actions`, {
        method: "POST",
        body: JSON.stringify({ issueId: "issue-1", proposedChange: "Private draft title copy" })
      }),
      env,
      { waitUntil: (promise) => waitUntilPromises.push(promise) }
    );
    const approved = await updateRepairAction(
      sessionRequest(`/api/reports/${reportId}/repair-actions/${env.actions[0].id}`, {
        method: "PATCH",
        body: JSON.stringify({ approvalState: "approved" })
      }),
      env,
      { waitUntil: (promise) => waitUntilPromises.push(promise) }
    );
    assert.equal(approved.status, 200);
    const applied = await updateRepairAction(
      sessionRequest(`/api/reports/${reportId}/repair-actions/${env.actions[0].id}`, {
        method: "PATCH",
        body: JSON.stringify({ executionState: "applied" })
      }),
      env,
      { waitUntil: (promise) => waitUntilPromises.push(promise) }
    );
    assert.equal(applied.status, 200);
    env.reports.push({
      id: "rerun-fixed-report-1",
      owner_email: "owner@example.com",
      owner_invite_id: null,
      expires_at: new Date(Date.now() + 7_200_000).toISOString(),
      created_at: new Date(Date.now() + 60_000).toISOString(),
      updated_at: new Date(Date.now() + 60_000).toISOString(),
      url: "https://example.com/",
      target_host: "example.com",
      report_json: JSON.stringify(fixedRerunReport("rerun-fixed-report-1"))
    });
    const fixed = await updateRepairAction(
      sessionRequest(`/api/reports/${reportId}/repair-actions/${env.actions[0].id}`, {
        method: "PATCH",
        body: JSON.stringify({ rerunState: "fixed", rerunReportId: "rerun-fixed-report-1" })
      }),
      env,
      { waitUntil: (promise) => waitUntilPromises.push(promise) }
    );
    assert.equal(fixed.status, 200);
    env.reports.push({
      id: "rerun-regressed-report-1",
      owner_email: "owner@example.com",
      owner_invite_id: null,
      expires_at: new Date(Date.now() + 7_200_000).toISOString(),
      created_at: new Date(Date.now() + 120_000).toISOString(),
      updated_at: new Date(Date.now() + 120_000).toISOString(),
      url: "https://example.com/",
      target_host: "example.com",
      report_json: JSON.stringify(stillOpenRerunReport("rerun-regressed-report-1"))
    });
    const regressed = await updateRepairAction(
      sessionRequest(`/api/reports/${reportId}/repair-actions/${env.actions[0].id}`, {
        method: "PATCH",
        body: JSON.stringify({ rerunState: "regressed", rerunReportId: "rerun-regressed-report-1" })
      }),
      env,
      { waitUntil: (promise) => waitUntilPromises.push(promise) }
    );
    assert.equal(regressed.status, 200);
    await Promise.all(waitUntilPromises);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(env.events.map((event) => event.event_type), [
    "repair_action.drafted",
    "repair_action.approved",
    "repair_action.applied",
    "repair_action.fixed",
    "repair_action.regressed"
  ]);
  assert.equal(sentPayloads.length, 5);
  assert.equal(sentPayloads[0].data.repair_action.approval_state, "drafted");
  assert.equal(sentPayloads[1].data.repair_action.approval_state, "approved");
  assert.equal(sentPayloads[2].data.repair_action.execution_state, "applied");
  assert.equal(sentPayloads[3].data.repair_action.rerun_state, "fixed");
  assert.equal(sentPayloads[3].data.repair_action.rerun_report_id, "rerun-fixed-report-1");
  assert.equal(sentPayloads[4].data.repair_action.rerun_state, "regressed");
  assert.equal(sentPayloads[4].data.repair_action.rerun_report_id, "rerun-regressed-report-1");
  assert.doesNotMatch(JSON.stringify(sentPayloads), /Private draft title copy|source_proof|proposed_change/i);
  assert.equal(env.webhooks[0].last_delivery_status, "delivered");
});

test("repair action rejects fixed proof in the same request that first applies it", async () => {
  const env = fakeRepairEnv();
  const reportId = "example-report-1";
  env.reports.push({
    id: "rerun-report-1",
    owner_email: "owner@example.com",
    owner_invite_id: null,
    expires_at: new Date(Date.now() + 7_200_000).toISOString(),
    created_at: new Date(Date.now() + 60_000).toISOString(),
    updated_at: new Date(Date.now() + 60_000).toISOString(),
    url: "https://example.com/",
    target_host: "example.com",
    report_json: JSON.stringify(fixedRerunReport("rerun-report-1"))
  });
  await getRepairQueue(sessionRequest(`/api/reports/${reportId}/repair-queue`), env);
  await createRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions`, {
      method: "POST",
      body: JSON.stringify({ issueId: "issue-1", proposedChange: "Draft the fixed title for review." })
    }),
    env
  );

  const response = await updateRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions/${env.actions[0].id}`, {
      method: "PATCH",
      body: JSON.stringify({
        approvalState: "approved",
        executionState: "applied",
        rerunState: "fixed",
        rerunReportId: "rerun-report-1"
      })
    }),
    env
  );

  assert.equal(response.status, 400);
  assert.equal(env.actions[0].execution_state, "not_started");
  assert.equal(env.actions[0].rerun_state, "not_run");
  assert.equal(env.queueItems[0].status, "drafted");
});

test("repair action rejects stale fixed proof after apply", async () => {
  const env = fakeRepairEnv();
  const reportId = "example-report-1";
  await getRepairQueue(sessionRequest(`/api/reports/${reportId}/repair-queue`), env);
  await createRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions`, {
      method: "POST",
      body: JSON.stringify({ issueId: "issue-1", proposedChange: "Draft the fixed title for review." })
    }),
    env
  );
  const applied = await updateRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions/${env.actions[0].id}`, {
      method: "PATCH",
      body: JSON.stringify({ approvalState: "approved", executionState: "applied" })
    }),
    env
  );
  assert.equal(applied.status, 200);
  env.reports.push({
    id: "rerun-report-1",
    owner_email: "owner@example.com",
    owner_invite_id: null,
    expires_at: new Date(Date.now() + 7_200_000).toISOString(),
    created_at: "2020-01-01T00:00:00.000Z",
    updated_at: "2020-01-01T00:00:00.000Z",
    url: "https://example.com/",
    target_host: "example.com",
    report_json: JSON.stringify(fixedRerunReport("rerun-report-1"))
  });

  const response = await updateRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions/${env.actions[0].id}`, {
      method: "PATCH",
      body: JSON.stringify({
        rerunState: "fixed",
        rerunReportId: "rerun-report-1"
      })
    }),
    env
  );

  assert.equal(response.status, 404);
  assert.equal(env.actions[0].execution_state, "applied");
  assert.equal(env.actions[0].rerun_state, "not_run");
  assert.equal(env.queueItems[0].status, "applied");
});

test("repair action rejects stale still-open proof after apply", async () => {
  const env = fakeRepairEnv();
  const reportId = "example-report-1";
  await getRepairQueue(sessionRequest(`/api/reports/${reportId}/repair-queue`), env);
  await createRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions`, {
      method: "POST",
      body: JSON.stringify({ issueId: "issue-1", proposedChange: "Draft the fixed title for review." })
    }),
    env
  );
  const applied = await updateRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions/${env.actions[0].id}`, {
      method: "PATCH",
      body: JSON.stringify({ approvalState: "approved", executionState: "applied" })
    }),
    env
  );
  assert.equal(applied.status, 200);
  env.reports.push({
    id: "rerun-report-1",
    owner_email: "owner@example.com",
    owner_invite_id: null,
    expires_at: new Date(Date.now() + 7_200_000).toISOString(),
    created_at: "2020-01-01T00:00:00.000Z",
    updated_at: "2020-01-01T00:00:00.000Z",
    url: "https://example.com/",
    target_host: "example.com",
    report_json: JSON.stringify(stillOpenRerunReport("rerun-report-1"))
  });

  const response = await updateRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions/${env.actions[0].id}`, {
      method: "PATCH",
      body: JSON.stringify({
        rerunState: "still_open",
        rerunReportId: "rerun-report-1"
      })
    }),
    env
  );

  assert.equal(response.status, 404);
  assert.equal(env.actions[0].execution_state, "applied");
  assert.equal(env.actions[0].rerun_state, "not_run");
  assert.equal(env.queueItems[0].status, "applied");
});

test("repair action rejects same issue id proof from a different page", async () => {
  const env = fakeRepairEnv();
  const reportId = "example-report-1";
  await getRepairQueue(sessionRequest(`/api/reports/${reportId}/repair-queue`), env);
  await createRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions`, {
      method: "POST",
      body: JSON.stringify({ issueId: "issue-1", proposedChange: "Draft the fixed title for review." })
    }),
    env
  );
  const applied = await updateRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions/${env.actions[0].id}`, {
      method: "PATCH",
      body: JSON.stringify({ approvalState: "approved", executionState: "applied" })
    }),
    env
  );
  assert.equal(applied.status, 200);
  env.reports.push({
    id: "rerun-report-1",
    owner_email: "owner@example.com",
    owner_invite_id: null,
    expires_at: new Date(Date.now() + 7_200_000).toISOString(),
    created_at: new Date(Date.now() + 60_000).toISOString(),
    updated_at: new Date(Date.now() + 60_000).toISOString(),
    url: "https://example.com/",
    target_host: "example.com",
    report_json: JSON.stringify(differentPageRerunReport("rerun-report-1"))
  });

  const response = await updateRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions/${env.actions[0].id}`, {
      method: "PATCH",
      body: JSON.stringify({
        rerunState: "still_open",
        rerunReportId: "rerun-report-1"
      })
    }),
    env
  );

  assert.equal(response.status, 404);
  assert.equal(env.actions[0].rerun_state, "not_run");
  assert.equal(env.queueItems[0].status, "applied");
});

test("repair action rejects fixed proof when fallback repair-plan issue is still present", async () => {
  const env = fakeRepairEnv();
  const reportId = "example-report-1";
  env.reports[0].report_json = JSON.stringify(repairPlanOnlyReport(reportId));
  const queueResponse = await getRepairQueue(sessionRequest(`/api/reports/${reportId}/repair-queue`), env);
  assert.equal(queueResponse.status, 200);
  const queueBody = await queueResponse.json();
  const issueId = queueBody.items[0].issueId;
  assert.match(issueId, /^repair-1-/);
  await createRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions`, {
      method: "POST",
      body: JSON.stringify({ issueId, proposedChange: "Draft the schema fix." })
    }),
    env
  );
  const applied = await updateRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions/${env.actions[0].id}`, {
      method: "PATCH",
      body: JSON.stringify({ approvalState: "approved", executionState: "applied" })
    }),
    env
  );
  assert.equal(applied.status, 200);
  env.reports.push({
    id: "rerun-report-1",
    owner_email: "owner@example.com",
    owner_invite_id: null,
    expires_at: new Date(Date.now() + 7_200_000).toISOString(),
    created_at: new Date(Date.now() + 60_000).toISOString(),
    updated_at: new Date(Date.now() + 60_000).toISOString(),
    url: "https://example.com/",
    target_host: "example.com",
    report_json: JSON.stringify(repairPlanOnlyReport("rerun-report-1"))
  });

  const response = await updateRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions/${env.actions[0].id}`, {
      method: "PATCH",
      body: JSON.stringify({
        rerunState: "fixed",
        rerunReportId: "rerun-report-1"
      })
    }),
    env
  );

  assert.equal(response.status, 404);
  assert.equal(env.actions[0].rerun_state, "not_run");
  assert.equal(env.queueItems[0].status, "applied");
});

test("repair action rejects missing R2 rerun proof body", async () => {
  const env = fakeRepairEnv();
  const reportId = "example-report-1";
  await getRepairQueue(sessionRequest(`/api/reports/${reportId}/repair-queue`), env);
  await createRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions`, {
      method: "POST",
      body: JSON.stringify({ issueId: "issue-1", proposedChange: "Draft the fixed title for review." })
    }),
    env
  );
  const applied = await updateRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions/${env.actions[0].id}`, {
      method: "PATCH",
      body: JSON.stringify({ approvalState: "approved", executionState: "applied" })
    }),
    env
  );
  assert.equal(applied.status, 200);
  env.reports.push({
    id: "rerun-report-1",
    owner_email: "owner@example.com",
    owner_invite_id: null,
    expires_at: new Date(Date.now() + 7_200_000).toISOString(),
    created_at: new Date(Date.now() + 60_000).toISOString(),
    updated_at: new Date(Date.now() + 60_000).toISOString(),
    url: "https://example.com/",
    target_host: "example.com",
    report_json: "r2:reports/missing.json"
  });

  const response = await updateRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions/${env.actions[0].id}`, {
      method: "PATCH",
      body: JSON.stringify({
        rerunState: "fixed",
        rerunReportId: "rerun-report-1"
      })
    }),
    env
  );

  assert.equal(response.status, 404);
  assert.equal(env.actions[0].rerun_state, "not_run");
  assert.equal(env.queueItems[0].status, "applied");
});

test("repair action update clears stale rerun proof when reopened", async () => {
  const env = fakeRepairEnv();
  const reportId = "example-report-1";
  await getRepairQueue(sessionRequest(`/api/reports/${reportId}/repair-queue`), env);
  await createRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions`, {
      method: "POST",
      body: JSON.stringify({ issueId: "issue-1", proposedChange: "Draft the fixed title for review." })
    }),
    env
  );
  const applied = await updateRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions/${env.actions[0].id}`, {
      method: "PATCH",
      body: JSON.stringify({
        approvalState: "approved",
        executionState: "applied"
      })
    }),
    env
  );
  assert.equal(applied.status, 200);
  env.reports.push({
    id: "rerun-report-1",
    owner_email: "owner@example.com",
    owner_invite_id: null,
    expires_at: new Date(Date.now() + 7_200_000).toISOString(),
    created_at: new Date(Date.now() + 60_000).toISOString(),
    updated_at: new Date(Date.now() + 60_000).toISOString(),
    url: "https://example.com/",
    target_host: "example.com",
    report_json: JSON.stringify(fixedRerunReport("rerun-report-1"))
  });
  await updateRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions/${env.actions[0].id}`, {
      method: "PATCH",
      body: JSON.stringify({
        rerunState: "fixed",
        rerunReportId: "rerun-report-1"
      })
    }),
    env
  );

  const reopened = await updateRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions/${env.actions[0].id}`, {
      method: "PATCH",
      body: JSON.stringify({ rerunState: "not_run" })
    }),
    env
  );

  assert.equal(reopened.status, 200);
  assert.equal(env.actions[0].rerun_state, "not_run");
  assert.equal(env.actions[0].rerun_report_id, null);
  assert.equal(env.queueItems[0].status, "applied");
  assert.equal(env.queueItems[0].rerun_status, "not_run");
  assert.equal(env.queueItems[0].last_rerun_report_id, null);
});

test("repair action update rejects invalid explicit states without clearing proof", async () => {
  const env = fakeRepairEnv();
  const reportId = "example-report-1";
  await getRepairQueue(sessionRequest(`/api/reports/${reportId}/repair-queue`), env);
  await createRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions`, {
      method: "POST",
      body: JSON.stringify({ issueId: "issue-1", proposedChange: "Draft the fixed title for review." })
    }),
    env
  );
  const applied = await updateRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions/${env.actions[0].id}`, {
      method: "PATCH",
      body: JSON.stringify({
        approvalState: "approved",
        executionState: "applied"
      })
    }),
    env
  );
  assert.equal(applied.status, 200);
  env.reports.push({
    id: "rerun-report-1",
    owner_email: "owner@example.com",
    owner_invite_id: null,
    expires_at: new Date(Date.now() + 7_200_000).toISOString(),
    created_at: new Date(Date.now() + 60_000).toISOString(),
    updated_at: new Date(Date.now() + 60_000).toISOString(),
    url: "https://example.com/",
    target_host: "example.com",
    report_json: JSON.stringify(fixedRerunReport("rerun-report-1"))
  });
  const fixed = await updateRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions/${env.actions[0].id}`, {
      method: "PATCH",
      body: JSON.stringify({
        rerunState: "fixed",
        rerunReportId: "rerun-report-1"
      })
    }),
    env
  );
  assert.equal(fixed.status, 200);

  const response = await updateRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions/${env.actions[0].id}`, {
      method: "PATCH",
      body: JSON.stringify({ rerunState: "fixedd" })
    }),
    env
  );

  assert.equal(response.status, 400);
  assert.equal(env.actions[0].rerun_state, "fixed");
  assert.equal(env.actions[0].rerun_report_id, "rerun-report-1");
  assert.equal(env.queueItems[0].status, "fixed");
  assert.equal(env.queueItems[0].rerun_status, "fixed");
  assert.equal(env.queueItems[0].last_rerun_report_id, "rerun-report-1");
});

test("repair queue read falls back before repair migration while writes fail closed", async () => {
  const env = fakeRepairEnv();
  env.missingRepairTables = true;
  const reportId = "example-report-1";

  const readResponse = await getRepairQueue(sessionRequest(`/api/reports/${reportId}/repair-queue`), env);
  assert.equal(readResponse.status, 200);
  const readBody = await readResponse.json();
  assert.equal(readBody.items.length, 1);

  const writeResponse = await createRepairAction(
    sessionRequest(`/api/reports/${reportId}/repair-actions`, {
      method: "POST",
      body: JSON.stringify({ issueId: "issue-1", proposedChange: "Draft the fixed title for review." })
    }),
    env
  );
  assert.equal(writeResponse.status, 503);
  const writeBody = await writeResponse.json();
  assert.equal(writeBody.code, "REPAIR_QUEUE_MIGRATION_MISSING");
});

test("repair queue read preserves saved state before applying the response cap", async () => {
  const env = fakeRepairEnv();
  const reportId = "example-report-1";
  env.simulateRepairQueueSqlLimit = true;
  env.queueItems = [
    repairQueueRow({
      id: "queue-fixed",
      issue_id: "issue-1",
      title: "Missing title",
      severity: "critical",
      status: "fixed",
      rerun_status: "fixed",
      last_rerun_report_id: "rerun-report-1",
      updated_at: "2020-01-01T00:00:00.000Z"
    }),
    ...Array.from({ length: 120 }, (_, index) => repairQueueRow({
      id: `queue-old-${index}`,
      issue_id: `old-issue-${index}`,
      title: `Old saved repair ${index}`,
      severity: "notice",
      status: "ignored",
      updated_at: new Date(Date.parse("2020-01-02T00:00:00.000Z") + index * 1000).toISOString()
    }))
  ];

  const response = await getRepairQueue(sessionRequest(`/api/reports/${reportId}/repair-queue`), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  const fixedItem = body.items.find((item) => item.issueId === "issue-1");

  assert.equal(fixedItem.status, "fixed");
  assert.equal(fixedItem.rerunStatus, "fixed");
  assert.equal(fixedItem.lastRerunReportId, "rerun-report-1");
});

function sessionRequest(path, options = {}) {
  return new Request(`https://seofixkit.test${path}`, {
    method: options.method || "GET",
    headers: {
      cookie: "sfk_beta_session=test-session",
      "content-type": "application/json"
    },
    body: options.body
  });
}

function fixedRerunReport(id) {
  return {
    id,
    url: "https://example.com/",
    score: 100,
    summary: { pagesScanned: 1, totalFindings: 0 },
    pages: [{ url: "https://example.com/" }],
    findings: [],
    repairPlan: [],
    reportDelta: {
      status: "ready",
      fixedIssues: [{
        id: "issue-1",
        title: "Missing title",
        pageUrl: "https://example.com/",
        source: "rendered"
      }]
    }
  };
}

function stillOpenRerunReport(id) {
  return {
    id,
    url: "https://example.com/",
    score: 75,
    summary: { pagesScanned: 1, totalFindings: 1 },
    pages: [{ url: "https://example.com/" }],
    findings: [{
      id: "issue-1",
      severity: "critical",
      title: "Missing title",
      pageUrl: "https://example.com/",
      evidence: "Rendered title is still missing.",
      fix: "Add a descriptive title.",
      confidence: "verified",
      source: "rendered"
    }],
    repairPlan: []
  };
}

function differentPageRerunReport(id) {
  return {
    id,
    url: "https://example.com/other",
    score: 75,
    summary: { pagesScanned: 1, totalFindings: 1 },
    pages: [{ url: "https://example.com/other" }],
    findings: [{
      id: "issue-1",
      severity: "critical",
      title: "Missing title",
      pageUrl: "https://example.com/other",
      evidence: "Rendered title is missing on another page.",
      fix: "Add a descriptive title.",
      confidence: "verified",
      source: "rendered"
    }],
    repairPlan: []
  };
}

function repairPlanOnlyReport(id) {
  return {
    id,
    url: "https://example.com/",
    score: 82,
    summary: { pagesScanned: 1, totalFindings: 1 },
    pages: [{ url: "https://example.com/" }],
    findings: [],
    repairPlan: [{
      priority: 1,
      severity: "warning",
      title: "Missing product schema",
      pageUrl: "https://example.com/",
      pageLabel: "home",
      proof: "Product schema is missing.",
      fix: "Add Product schema.",
      acceptance: "Product schema validates.",
      confidence: "verified",
      source: "schema"
    }]
  };
}

function fakeRepairEnv() {
  const now = new Date(Date.now() + 60_000).toISOString();
  const env = {
    ownerEmail: "owner@example.com",
    reports: [{
      id: "example-report-1",
      owner_email: "owner@example.com",
      owner_invite_id: null,
      expires_at: now,
      created_at: "2020-01-01T00:00:00.000Z",
      updated_at: "2020-01-01T00:00:00.000Z",
      url: "https://example.com/",
      target_host: "example.com",
      report_json: JSON.stringify({
        id: "example-report-1",
        url: "https://example.com/",
        createdAt: "2020-01-01T00:00:00.000Z",
        findings: [{
          id: "issue-1",
          severity: "critical",
          title: "Missing title",
          pageUrl: "https://example.com/",
          pageLabel: "home",
          evidence: "Rendered title is missing.",
          fix: "Add a descriptive title.",
          confidence: "verified",
          source: "rendered"
        }],
        repairPlan: [{
          priority: 1,
          severity: "critical",
          title: "Missing title",
          pageUrl: "https://example.com/",
          pageLabel: "home",
          proof: "Rendered title is missing.",
          fix: "Add a descriptive title.",
          acceptance: "Rendered title exists.",
          confidence: "verified",
          source: "rendered"
        }]
      })
	    }],
	    queueItems: [],
	    actions: [],
	    webhooks: [],
	    events: []
	  };
  env.WAITLIST_DB = {
    prepare(sql) {
      return {
        bind(...values) {
          return statement(sql, values, env);
        }
      };
    },
    batch: async (statements) => Promise.all(statements.map((statement) => statement.run()))
  };
  return env;
}

function repairQueueRow(overrides = {}) {
  return {
    id: "queue-1",
    report_id: "example-report-1",
    owner_email: "owner@example.com",
    issue_id: "issue-1",
    title: "Missing title",
    severity: "critical",
    page_url: "https://example.com/",
    page_label: "home",
    proof: "Rendered title is missing.",
    fix: "Add a descriptive title.",
    snippet: "",
    acceptance: "Rendered title exists.",
    confidence: "verified",
    source: "rendered",
    source_kind: "finding",
    estimated_effort: "",
    work_type: "",
    action_mode: "self_serve",
    status: "open",
    rerun_status: "not_run",
    last_rerun_report_id: null,
    created_at: "2020-01-01T00:00:00.000Z",
    updated_at: "2020-01-01T00:00:00.000Z",
    updated_by_email: "owner@example.com",
    ...overrides
  };
}

function statement(sql, values, env) {
  const maybeMissingRepairTables = () => {
    if (env.missingRepairTables && /repair_queue_items|repair_agent_actions/.test(sql)) {
      throw new Error("no such table: repair_queue_items");
    }
  };
  return {
    first: async () => {
      maybeMissingRepairTables();
      return first(sql, values, env);
    },
    all: async () => {
      maybeMissingRepairTables();
      return all(sql, values, env);
    },
    run: async () => {
      maybeMissingRepairTables();
      return run(sql, values, env);
    }
  };
}

function first(sql, values, env) {
  if (sql.includes("FROM beta_sessions")) {
    return {
      token_hash: values[0],
      owner_email: env.ownerEmail,
      invite_id: null,
      access_mode: "founder-override",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      revoked_at: null
    };
  }
  if (sql.includes("FROM audit_reports")) {
    const reportId = values[0];
    const ownerEmail = values[1];
    const report = env.reports.find((row) => row.id === reportId && (!ownerEmail || row.owner_email === ownerEmail));
    return report || null;
  }
  if (sql.includes("FROM repair_queue_items")) {
    return env.queueItems[0] ? { id: env.queueItems[0].id } : null;
  }
	  if (sql.includes("FROM repair_agent_actions")) {
	    if (sql.includes("SELECT id FROM repair_agent_actions")) {
	      return env.actions[0] ? { id: env.actions[0].id } : null;
	    }
	    const [id, reportId, ownerEmail] = values;
	    const row = env.actions.find((row) => row.id === id && row.report_id === reportId && row.owner_email === ownerEmail);
	    return row ? { ...row } : null;
	  }
  throw new Error(`Unexpected first SQL: ${sql}`);
}

function all(sql, values, env) {
  if (sql.includes("FROM repair_queue_items")) {
    const [reportId, ownerEmail] = values;
    let results = env.queueItems.filter((row) => row.report_id === reportId && row.owner_email === ownerEmail);
    if (sql.includes("ORDER BY updated_at DESC")) {
      results = [...results].sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
    }
    const limit = sql.match(/LIMIT\s+(\d+)/i);
    if (env.simulateRepairQueueSqlLimit && limit) {
      results = results.slice(0, Number(limit[1]));
    }
    return { results };
  }
  if (sql.includes("FROM repair_agent_actions")) {
    const [reportId, ownerEmail] = values;
    return { results: env.actions.filter((row) => row.report_id === reportId && row.owner_email === ownerEmail) };
  }
	  if (sql.includes("FROM api_webhooks")) {
	    return { results: env.webhooks };
	  }
  throw new Error(`Unexpected all SQL: ${sql}`);
}

function run(sql, values, env) {
  if (sql.includes("UPDATE beta_sessions")) return { meta: { changes: 1 } };
  if (sql.includes("INSERT INTO repair_queue_items")) {
    if (!env.queueItems.some((row) => row.report_id === values[1] && row.issue_id === values[3])) {
      env.queueItems.push({
        id: values[0],
        report_id: values[1],
        owner_email: values[2],
        issue_id: values[3],
        title: values[4],
        severity: values[5],
        page_url: values[6],
        page_label: values[7],
        proof: values[8],
        fix: values[9],
        snippet: values[10],
        acceptance: values[11],
        confidence: values[12],
        source: values[13],
        source_kind: values[14],
        estimated_effort: values[15],
        work_type: values[16],
        action_mode: values[17],
        status: values[18],
        rerun_status: values[19],
        last_rerun_report_id: values[20],
        created_at: values[21],
        updated_at: values[22],
        updated_by_email: values[23]
      });
    }
    return { meta: { changes: 1 } };
  }
  if (sql.includes("INSERT INTO repair_agent_actions")) {
    if (env.dropQueueBeforeActionInsert) env.queueItems = env.queueItems.filter((row) => row.id !== values[19]);
    if (sql.includes("WHERE EXISTS")) {
      const queueExists = env.queueItems.some((row) =>
        row.id === values[19] &&
        row.report_id === values[20] &&
        row.owner_email === values[21]
      );
      if (!queueExists) return { meta: { changes: 0 } };
    }
    env.actions.push({
      id: values[0],
      report_id: values[1],
      owner_email: values[2],
      queue_item_id: values[3],
      issue_id: values[4],
      action_mode: values[5],
      action_type: values[6],
      approval_state: values[7],
      execution_state: values[8],
      rerun_state: values[9],
      source_proof: values[10],
      proposed_change: values[11],
      acceptance: values[12],
      rerun_report_id: values[13],
      created_at: values[14],
      updated_at: values[15],
      approved_at: values[16],
      applied_at: values[17],
      updated_by_email: values[18]
    });
    return { meta: { changes: 1 } };
  }
  if (sql.includes("UPDATE repair_queue_items")) {
    const idIndex = sql.includes("SET status = 'drafted'") ? 3 : values.length - 3;
    if (env.dropQueueBeforeQueueSave && !sql.includes("SET status = 'drafted'")) {
      env.queueItems = env.queueItems.filter((item) => item.id !== values[idIndex]);
    }
    const row = env.queueItems.find((item) => item.id === values[idIndex]);
    if (row) {
      if (sql.includes("SET status = 'drafted'")) {
        row.status = "drafted";
        row.action_mode = values[0];
        row.rerun_status = "not_run";
        row.last_rerun_report_id = null;
        row.updated_at = values[1];
        row.updated_by_email = values[2];
      } else if (sql.includes("action_mode")) {
        row.status = values[0];
        row.action_mode = values[1];
        row.rerun_status = values[2];
        row.last_rerun_report_id = values[3];
        row.updated_at = values[4];
        row.updated_by_email = values[5];
      } else {
        row.status = values[0];
        row.rerun_status = values[1];
        row.last_rerun_report_id = values[2];
        row.updated_at = values[3];
        row.updated_by_email = values[4];
      }
    }
    return { meta: { changes: row ? 1 : 0 } };
  }
	  if (sql.includes("UPDATE repair_agent_actions")) {
	    const row = env.actions.find((action) => action.id === values[8]);
    if (env.dropQueueBeforeActionUpdate) env.queueItems = env.queueItems.filter((item) => item.id !== values[11]);
    if (sql.includes("EXISTS")) {
      const queueExists = env.queueItems.some((item) =>
        item.id === values[11] &&
        item.report_id === values[12] &&
        item.owner_email === values[13]
      );
      if (!queueExists) return { meta: { changes: 0 } };
    }
    if (row) {
      row.approval_state = values[0];
      row.execution_state = values[1];
      row.rerun_state = values[2];
      row.rerun_report_id = values[3];
      row.updated_at = values[4];
      row.approved_at = values[5];
      row.applied_at = values[6];
      row.updated_by_email = values[7];
    }
	    return { meta: { changes: row ? 1 : 0 } };
	  }
	  if (sql.includes("INSERT INTO api_webhook_events")) {
	    env.events.push({
	      id: values[0],
	      webhook_id: values[1],
	      owner_email: values[2],
	      event_type: values[3],
	      audit_job_id: values[4],
	      report_id: values[5],
	      status: values[6],
	      http_status: values[7],
	      error: values[8],
	      payload_json: values[9],
	      created_at: values[10],
	      delivered_at: values[11]
	    });
	    return { meta: { changes: 1 } };
	  }
	  if (sql.includes("UPDATE api_webhook_events")) {
	    const failedUpdate = sql.includes("SET status = 'failed'");
	    const event = env.events.find((row) => row.id === values[failedUpdate ? 2 : 4]);
	    Object.assign(event, failedUpdate
	      ? {
	          status: "failed",
	          error: values[0],
	          delivered_at: values[1]
	        }
	      : {
	          status: values[0],
	          http_status: values[1],
	          error: values[2],
	          delivered_at: values[3]
	        });
	    return { meta: { changes: 1 } };
	  }
	  if (sql.includes("UPDATE api_webhooks")) {
	    const failedUpdate = sql.includes("last_delivery_status = 'failed'");
	    const webhook = env.webhooks.find((row) => row.id === values[failedUpdate ? 3 : 4]);
	    Object.assign(webhook, failedUpdate
	      ? {
	          last_delivery_at: values[0],
	          last_delivery_status: "failed",
	          last_error: values[1],
	          updated_at: values[2]
	        }
	      : {
	          last_delivery_at: values[0],
	          last_delivery_status: values[1],
	          last_error: values[2],
	          updated_at: values[3]
	        });
	    return { meta: { changes: 1 } };
	  }
	  throw new Error(`Unexpected run SQL: ${sql}`);
	}
