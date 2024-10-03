import { QueryParams } from '../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { AppContext } from '../config'
import { BskyAgent } from '@atproto/api';
import { log } from 'console-log-colors';
import axios from 'axios';

// max 15 chars
export const shortname = "tech-vibes";

const SETTINGS_PATH = "../settings.json";
const SECRETS_PATH = "../secrets.json";
const REQUEST_METRIC = "bluesky.feed.request";
const REFRESH_METRIC = "bluesky.feed.refresh";

const settings = require(SETTINGS_PATH);
const secrets = require(SECRETS_PATH);

const pinnedPosts = settings.pinnedPosts;
let intervalsScheduled = false;
let feedSubscribers: String[] = [];

async function updateFeedSubscribers(agent: BskyAgent) {
  console.log("Getting likes...");
  const feedUri = "at://did:plc:xcariuurag22domm7jgn4goj/app.bsky.feed.generator/tech-vibes";
  const likes = await agent.getLikes({
    uri: feedUri,
  }).catch((err) => {
    console.error(err);
    return null;
  });
  if (likes == null) {
    return;
  }
  feedSubscribers = likes.data.likes.map((like: any) => like.actor?.did);;
  console.log("Number of likes: " + likes.data.likes.length);
}

async function incrementMetric(metric: String, value: number = 1) {
  if (settings.publishMetrics === false) {
    return;
  }
  console.log("Incrementing metric: " + metric + " by " + value);
  const url = 'https://metric-api.newrelic.com/metric/v1';
  const apiKey = secrets.newrelicKey;
  const data = [{
      "metrics": [{
          "name": metric,
          "type": "count",
          "value": value,
          "timestamp": Date.now(),
          "interval.ms": 1
      }]
  }];

  try {
      const response = await axios.post(url, data, {
          headers: {
              'Content-Type': 'application/json',
              'Api-Key': apiKey,
          },
          httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }) // This corresponds to the -k option in curl
      });
      // console.log('New Relic post response:', response.data);
  } catch (error) {
      console.error('Error posting New Relic metric:', error);
  }
}

function calculateScore(uri: string, timeInHours: number, likes: number) {
  const did = uri.split("/")[2];
  if (feedSubscribers.includes(did)) {
    // If the user has liked the feed, give the post a boost
    likes += settings.subscriberBoost;
    console.log("Post from subscriber: " + uri);
  }
  // Hacker News algorithm
  return likes / Math.pow(timeInHours + 2, 2.2);
}

async function refreshScores(ctx: AppContext, agent: BskyAgent) {
  // Go through the database and calculate likes for each post
  const MIN_DELAY = 1000 * 60 * 6; // 6 minutes
  const currentTime = Date.now();
  let builder = ctx.db
    .selectFrom('post')
    .selectAll()
    .where('last_scored', '<', currentTime - MIN_DELAY)
    .orderBy('first_indexed', 'desc')

  const res = await builder.execute()

  for (const row of res) {
    // console.dir(row);
    let errorStatus = 0;
    const post = await agent.getPostThread({
      uri: row.uri,
      depth: 1,
    }).catch((err) => {
      console.error(err);
      errorStatus = err.status;
      return null;
    });
    if (post == null) {
      // console.error("Failed to get post, deleting: " + row.uri);
      // await deletePost(ctx, row.uri);
      continue;
    }
    const likeCount = (<any>post.data.thread.post)?.likeCount as number ?? 0;
    const repostCount = (<any>post.data.thread.post)?.repostCount as number ?? 0;
    const indexedTime = row.first_indexed;
    const score = calculateScore(row.uri, (currentTime - indexedTime) / 1000 / 60 / 60, likeCount + repostCount + row.mod);
    // console.log("Updating score for post: " + row.uri + " to " + score);
    await ctx.db.insertInto('post')
      .values({
        uri: row.uri,
        cid: row.cid,
        first_indexed: indexedTime,
        score: score,
        last_scored: currentTime,
        mod: row.mod
      })
      .onConflict((oc) => oc.doUpdateSet({
        score: score,
        last_scored: currentTime
      }))
      .execute();
  }
  if (res.length > 0) {
    incrementMetric(REFRESH_METRIC, res.length);
    console.log("Updated " + res.length + " score(s) at: " + new Date().toLocaleString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true }));
  }
  // logPosts(ctx, agent, 10);
}

async function deleteStalePosts(ctx: AppContext) {
  // Delete all posts in the db older than 1.5 days with a score less than 0.1
  log.red("Deleting stale posts...");
  const currentTime = Date.now();
  const ONE_AND_A_HALF_DAYS = 1000 * 60 * 60 * 24 * 1.5;
  // const TEN_SECONDS = 1000 * 10;
  let builder = ctx.db
    .deleteFrom('post')
    .where('first_indexed', '<', currentTime - ONE_AND_A_HALF_DAYS)
    .where('score', '<', 0.1)
  await builder.execute();
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

export const handler = async (ctx: AppContext, params: QueryParams, agent: BskyAgent) => {
  incrementMetric(REQUEST_METRIC);

  if (!intervalsScheduled) {
    log.yellow("Scheduling intervals...");
    // Schedule a refresh of scores every 15 minutes
    setInterval(() => {
      refreshScores(ctx, agent);
      updateFeedSubscribers(agent);
    }, 1000 * 60 * 15);

    // Schedule a cleanup of stale posts every 2 hours
    setInterval(() => {
      deleteStalePosts(ctx);
    }, 1000 * 60 * 60 * 2);

    intervalsScheduled = true;
  }

  // Trigger a refresh asynchronously
  refreshScores(ctx, agent);
  updateFeedSubscribers(agent);
  
  let builder = ctx.db
    .selectFrom('post')
    .selectAll()
    .where('score', '>', 0)
    .orderBy('score', 'desc')
    .orderBy('first_indexed', 'desc')
    .limit(params.limit)

  if (params.cursor) {
    builder = builder.where('post.first_indexed', '<', parseInt(params.cursor, 10))
  }
  const res = await builder.execute()

  // for (const row of res) {
  //   console.log(row);
  //   console.log(uriToUrl(row.uri));
  // }

  const feed = res.map((row) => ({
    post: row.uri,
  }))

  // Add pinned posts to top of feed
  for (const post of pinnedPosts) {
    feed.unshift({
      "post": post
    });
  }

  let cursor: string | undefined
  const last = res.at(-1)
  if (last) {
    cursor = last.first_indexed + "";
  }

  console.log("Responding to request with " + feed.length + " posts");

  return {
    cursor,
    feed,
  }
}
