export type DatabaseSchema = {
  post: Post
  sub_state: SubState
}

export type Post = {
  uri: string
  cid: string
  first_indexed: number
  score: number
  last_scored: number,
  mod: number
}

export type SubState = {
  service: string
  cursor: number
}
