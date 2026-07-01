import assert from "node:assert/strict";
import test from "node:test";
import { sendWorkerEmail } from "./email.js";

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

test("same-domain fix pack admin emails carry the internal inbox marker", async () => {
  const { env, sent } = fakeEmailEnv();

  await sendWorkerEmail(env, {
    to: "support@seofixkit.com",
    subject: "SEO Fix Pack paid: seofixkit.com",
    text: "Payment confirmed.",
    html: "<p>Payment confirmed.</p>",
    tag: "fix-pack-payment"
  });

  assert.equal(sent.length, 1);
  assert.equal(sent[0].headers["X-SEOFIXKIT-Tag"], "fix-pack-payment");
  assert.equal(sent[0].headers["X-Nish-Internal-Email"], "internal-token");
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
});
