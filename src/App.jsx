import { useState } from "react";

export default function App() {
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  async function joinWaitlist(event) {
    event.preventDefault();
    setStatus("submitting");
    setMessage("");

    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          company,
          source: "locked-homepage"
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Could not join the waitlist.");
      }
      setStatus("success");
      setMessage("You're on the list. We'll email you when private beta opens.");
      setEmail("");
      setCompany("");
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "Could not join the waitlist.");
    }
  }

  return (
    <main className="waitlist-shell">
      <img
        alt=""
        aria-hidden="true"
        className="hero-art"
        src="/assets/waitlist-hero.jpg"
      />
      <div className="hero-shade" />

      <header className="site-top">
        <a className="brand-lockup" href="/" aria-label="SEO Fix Kit home">
          <span className="brand-mark" aria-hidden="true">
            <span>S</span>
            <span>F</span>
            <span>K</span>
          </span>
          <span>SEO Fix Kit</span>
        </a>
        <span className="launch-status">Coming soon</span>
      </header>

      <section className="hero-copy" aria-labelledby="page-title">
        <p className="kicker">Private beta</p>
        <h1 id="page-title">SEO Fix Kit</h1>
        <p className="coming-soon">Coming soon.</p>
        <p className="hero-text">
          Evidence-backed SEO audits are locked while we prep the private beta.
          Join the waitlist and we’ll email you when early access opens.
        </p>

        <form className="waitlist-form" onSubmit={joinWaitlist}>
          <label htmlFor="email">Email address</label>
          <div className="email-row">
            <input
              autoComplete="email"
              id="email"
              inputMode="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
              type="email"
              value={email}
            />
            <button disabled={status === "submitting"} type="submit">
              {status === "submitting" ? "Joining" : "Join waitlist"}
            </button>
          </div>
          <label className="honeypot" htmlFor="company">
            Company
            <input
              autoComplete="off"
              id="company"
              onChange={(event) => setCompany(event.target.value)}
              tabIndex="-1"
              type="text"
              value={company}
            />
          </label>
          <p className={`form-message ${status}`} aria-live="polite">
            {message || "We’ll only use this email for SEO Fix Kit outreach."}
          </p>
        </form>
      </section>

      <footer className="site-footer">
        <span>Audit it. Prove it. Fix it.</span>
        <a href="/privacy">Privacy</a>
      </footer>
    </main>
  );
}
