package com.moe.services

import com.google.gson.JsonParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AgentSeatTrackerTest {
    private val saved = mutableListOf<List<String>>()
    private val deregistered = mutableListOf<String>()

    private fun tracker(previousSession: List<String> = emptyList()) =
        AgentSeatTracker(load = { previousSession }, save = { saved += it }, deregister = { deregistered += it })

    @Test
    fun `closing a tab deregisters the seat and forgets it only on the daemon ack`() {
        val seats = tracker()
        seats.launched("worker-aaaa1111")
        seats.closed("worker-aaaa1111")
        assertEquals(listOf("worker-aaaa1111"), deregistered)
        assertEquals(listOf("worker-aaaa1111"), saved.last())

        seats.acked("worker-aaaa1111")
        assertEquals(emptyList<String>(), saved.last())
        seats.resendGone()
        assertEquals(1, deregistered.size)
    }

    @Test
    fun `every seat of the previous IDE session is deregistered at the first connect`() {
        val seats = tracker(previousSession = listOf("architect-11112222", "qa-33334444"))
        seats.launched("worker-55556666")
        seats.resendGone()
        assertEquals(listOf("architect-11112222", "qa-33334444"), deregistered)
    }

    @Test
    fun `an unacked send is retried at every connect and open tabs are never touched`() {
        val seats = tracker()
        seats.launched("worker-aaaa1111")
        seats.launched("qa-bbbb2222")
        seats.closed("qa-bbbb2222") // sent while disconnected: dropped
        seats.resendGone()
        seats.resendGone()
        assertEquals(listOf("qa-bbbb2222", "qa-bbbb2222", "qa-bbbb2222"), deregistered)
        seats.closed("qa-bbbb2222") // a second dispose of the same tab sends nothing
        assertEquals(3, deregistered.size)
    }

    @Test
    fun `the sender speaks the daemon DEREGISTER_WORKER message and stays quiet when disconnected`() {
        val sent = mutableListOf<String>()
        var connected = false
        var disconnections = 0
        val sender = MoeCommandSender(
            connectedCheck = { connected },
            onDisconnected = { disconnections++ },
            send = { _, message -> sent += message; true }
        )
        sender.deregisterWorker("worker-aaaa1111", "terminal_closed")
        assertTrue(sent.isEmpty())
        assertEquals(0, disconnections)

        connected = true
        sender.deregisterWorker("worker-aaaa1111", "terminal_closed")
        val envelope = JsonParser.parseString(sent.single()).asJsonObject
        assertEquals("DEREGISTER_WORKER", envelope["type"].asString)
        assertEquals("worker-aaaa1111", envelope["payload"].asJsonObject["workerId"].asString)
        assertEquals("terminal_closed", envelope["payload"].asJsonObject["reason"].asString)
    }
}
