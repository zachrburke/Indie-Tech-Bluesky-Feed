import {
  OutputSchema as RepoEvent,
  isCommit,
} from './lexicon/types/com/atproto/sync/subscribeRepos'
import { FirehoseSubscriptionBase, getOpsByType } from './util/subscription'

function hasMatch(text: string, keywords: string[], partialKeywords: string[], negativeKeywords: string[]) {
  const multipleSpaces = / {2,}/g;
  const lowerText = text.toLowerCase();
  const textWithSpaces = (" " + lowerText + " ")
    .replaceAll("\n", " ")
    .replaceAll(", ", " ")
    .replaceAll(". ", " ")
    .replaceAll("! ", " ")
    .replaceAll("? ", " ")
    .replaceAll(multipleSpaces, " ") + " ";
  return (keywords.some(keyword => textWithSpaces.includes(" " + keyword + " "))
    || partialKeywords.some(keyword => lowerText.includes(keyword)))
    && !negativeKeywords.some(keyword => lowerText.includes(keyword));
}

function calculateMod(text: string, boostedKeywords: { [key: string]: number }) {
  let boost: number|null = null;
  for (const keyword in boostedKeywords) {
    if (text.includes(keyword)) {
      // Don't allow boosts to stack
      boost = Math.max(boost ?? Number.MIN_SAFE_INTEGER, boostedKeywords[keyword]);
    }
  }
  return boost ?? 0;
}

export { hasMatch };


export class FirehoseSubscription extends FirehoseSubscriptionBase {
  SETTINGS_PATH = "./settings.json";

  count = 0;
  settings = require(this.SETTINGS_PATH);
  keywords: string[] = [];
  partialKeywords: string[] = [];
  negativeKeywords: string[] = [];
  boostedKeywords: { [key: string]: number } = {};
  settingsLastUpdated = 0;

  async updateSettings() {
    this.settingsLastUpdated = Date.now();
    this.settings = require(this.SETTINGS_PATH);
    this.keywords = this.settings.keywords.map((keyword: string) => keyword.toLowerCase());
    this.partialKeywords = this.settings.partialKeywords.map((keyword: string) => keyword.toLowerCase());
    this.negativeKeywords = this.settings.negativeKeywords.map((keyword: string) => keyword.toLowerCase());
    this.boostedKeywords = this.settings.boostedKeywords;
    // Add boosted keywords to partial keywords
    this.partialKeywords.push(...Object.keys(this.boostedKeywords));
  }

  async handleEvent(evt: RepoEvent) {
    if (Date.now() - this.settingsLastUpdated > 10000) {
      await this.updateSettings();
    }

    if (!isCommit(evt)) return
    const ops = await getOpsByType(evt)
    
    const postsToDelete = ops.posts.deletes.map((del) => del.uri)
    const postsToCreate = ops.posts.creates
      .filter((create) => {
        let match = !create.record.reply && (!create.record.langs || create.record.langs?.includes("en"));
        if (match) {
          match = hasMatch(create.record.text, this.keywords, this.partialKeywords, this.negativeKeywords);
        }
        if (match) {
          this.count++;
          const split = create.uri.split("/");
          // https://github.com/bluesky-social/atproto/discussions/2523
          const url = `https://bsky.app/profile/${split[2]}/post/${split[split.length - 1]}`
          // console.log("--------------------------------------------------------");
          console.log(url);
          console.log(create.record.text);
          console.log(this.count);
        }
        return match
      })
      .map((create) => {
        const mod = calculateMod(create.record.text, this.boostedKeywords);
        // Map matched posts to a db row
        // console.dir(create);
        const now = Date.now();
        return {
          uri: create.uri,
          cid: create.cid,
          first_indexed: now,
          score: 0,
          last_scored: 0,
          mod: mod,
        }
      })

    if (postsToDelete.length > 0) {
      await this.db
        .deleteFrom('post')
        .where('uri', 'in', postsToDelete)
        .execute()
    }
    if (postsToCreate.length > 0) {
      await this.db
        .insertInto('post')
        .values(postsToCreate)
        .onConflict((oc) => oc.doNothing())
        .execute()
    }
  }
}
