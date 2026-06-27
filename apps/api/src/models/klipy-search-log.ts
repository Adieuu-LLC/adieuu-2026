/**
 * Klipy search log model.
 *
 * Records anonymised search terms so we can understand what users
 * search for over time.  No identity or IP linkage.
 */

import type { ObjectId } from 'mongodb';
import type { KlipyContentType } from '../services/klipy.service';
import { getCollection, Collections } from '../db';
import elog from '../utils/adieuuLogger';

export interface KlipySearchLogDocument {
  _id: ObjectId;
  term: string;
  type: KlipyContentType;
  timestamp: Date;
}

/**
 * Inserts an anonymised search log entry (fire-and-forget).
 */
export async function logKlipySearch(term: string, type: KlipyContentType): Promise<void> {
  try {
    const col = getCollection<KlipySearchLogDocument>(Collections.KLIPY_SEARCH_LOGS);
    await col.insertOne({
      term: term.toLowerCase().trim().slice(0, 100),
      type,
      timestamp: new Date(),
    } as KlipySearchLogDocument);
  } catch (err) {
    elog.warn('Failed to log Klipy search (non-blocking)', { error: err });
  }
}
