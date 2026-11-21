/**
 * In-process registry of open message streams. Events are only delivered to the participants of a conversation,
 * because publishers name the user ids to notify. A stream never accepts a conversation id, so there is nothing to forge.
 */

export type SendFrame = (event: string, data: unknown) => void;

interface Connection {
  id: number;
  userId: string;
  sessionKey: string;
  send: SendFrame;
  end: () => void;
}

export function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export class MessageHub {
  private nextId = 1;
  private readonly connections = new Map<number, Connection>();
  private sessionLive: (sessionKey: string) => boolean = () => true;

  /** Installed by the routes that own the database. A session that fails the check receives no further events. */
  setSessionCheck(check: (sessionKey: string) => boolean): void {
    this.sessionLive = check;
  }

  open(input: { userId: string; sessionKey: string; send: SendFrame; end: () => void }): number {
    const id = this.nextId;
    this.nextId += 1;
    this.connections.set(id, { id, ...input });
    return id;
  }

  remove(id: number): void {
    this.connections.delete(id);
  }

  countFor(userId: string): number {
    let count = 0;
    for (const connection of this.connections.values()) {
      if (connection.userId === userId) count += 1;
    }
    return count;
  }

  publish(userIds: readonly string[], event: string, data: unknown): void {
    const targets = new Set(userIds);
    for (const connection of [...this.connections.values()]) {
      if (!targets.has(connection.userId)) continue;
      // A revoked or expired session gets no further events, even before its periodic check runs.
      if (!this.sessionLive(connection.sessionKey)) {
        this.connections.delete(connection.id);
        connection.end();
        continue;
      }
      try {
        connection.send(event, data);
      } catch {
        this.remove(connection.id);
      }
    }
  }

  /** Ends the account's other streams, for example after a password change. The current session keeps its stream. */
  closeUserExcept(userId: string, keepSessionKey: string): void {
    for (const connection of [...this.connections.values()]) {
      if (connection.userId !== userId || connection.sessionKey === keepSessionKey) continue;
      this.connections.delete(connection.id);
      connection.end();
    }
  }

  /** Ends every stream that was opened with this session. Used on logout, session rotation and expiry. */
  closeSession(sessionKey: string): void {
    for (const connection of [...this.connections.values()]) {
      if (connection.sessionKey !== sessionKey) continue;
      this.connections.delete(connection.id);
      connection.end();
    }
  }

  get size(): number {
    return this.connections.size;
  }
}
