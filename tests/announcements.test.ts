import { describe, expect, it, vi } from "vitest";
import { announcementInput, listAnnouncements, type Announcement } from "../src/announcements.js";
import type { Course } from "../src/types.js";
const course = (id: number) => ({ id, name: `Course ${id}`, code: null, homeUrl: 'https://elearn.smu.edu.sg', isPinned: true } as Course);
const item = (id: number, overrides: Partial<Announcement> = {}): Announcement => ({ Id: id, Title: 'Exam update', Body: { Text: 'Room change' }, IsHidden: false, IsPublished: true, StartDate: '2026-10-20T01:00:00Z', ...overrides });
const now = new Date('2026-10-21T00:00:00Z');
function client(items: Announcement[]) {
  return { listCourses: vi.fn(async () => [course(1)]), getAnnouncements: vi.fn(async () => items) };
}
describe('announcements', () => {
  it('defaults to pinned courses and returns body and attachment metadata without downloads', async () => {
    const c = client([item(1, { Attachments: [{ FileId: 3, FileName: 'notice.pdf', FileSize: 10 }] })]);
    const result = await listAnnouncements(c, announcementInput.parse({}), now);
    expect(c.listCourses).toHaveBeenCalledWith({ activeOnly: true, pinnedOnly: true });
    expect(result).toMatchObject({ count: 1, partial: false, announcements: [{ body: { Text: 'Room change' }, attachments: [{ FileId: 3 }] }] });
  });
  it('excludes hidden, draft, future, and expired announcements', async () => {
    const c = client([item(1), item(2, { IsHidden: true }), item(3, { IsPublished: false }), item(4, { StartDate: '2026-10-22T00:00:00Z' }), item(5, { EndDate: now.toISOString() })]);
    expect((await listAnnouncements(c, announcementInput.parse({}), now)).announcements.map(x => x.id)).toEqual([1]);
  });
  it('searches body and filters inclusive publication times with offsets', async () => {
    const c = client([item(1), item(2, { StartDate: null, CreatedDate: null })]);
    const r = await listAnnouncements(c, announcementInput.parse({ query: 'ROOM', since: '2026-10-20T09:00:00+08:00', until: '2026-10-20T09:00:00+08:00' }), now);
    expect(r.announcements.map(x => x.id)).toEqual([1]);
  });
  it('reports failed, unavailable, capped courses and truncated announcements', async () => {
    const c = { listCourses: vi.fn(async () => [course(1), course(2), course(3)]), getAnnouncements: vi.fn(async (id: number) => { if (id === 2) throw new Error('Denied'); return [item(1), item(2)]; }) };
    const r = await listAnnouncements(c, announcementInput.parse({ courseIds: [1, 2, 3, 99], maxCourses: 2, limit: 1 }), now);
    expect(r).toMatchObject({ partial: true, count: 1, omittedCourses: 1, omittedAnnouncements: 1, unavailableCourseIds: [99], failures: [{ courseId: 2 }] });
  });
  it('rejects reversed ranges before making requests', async () => {
    const c = client([]);
    await expect(listAnnouncements(c, announcementInput.parse({ since: '2026-10-22T00:00:00Z', until: '2026-10-21T00:00:00Z' }), now)).rejects.toMatchObject({ code: 'INVALID_DATE_RANGE' });
    expect(c.listCourses).not.toHaveBeenCalled();
  });
});
