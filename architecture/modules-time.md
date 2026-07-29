# Architecture: Time

This authority owns the Time module’s built Countdown surface and designed schedule work.

### 4.5 Time

Status: Built — Countdown only

Time separates *public scheduled behavior* from *private kernel scheduling*, and that separation is
the entire point of the module. Kernel timers and reminders maintain outbox delivery and other private recovery pumps. Those are
infrastructure, and by convention their reminder names begin `db.` — the kernel outbox registers
`db.outbox`. The prefix is a reading aid for whoever inspects a reminder table, not an enforced
reservation: no code validates it, and durable state keys deliberately do not follow it at all, which
is why AI direct-session keys are `ai.*`. Time neurons, by contrast, are addressable schedules that
Tasks, modules, and (once the rail exists) Behaviors may talk to — consumers today are ordinary C#
and compositions, not installed Behaviors. Callers must never see `IGrainTimer`, `IGrainReminder`,
`TickStatus`, or a raw reminder name.

The implemented public vocabulary is `DigitalBrain.Time.ICountdown`, a durable one-shot duration.
Its Contracts and runtime packages, deterministic `TimeProvider` test edge, durable Orleans-reminder
wake authority, revision fencing, idempotent commands, cancellation, restart, and committed
`CountdownElapsed` delivery are exercised in `DigitalBrain.Time.Tests`. It is `ICountdown` and not
`ITimer` because .NET 10 already defines `System.Threading.ITimer`.

Everything beyond Countdown remains designed or open and unbuilt: `IReminder`, absolute reminders,
recurring interval and calendar schedules, DST handling, recurrence records, and the recurrence
library. There is no `ScheduleReminder` or `ReminderSnapshot` contract in the repository, and this
document does not freeze either shape.

What is settled, and why each rule is there:

- **Durability is the promise; precision is not.** Both survive deactivation and silo failure, because
  a schedule that dies with an activation was never a schedule. Neither claims real-time accuracy: an
  occurrence is never intentionally early and is eventually observed after its due time. Anything
  needing a hard deadline needs something other than a wake-up.
- **A schedule is a thing you can address, not a callback you registered.** Each logical schedule is
  one neuron identity with one lifecycle, one current revision, and an explicitly named destination.
  "Who configured this?" and "who receives the occurrence?" are different questions with different
  answers, which is what keeps delivery to another owner from becoming an accident — it requires an
  explicit grant that does not exist yet.
- **Scheduling is obtained by addressing a schedule, never by inheriting a hook.** There is no
  inheritance-based reminder handling in this architecture. `ICountdown` is the implemented schedule
  neuron; a future `IReminder` will be separate. A module reaches public scheduled behavior by talking
  to a schedule neuron, while its own private timing stays inside that module.
  `ReceiveReminder` is not part of the public neuron surface. Base `Neuron` does not implement
  `IRemindable`; the kernel outbox wakeup is composed, and Tasks, AI, and Time each own private
  reminder names and reject unknown names. The alternative is worse than it looks:
  once a base class exposes a reminder hook, every subclass that wants a wake-up overrides it, each
  one has to know which names its ancestors already claimed and chain to `base` for the rest, and the
  answer to "whose reminder is this?" ends up spread along an inheritance chain instead of living in
  one neuron.
- **Repeating a request has to be safe, because a caller that crashed cannot know whether it was
  heard.** Start applies only from unscheduled; reschedule and cancel only from scheduled and only
  against an expected revision; restart begins a new generation rather than resurrecting an old one.
  Every mutation carries a `CommandId` whose repeat returns the recorded result. Transitions emit
  typed facts, so a schedule's history can be read without opening opaque Orleans state.
- **Orleans rings the bell; it stores nothing.** Persisted Time state is the authority and the Orleans
  adapter is only a wake-up mechanism. A callback carries schedule identity, revision, and occurrence
  identity and nothing else — never a stored action or payload — which is what lets an uncommitted or
  late callback be recognised and dropped instead of firing work the schedule no longer describes.
  The ordering that earns that property is itself settled, because a crash between any two of its
  steps has to leave a readable state: register the revision-fenced wake-up first, then persist the
  schedule, then retire the previous registration; on cancel, persist `Cancelled` before touching a
  registration at all. A wake-up whose schedule was never committed finds no matching revision, a
  wake-up from a registration already superseded finds a newer one, and a wake-up for a cancelled
  schedule finds a terminal state — all three are dropped rather than acted on.
- **Durable delivery is one mechanism: the Orleans reminder.** Countdown does not arm activation-local
  `TimeProvider` timers or grain-to-self wake interfaces. The reminder is the sole wake authority;
  early ticks re-arm the remaining due, and late ticks beyond one reminder period mark
  `CountdownResolution.Recovered` while on-time ticks mark `OnTime`. Deduplication is by generation,
  revision, and committed occurrence — not by racing two schedulers.
- **Elapsed duration and wall-clock recurrence are different problems and get different types.**
  `IntervalSchedule` is a duration anchored to an instant; `CalendarSchedule` is a wall-clock rule in
  an IANA zone. DST is resolved deterministically instead of inherited from a library default: an
  occurrence inside a gap moves to the first valid instant after it, an overlap fires once at the
  earlier instant, and the fact preserves requested local time, resolved instant, offset, and the
  adjustment that was applied.
- **A missed occurrence is news, not a backlog to replay.** An overdue one-shot occurs once after
  recovery. Recurring misses collapse into a single overdue fact carrying first and last missed time,
  count, recovery time, and revision, and the schedule then advances to the next future occurrence. A
  Reminder is a wake-up, not a durable job queue; work that must happen for every occurrence belongs
  in Tasks, which is the module built not to lose things.
- **The registry indexes schedule contracts, never live schedules.** It indexes the implemented
  `ICountdown` contract and will index a future `IReminder` contract only once that vocabulary exists.
  A running schedule is neuron state, and indexing every instance would turn a compile-time
  vocabulary into a runtime directory that drifts.
- **One reminder provider, because the kernel already requires one.** The outbox needs a durable
  Orleans reminder provider whether or not this module is selected, so Time reuses it and must not add
  a second store. In-memory reminders stay development and test only.
- **Tests must never wait on a clock.** Schedules are driven through `TimeProvider` plus a
  deterministic driver, so a `TestBrain` can advance a week while no wall-clock time passes.

Explicitly still open: the internal calendar recurrence library and the exact reminder, recurring,
calendar, and DST record shapes. Do not implement those as though they were settled.


