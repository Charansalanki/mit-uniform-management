import { runInFastTransaction } from '../config/sqliteNode24Engine.js';

export class SqliteWriteBatcher {
  constructor(db, flushIntervalMs = 15, maxBatchSize = 200) {
    this.db = db;
    this.flushIntervalMs = flushIntervalMs;
    this.maxBatchSize = maxBatchSize;
    this.queue = [];
    this.timer = null;
  }

  /**
   * Enqueues a synchronous SQLite write operation and resolves when the micro-batch commits
   * @param {Function} writeTaskFn - () => result (executed inside BEGIN IMMEDIATE ... COMMIT)
   * @returns {Promise<any>}
   */
  enqueueWrite(writeTaskFn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ writeTaskFn, resolve, reject });

      if (this.queue.length >= this.maxBatchSize) {
        if (this.timer) {
          clearTimeout(this.timer);
          this.timer = null;
        }
        this.flush();
      } else if (!this.timer) {
        this.timer = setTimeout(() => {
          this.timer = null;
          this.flush();
        }, this.flushIntervalMs);
      }
    });
  }

  flush() {
    if (this.queue.length === 0) return;
    const batch = this.queue.splice(0, this.maxBatchSize);
    const results = [];

    try {
      // Commit all writes in the batch inside a single disk transaction!
      runInFastTransaction(this.db, () => {
        for (let i = 0; i < batch.length; i++) {
          try {
            const val = batch[i].writeTaskFn();
            results.push({ ok: true, val });
          } catch (itemErr) {
            results.push({ ok: false, err: itemErr });
          }
        }
      });

      for (let i = 0; i < batch.length; i++) {
        if (results[i].ok) {
          batch[i].resolve(results[i].val);
        } else {
          batch[i].reject(results[i].err);
        }
      }
    } catch (txErr) {
      for (const item of batch) {
        item.reject(txErr);
      }
    }

    if (this.queue.length > 0) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.flush();
      }, this.flushIntervalMs);
    }
  }
}

export default { SqliteWriteBatcher };

