import {
  OutputSchema as RepoEvent,
  isCommit,
} from './lexicon/types/com/atproto/sync/subscribeRepos'
import { FirehoseSubscriptionBase, getOpsByType } from './util/subscription'

export class FirehoseSubscription extends FirehoseSubscriptionBase {
  async handleEvent(evt: RepoEvent) {
    if (!isCommit(evt)) return
    const ops = await getOpsByType(evt)

    // This logs the text of every post off the firehose.
    // Just for fun :)
    // Delete before actually using
    // for (const post of ops.posts.creates) {
    //   console.log(post.record.text)
    // }

    const keywords = [
      "hello world",
      "hello, world",
      "ola mundo",
      "ola, mundo",
      "developers",
      "#opensource",
      "#gamedev",
      "#indiedev",
      "#webdev",
      "#programming",
      "#coding",
      "#foss",
      "#ux",
      "#ui",
      "#design",
      "open source",
      "i developed",
      "#hardware",
      "#software",
      "hi"
    ];

    const negativeKeywords = [
      "#art",
      "#drawing",
      "#sketch",
    ];
    

    const postsToDelete = ops.posts.deletes.map((del) => del.uri)
    const postsToCreate = ops.posts.creates
      .filter((create) => {
        // Only matched posts
        const matched = keywords.some(keyword => create.record.text.toLowerCase().includes(keyword))
          && !negativeKeywords.some(keyword => create.record.text.toLowerCase().includes(keyword))
        if (matched) {
          const split = create.uri.split("/");
          // https://github.com/bluesky-social/atproto/discussions/2523
          const url = `https://bsky.app/profile/${split[2]}/post/${split[split.length - 1]}`
          // console.log("--------------------------------------------------------");
          // console.log(url);
          // console.log(create.record.text);
        }
        return matched
      })
      .map((create) => {
        // Map matched posts to a db row
        // console.dir(create);
        return {
          uri: create.uri,
          cid: create.cid,
          indexedAt: new Date().toISOString(),
          score: 0,
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
