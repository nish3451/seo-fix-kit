import assert from "node:assert/strict";
import test from "node:test";
import { sendWorkerEmail, shouldSkipOwnedInternalEmail } from "./email.js";

function fakeEmailEnv(overrides = {}) {
  const sent = [];
  return {
    env: {
      INTERNAL_EMAIL_TOKEN: "internal-token",
      SEOFIXKIT_EMAIL_FROM: "support@seofixkit.com",
      EMAIL: {
        async send(payload) {
          sent.push(payload);
          return { messageId: "message-1" };
        }
      },
      ...overrides
    },
    sent
  };
}

test("same-domain fix pack admin emails are skipped at the source", async () => {
  const { env } = fakeEmailEnv();

  assert.equal(shouldSkipOwnedInternalEmail(env, {
    to: "support@seofixkit.com",
    tag: "fix-pack-payment"
  }), true);
});

test("cross-owned ops emails are skipped at the source", async () => {
  const { env } = fakeEmailEnv({
    INTERNAL_EMAIL_DOMAINS: "seofixkit.com,tinystudio.io"
  });

  assert.equal(shouldSkipOwnedInternalEmail(env, {
    to: "hello@tinystudio.io",
    tag: "ops-digest"
  }), true);
});

test("external fix pack customer emails do not carry the internal inbox marker", async () => {
  const { env, sent } = fakeEmailEnv();

  await sendWorkerEmail(env, {
    to: "customer@example.com",
    subject: "SEO Fix Pack payment confirmed for example.com",
    text: "Payment confirmed.",
    html: "<p>Payment confirmed.</p>",
    tag: "fix-pack-payment"
  });

  assert.equal(sent.length, 1);
  assert.equal(sent[0].headers["X-SEOFIXKIT-Tag"], "fix-pack-payment");
  assert.equal(sent[0].headers["X-Nish-Internal-Email"], undefined);
  assert.equal(shouldSkipOwnedInternalEmail(env, {
    to: "customer@example.com",
    tag: "fix-pack-payment"
  }), false);
});
