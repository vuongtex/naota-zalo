# Changelog

All notable changes to naota-zalo. Newest first.

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
