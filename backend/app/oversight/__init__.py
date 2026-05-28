"""Oversight pipeline: risk scoring, audit logging, approval queue.

The verifiability story we sell to Will Lewis (Duku), the Overmind judges, and
Gelberg (10 Downing St). Every tool call passes through this layer before
execution; every event is appended to an immutable JSONL audit log.
"""
