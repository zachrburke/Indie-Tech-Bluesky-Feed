import { QueryParams } from '../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { AppContext } from '../config'
import { BskyAgent } from '@atproto/api';
import { log } from 'console-log-colors';

async function deletePost(ctx: AppContext, uri: string) {
  await ctx.db.deleteFrom('post')
    .where('uri', '=', uri)
    .execute()
}

function calculateScore(timeInHours: number, likes: number) {
  // Hacker News algorithm
  return likes / Math.pow(timeInHours + 2, 1.8);
}

async function refreshScores(ctx: AppContext, agent: BskyAgent) {
  // Go through the database and calculate likes for each post
  const MIN_DELAY = 1000 * 60; // 1 minute
  const currentTime = Date.now();
  let builder = ctx.db
    .selectFrom('post')
    .selectAll()
    .where('last_scored', '<', currentTime - MIN_DELAY)
    .orderBy('first_indexed', 'desc')

  const res = await builder.execute()

  for (const row of res) {
    // console.dir(row);
    const post = await agent.getPostThread({
      uri: row.uri,
      depth: 1,
    }).catch((err) => {
      console.error(err);
      return null;
    });
    if (post == null) {
      console.error("Failed to get post, deleting: " + row.uri);
      await deletePost(ctx, row.uri);
      continue;
    }
    const likeCount = (<any>post.data.thread.post)?.likeCount as number ?? 0;
    const repostCount = (<any>post.data.thread.post)?.repostCount as number ?? 0;
    const indexedTime = row.first_indexed;
    const score = calculateScore((currentTime - indexedTime) / 1000 / 60 / 60, likeCount + repostCount);
    console.log("Updating score for post: " + row.uri + " to " + score);
    await ctx.db.insertInto('post')
      .values({
        uri: row.uri,
        cid: row.cid,
        first_indexed: indexedTime,
        score: score,
        last_scored: currentTime
      })
      .onConflict((oc) => oc.doUpdateSet({
        score: score,
        last_scored: currentTime
      }))
      .execute();
  }
  logPosts(ctx, agent, 10);
}

function uriToUrl(uri: string) {
  const split = uri.split("/");
  // https://github.com/bluesky-social/atproto/discussions/2523
  const url = `https://bsky.app/profile/${split[2]}/post/${split[split.length - 1]}`
  return url;
}

async function logPosts(ctx: AppContext, agent: BskyAgent, limit: number) {
  console.log("Logging posts for debugging...");
  let builder = ctx.db
    .selectFrom('post')
    .selectAll()
    .orderBy('score', 'desc')
    .orderBy('first_indexed', 'desc')
    .limit(limit)

  const res = await builder.execute()

  for (const row of res) {
    const post = await agent.getPostThread({
      uri: row.uri,
      depth: 1,
    }).catch((err) => {
      console.error(err);
      return null;
    });
    const data = (<any>post?.data.thread.post);
    const author = data?.author.displayName;
    const text = data?.record.text;
    const likes = data?.likeCount;
    console.log("--------------------------------------------------------");
    log.green("Author: " + author);
    log.yellow("Text: " + text);
    log.red("Likes: " + likes);
    log.magenta("Score: " + row.score);
    log.cyan(uriToUrl(row.uri));
  }
}

// max 15 chars
export const shortname = "vibes";

export const handler = async (ctx: AppContext, params: QueryParams, agent: BskyAgent) => {
  // Trigger a refresh asynchronously
  refreshScores(ctx, agent);
  
  let builder = ctx.db
    .selectFrom('post')
    .selectAll()
    .orderBy('score', 'desc')
    .orderBy('first_indexed', 'desc')
    .limit(params.limit)

  if (params.cursor) {
    builder = builder.where('post.first_indexed', '<', parseInt(params.cursor, 10))
  }
  const res = await builder.execute()

  for (const row of res) {
    console.log(row);
    console.log(uriToUrl(row.uri));
  }

  const feed = res.map((row) => ({
    post: row.uri,
  }))

  let cursor: string | undefined
  const last = res.at(-1)
  if (last) {
    cursor = last.first_indexed + "";
  }

  return {
    cursor,
    feed,
  }
}
