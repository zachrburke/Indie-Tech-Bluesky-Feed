import { QueryParams } from '../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { AppContext } from '../config'
import { BskyAgent } from '@atproto/api';

async function calculateScores(ctx: AppContext, agent: BskyAgent) {
  // Go through the database and calculate likes for each post
  let builder = ctx.db
    .selectFrom('post')
    .selectAll()
    .orderBy('indexedAt', 'desc')
    .orderBy('cid', 'desc')
    .limit(50)

  const res = await builder.execute()

  for (const row of res) {
    // console.dir(row);
    const post = await agent.getPostThread({
      uri: row.uri,
      depth: 1,
    });
    const likeCount = (<any>post.data.thread.post)?.likeCount as number ?? 0;
    // Update the database with the like count
    console.log("Updating score for post: " + row.uri + " to " + likeCount);
    await ctx.db.insertInto('post')
      .values({
        uri: row.uri,
        cid: row.cid,
        indexedAt: row.indexedAt,
        score: likeCount,
      })
      .onConflict((oc) => oc.doUpdateSet({
        score: likeCount,
      }))
      .execute();
  }
}

// max 15 chars
export const shortname = "vibes";

export const handler = async (ctx: AppContext, params: QueryParams, agent: BskyAgent) => {
  await calculateScores(ctx, agent);
  
  let builder = ctx.db
    .selectFrom('post')
    .selectAll()
    .orderBy('indexedAt', 'desc')
    .orderBy('cid', 'desc')
    .limit(params.limit)

  if (params.cursor) {
    const timeStr = new Date(parseInt(params.cursor, 10)).toISOString()
    builder = builder.where('post.indexedAt', '<', timeStr)
  }
  const res = await builder.execute()

  for (const row of res) {
    console.log(row);
  }

  const feed = res.map((row) => ({
    post: row.uri,
  }))

  let cursor: string | undefined
  const last = res.at(-1)
  if (last) {
    cursor = new Date(last.indexedAt).getTime().toString(10)
  }

  return {
    cursor,
    feed,
  }
}
