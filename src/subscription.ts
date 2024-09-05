import {
  OutputSchema as RepoEvent,
  isCommit,
} from './lexicon/types/com/atproto/sync/subscribeRepos'
import { FirehoseSubscriptionBase, getOpsByType } from './util/subscription'


export class FirehoseSubscription extends FirehoseSubscriptionBase {
  SETTINGS_PATH = "./settings.json";
  MAX_POSTS = 500;

  count = 0;
  settings = require(this.SETTINGS_PATH);
  keywords = this.settings.keywords;
  negativeKeywords = this.settings.negativeKeywords;
  settingsLastUpdated = Date.now();

  async updateSettings() {
    this.settingsLastUpdated = Date.now();
    this.settings = require(this.SETTINGS_PATH);
    this.keywords = this.settings.keywords;
    this.negativeKeywords = this.settings.negativeKeywords;
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
        // Only matched posts
        const matched = !create.record.reply && (!create.record.langs || create.record.langs?.includes("en"))
          && this.count < this.MAX_POSTS && this.keywords.some(keyword => create.record.text.toLowerCase().includes(keyword))
          && !this.negativeKeywords.some(keyword => create.record.text.toLowerCase().includes(keyword));
        if (matched) {
          this.count++;
          const split = create.uri.split("/");
          // https://github.com/bluesky-social/atproto/discussions/2523
          const url = `https://bsky.app/profile/${split[2]}/post/${split[split.length - 1]}`
          // console.log("--------------------------------------------------------");
          console.log(url);
          console.log(create.record.text);
          console.log(this.count);
        }
        return matched
      })
      .map((create) => {
        // Map matched posts to a db row
        // console.dir(create);
        const now = Date.now();
        return {
          uri: create.uri,
          cid: create.cid,
          first_indexed: now,
          score: 0,
          last_scored: now
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
