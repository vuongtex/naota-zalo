# Changelog

All notable changes to naota-zalo. Newest first.

## [1.12.0] - 2026-11-19

### Fixed
- **A group joined after start-up now has a name.** The thread name cache was built once when `mcp start` began,
  so a group the account joined later (or one whose start-up `getGroupInfo` batch failed) had no name until the
  next restart, and NAOTA listed it under a bare id.
  - A live message from a group the cache does not know waits for one `getGroupInfo` lookup (at most 4 seconds)
    before it enters the live feed, so the consumer reading it already finds the name in `zalo_list_threads`.
    A burst of messages asks once; after a failure the group is not asked again for 10 minutes.
  - Messages recovered after an outage get the same lookup (up to 30 groups, in parallel) before they are fed.
  - Group events that carry the group's name (a rename, this account being added) update the cache.
  - `zalo_list_threads` returns `name: null` instead of the cache's `"?"` placeholder.

## [1.11.0] - 2026-11-13

### Added
- `zalo_send_message` takes an optional `replyToMsgId`: the id of an earlier text message in the same
  thread. The message goes out as a reply to it, so Zalo shows the quoted message above it. Useful
  when a contact sent several messages and only one needs an answer. If the message is unknown, has no
  client id or is not a text message, nothing is sent and the error says why. Without `replyToMsgId`
  the message goes out exactly as before.

## [1.10.0] - 2026-11-11

### Added
- **Live push instead of polling.** With `NAOTA_ZALO_PUSH_URL` set, the MCP server tells the local consumer the moment
  something lands in the live feed, and when the Zalo connection goes up or down, so NAOTA no longer asks every 20
  seconds on accounts where nothing arrives. A burst of messages is one request; a failed request is retried with a
  growing pause (1 s up to 30 s).
- Safety: the URL must point at this machine (`127.0.0.1`, `localhost`, `::1`) and carry no credentials, otherwise
  live push stays off. The request is only a wake-up signal: it never carries message content. Without the variable
  nothing is sent and polling works as before.

## [1.9.1] - 2026-11-08

### Fixed
- Messages that reached the history (`zalo_get_history`) but never the live feed (`zalo_get_messages`), so a chat
  stopped in the inbox while the phone went on. Two paths did that:
  - **A short drop.** Zalo replays recent messages after every connect, and the replay always filled the history,
    but it reached the live feed only for a gap the sync log had recorded, and drops shorter than 5 s are not
    recorded. The socket reconnects within seconds, so most drops were that short. Every reconnect now puts the
    replayed messages from 5 minutes before the drop into the live feed; the buffer skips the ones it already holds.
  - **A message that made the handler throw.** The messages of one frame are emitted in a loop, so an exception in
    the "message" handler dropped every later message of that frame without a trace. The message, reaction and
    group-event handlers are now guarded: an exception costs only its own event and is logged.
- The listener's "error" events are logged (at most one line a minute) instead of ignored: a frame that could not
  be decoded is reported there, and that is a lost message too.
## [1.9.0] - 2026-11-01

First release of naota-zalo for NAOTA: QR sign-in, multi-account, read and send messages and
files, reactions, typing indicator, group notes, reminders, polls, labels, join requests, and an
MCP server (stdio or HTTP) that NAOTA pins by release tag.
