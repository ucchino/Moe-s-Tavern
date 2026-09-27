package com.moe.services

/**
 * Worker seats this IDE launched into its own terminal tabs.
 *
 * A wrapper killed together with its tab — the tab closed, the IDE exited or
 * crashed — never runs the exit trap that deregisters it, so its worker keeps
 * every task it held (WORKING/PLANNING rows are never released for idleness)
 * and a daemon restart even holds a mid-task row for a runner that will never
 * reattach. The IDE knows those seats are gone, so it deregisters them itself.
 *
 * [known] is persisted and outlives the IDE: a seat leaves it only when a
 * daemon acks the deregistration, because a send made while the IDE shuts down
 * may never be processed. [open] lives for this IDE session only, so at startup
 * every known seat counts as gone and is deregistered at the first connect.
 */
class AgentSeatTracker(
    load: () -> List<String>,
    private val save: (List<String>) -> Unit,
    private val deregister: (workerId: String) -> Unit
) {
    private val known = LinkedHashSet(load())
    private val open = HashSet<String>()

    @Synchronized
    fun launched(workerId: String) {
        open += workerId
        if (known.add(workerId)) save(known.toList())
    }

    /** The seat's tab is gone: deregister now (dropped when disconnected; [resendGone] retries). */
    @Synchronized
    fun closed(workerId: String) {
        if (open.remove(workerId)) deregister(workerId)
    }

    /** On every daemon connect: deregister each known seat whose tab is gone. */
    @Synchronized
    fun resendGone() {
        known.filter { it !in open }.forEach(deregister)
    }

    @Synchronized
    fun acked(workerId: String) {
        if (known.remove(workerId)) save(known.toList())
    }
}
