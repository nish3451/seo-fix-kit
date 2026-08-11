// IndexNow (Bing/Naver/Seznam/Yandex instant indexing) support.
//
// IndexNow needs no account or credentials: a site hosts a key file at
// `/{key}.txt` (root, or `/.well-known/{key}.txt`), and anyone can then submit
// the site's URLs to the IndexNow endpoints. Bing picks those URLs up for
// crawling on its schedule, and DuckDuckGo's index is Bing-derived, so this is
// the credential-free leg of the search-index coverage item. Google does not
// participate in IndexNow; the Google leg is Search Console request-indexing
// (owner credentials) plus ordinary sitemap re-crawling.
//
// The key is intentionally a committed, world-readable value: the IndexNow
// spec requires the key file to be fetchable by anyone, and the key itself is
// not a security credential (https://www.indexnow.org/documentation). It only
// has to be stable and unique to this host.
export const INDEX_NOW_KEY = "3219d564f9f914772e178f33ae543e60";

export const INDEX_NOW_ENDPOINTS = [
  "https://api.indexnow.org/indexnow",
  "https://www.bing.com/indexnow"
];

export const INDEX_NOW_HOST = "seofixkit.com";

export function indexNowKeyFilePaths() {
  return [`/${INDEX_NOW_KEY}.txt`, `/.well-known/${INDEX_NOW_KEY}.txt`];
}

export function indexNowKeyFileBody() {
  return `${INDEX_NOW_KEY}\n`;
}

export function indexNowKeyLocation() {
  return `https://${INDEX_NOW_HOST}/${INDEX_NOW_KEY}.txt`;
}

// The URL set submitted to IndexNow mirrors the live sitemap: every public
// route, apex-only, no query strings, no www (www 301s to apex so submitting
// it would be duplicate-URL noise).
export function buildIndexNowPayload(urls, { host = INDEX_NOW_HOST } = {}) {
  return {
    host,
    key: INDEX_NOW_KEY,
    keyLocation: indexNowKeyLocation(),
    urlList: [...urls]
  };
}
