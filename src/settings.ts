export type Settings = {
  pinnedPosts: string[],
  keywords: string[],
  partialKeywords: string[],
  negativeKeywords: string[],
  boostedKeywords: { [key: string]: number },
  publishMetrics?: boolean,
  subscriberBoost: number,
}

export type Secrets = {
  newrelicKey: string,
  password: string,
  identifier: string,
}

export function getSettings() {
  return {
    pinnedPosts: JSON.parse(process.env.SETTINGS_PINNED_POSTS ||
      (() => { throw new Error("Missing SETTINGS_PINNED_POSTS in .env") })()),
    keywords: JSON.parse(process.env.SETTINGS_KEYWORDS || 
      (() => { throw new Error("Missing SETTINGS_KEYWORDS in .env") })()),
    partialKeywords: JSON.parse(process.env.SETTINGS_PARTIAL_KEYWORDS || 
      (() => { throw new Error("Missing SETTINGS_PARTIAL_KEYWORDS in .env") })()),
    negativeKeywords: JSON.parse(process.env.SETTINGS_NEGATIVE_KEYWORDS || 
      (() => { throw new Error("Missing SETTINGS_NEGATIVE_KEYWORDS in .env") })()),
    boostedKeywords: JSON.parse(process.env.SETTINGS_BOOSTED_KEYWORDS || 
      (() => { throw new Error("Missing SETTINGS_BOOSTED_KEYWORDS in .env") })()),
    publishMetrics: JSON.parse(process.env.SETTINGS_PUBLISH_METRICS || "false"),
    subscriberBoost: JSON.parse(process.env.SETTINGS_SUBSCRIBER_BOOST || "0"),
  };
}

export function getSecrets() {
  return {
    newrelicKey: process.env.NEWRELIC_KEY || 
      (() => { throw new Error("Missing NEWRELIC_KEY in .env") })(),
    identifier: process.env.BSKY_IDENTIFIER ||
      (() => { throw new Error("Missing BSKY_IDENTIFIER in .env") })(),
    password: process.env.BSKY_PASSWORD ||
      (() => { throw new Error("Missing BSKY_PASSWORD in .env") })(),
  };
}

