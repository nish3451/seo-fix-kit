export const CRAWL_DEPTH_TIERS = [
  {
    id: "quick",
    label: "Quick proof",
    pages: 10,
    description: "Homepage plus the first discovered pages."
  },
  {
    id: "site",
    label: "Site crawl",
    pages: 100,
    description: "A broader self-serve crawl for small sites."
  },
  {
    id: "deep",
    label: "Deep crawl",
    pages: 1000,
    description: "A queued deep crawl for larger verified sites."
  }
];

export const DEFAULT_CRAWL_PAGES = 10;
export const SELF_SERVE_MAX_CRAWL_PAGES = 1000;
export const CRAWLRAVEN_PUBLIC_CRAWL_PAGES = 50000;
export const CRAWLRAVEN_ENTERPRISE_CRAWL_PAGES = 100000;

export function normalizeCrawlLimit(value, options = {}) {
  const defaultPages = Number(options.defaultPages || DEFAULT_CRAWL_PAGES);
  const maxPages = Number(options.maxPages || SELF_SERVE_MAX_CRAWL_PAGES);
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return defaultPages;
  return Math.min(Math.max(Math.round(parsed), 1), maxPages);
}

export function crawlDepthTierFor(value) {
  const pages = normalizeCrawlLimit(value);
  return CRAWL_DEPTH_TIERS.find((tier) => tier.pages === pages) || {
    id: "custom",
    label: `${pages} pages`,
    pages,
    description: "Custom crawl depth."
  };
}

export function crawlDepthSummary(value) {
  const pages = normalizeCrawlLimit(value);
  const tier = crawlDepthTierFor(pages);
  return {
    pages,
    tierId: tier.id,
    tierLabel: tier.label,
    selfServeMaxPages: SELF_SERVE_MAX_CRAWL_PAGES,
    crawlRavenPublicPages: CRAWLRAVEN_PUBLIC_CRAWL_PAGES,
    crawlRavenEnterprisePages: CRAWLRAVEN_ENTERPRISE_CRAWL_PAGES,
    parityGapPages: Math.max(CRAWLRAVEN_PUBLIC_CRAWL_PAGES - pages, 0)
  };
}
