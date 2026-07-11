import { ObjectId, type Filter, type Sort } from 'mongodb';
import { getCollection } from '../db';
import { Collections } from '../db/mongo';
import type { SiteAnnouncementDocument } from '../models/site-announcement';

export interface CreateAnnouncementInput {
  message: string;
  title?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  highPriority: boolean;
  dismissable: boolean;
  showAfter?: Date;
  showUntil?: Date;
  active: boolean;
  createdBy: string;
}

export type UpdateAnnouncementInput = Omit<CreateAnnouncementInput, 'createdBy'>;

export class SiteAnnouncementRepository {
  private collection = getCollection<SiteAnnouncementDocument>(Collections.SITE_ANNOUNCEMENTS);

  async findById(id: string): Promise<SiteAnnouncementDocument | null> {
    if (!ObjectId.isValid(id)) return null;
    return (await this.collection.findOne({ _id: new ObjectId(id) })) as SiteAnnouncementDocument | null;
  }

  async listAll(): Promise<SiteAnnouncementDocument[]> {
    const sort: Sort = { createdAt: -1 };
    return (await this.collection.find({}).sort(sort).limit(200).toArray()) as SiteAnnouncementDocument[];
  }

  async findVisible(): Promise<SiteAnnouncementDocument[]> {
    const now = new Date();
    const filter: Filter<SiteAnnouncementDocument> = {
      active: true,
      $or: [
        { showAfter: { $exists: false } },
        { showAfter: null as unknown as Date },
        { showAfter: { $lte: now } },
      ],
      $and: [
        {
          $or: [
            { showUntil: { $exists: false } },
            { showUntil: null as unknown as Date },
            { showUntil: { $gte: now } },
          ],
        },
      ],
    };
    const sort: Sort = { createdAt: -1 };
    return (await this.collection.find(filter).sort(sort).limit(50).toArray()) as SiteAnnouncementDocument[];
  }

  async create(input: CreateAnnouncementInput): Promise<SiteAnnouncementDocument> {
    const now = new Date();
    const doc: Omit<SiteAnnouncementDocument, '_id'> = {
      message: input.message,
      title: input.title,
      ctaLabel: input.ctaLabel,
      ctaUrl: input.ctaUrl,
      highPriority: input.highPriority,
      dismissable: input.dismissable,
      showAfter: input.showAfter,
      showUntil: input.showUntil,
      active: input.active,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    const result = await this.collection.insertOne(doc as SiteAnnouncementDocument);
    return { ...doc, _id: result.insertedId } as SiteAnnouncementDocument;
  }

  async update(id: string, input: UpdateAnnouncementInput): Promise<SiteAnnouncementDocument | null> {
    if (!ObjectId.isValid(id)) return null;
    const now = new Date();
    const result = await this.collection.findOneAndUpdate(
      { _id: new ObjectId(id) },
      {
        $set: {
          message: input.message,
          title: input.title,
          ctaLabel: input.ctaLabel,
          ctaUrl: input.ctaUrl,
          highPriority: input.highPriority,
          dismissable: input.dismissable,
          showAfter: input.showAfter,
          showUntil: input.showUntil,
          active: input.active,
          updatedAt: now,
        },
      },
      { returnDocument: 'after' },
    );
    return result as SiteAnnouncementDocument | null;
  }

  async setActive(id: string, active: boolean): Promise<SiteAnnouncementDocument | null> {
    if (!ObjectId.isValid(id)) return null;
    const result = await this.collection.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { active, updatedAt: new Date() } },
      { returnDocument: 'after' },
    );
    return result as SiteAnnouncementDocument | null;
  }

  async deleteById(id: string): Promise<boolean> {
    if (!ObjectId.isValid(id)) return false;
    const result = await this.collection.deleteOne({ _id: new ObjectId(id) });
    return result.deletedCount === 1;
  }
}

let repo: SiteAnnouncementRepository | null = null;

export function getSiteAnnouncementRepository(): SiteAnnouncementRepository {
  if (!repo) {
    repo = new SiteAnnouncementRepository();
  }
  return repo;
}
