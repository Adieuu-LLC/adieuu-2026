/**
 * Base repository
 * Provides common CRUD operations for MongoDB collections
 */

import {
  Collection,
  Document,
  Filter,
  ObjectId,
  OptionalUnlessRequiredId,
  UpdateFilter,
  WithId,
} from 'mongodb';
import { getCollection } from '../db';
import { withTimestamps, withUpdatedAt, type BaseDocument } from '../models/base';

/**
 * Base repository interface
 */
export interface IRepository<T extends BaseDocument> {
  findById(id: string | ObjectId): Promise<T | null>;
  findOne(filter: Filter<T>): Promise<T | null>;
  findMany(filter: Filter<T>, limit?: number): Promise<T[]>;
  create(data: Omit<T, '_id' | 'createdAt' | 'updatedAt'>): Promise<T>;
  updateById(id: string | ObjectId, update: Partial<Omit<T, '_id' | 'createdAt'>>): Promise<T | null>;
  deleteById(id: string | ObjectId): Promise<boolean>;
  count(filter: Filter<T>): Promise<number>;
}

/**
 * Base repository implementation
 */
export class BaseRepository<T extends BaseDocument> implements IRepository<T> {
  protected collection: Collection<T>;

  constructor(collectionName: string) {
    this.collection = getCollection<T>(collectionName);
  }

  /**
   * Convert string ID to ObjectId
   */
  protected toObjectId(id: string | ObjectId): ObjectId {
    if (id instanceof ObjectId) return id;
    return new ObjectId(id);
  }

  /**
   * Find a document by ID
   */
  async findById(id: string | ObjectId): Promise<T | null> {
    try {
      const objectId = this.toObjectId(id);
      return await this.collection.findOne({ _id: objectId } as Filter<T>) as T | null;
    } catch {
      // Invalid ObjectId format
      return null;
    }
  }

  /**
   * Find a single document by filter
   */
  async findOne(filter: Filter<T>): Promise<T | null> {
    return await this.collection.findOne(filter) as T | null;
  }

  /**
   * Find multiple documents by filter
   */
  async findMany(filter: Filter<T>, limit = 100): Promise<T[]> {
    return await this.collection.find(filter).limit(limit).toArray() as T[];
  }

  /**
   * Create a new document
   */
  async create(data: Omit<T, '_id' | 'createdAt' | 'updatedAt'>): Promise<T> {
    const doc = withTimestamps(data) as OptionalUnlessRequiredId<T>;
    const result = await this.collection.insertOne(doc);
    return { ...doc, _id: result.insertedId } as T;
  }

  /**
   * Update a document by ID
   */
  async updateById(
    id: string | ObjectId,
    update: Partial<Omit<T, '_id' | 'createdAt'>>
  ): Promise<T | null> {
    try {
      const objectId = this.toObjectId(id);
      const updateDoc = withUpdatedAt(update);

      const result = await this.collection.findOneAndUpdate(
        { _id: objectId } as Filter<T>,
        { $set: updateDoc } as UpdateFilter<T>,
        { returnDocument: 'after' }
      );

      return result as T | null;
    } catch {
      return null;
    }
  }

  /**
   * Delete a document by ID
   */
  async deleteById(id: string | ObjectId): Promise<boolean> {
    try {
      const objectId = this.toObjectId(id);
      const result = await this.collection.deleteOne({ _id: objectId } as Filter<T>);
      return result.deletedCount === 1;
    } catch {
      return false;
    }
  }

  /**
   * Count documents matching filter
   */
  async count(filter: Filter<T>): Promise<number> {
    return await this.collection.countDocuments(filter);
  }
}
