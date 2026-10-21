import { describe, expect, it, vi } from "vitest";
import { eventInput, eventWindow, listEvents } from "../src/events.js";
import { D2LClient } from "../src/d2l-client.js";
import { loadConfig } from "../src/config.js";
import type { APIRequestContext, APIResponse } from "playwright-core";
import type { Course } from "../src/types.js";
const endpoint = 'https://elearn.smu.edu.sg/d2l/api/le/1.49/1/calendar/events/myEvents/';
function api(bodies: unknown[]) {
  const get = vi.fn(async () => ({ status: () => 200, headers: () => ({ 'content-type': 'application/json' }), json: async () => bodies.shift() } as unknown as APIResponse));
  return { get, client: new D2LClient({ get } as unknown as APIRequestContext, loadConfig({})) };
}
describe('event windows', () => {
  it('uses the Singapore week even when UTC is still Sunday', () => {
    expect(eventWindow({}, new Date('2026-10-18T17:00:00Z'))).toEqual({ since: '2026-10-18T16:00:00.000Z', until: '2026-10-25T15:59:59.999Z' });
  });
  it('rejects incomplete and reversed windows', () => {
    expect(() => eventWindow({ since: '2026-10-20T00:00:00Z' }, new Date())).toThrow('both');
    expect(() => eventWindow({ since: '2026-10-21T00:00:00Z', until: '2026-10-20T00:00:00Z' }, new Date())).toThrow('on or after');
  });
});
describe('calendar API pagination', () => {
  it('reads all pages and preserves all-day metadata', async () => {
    const { client, get } = api([{ Objects: [{ CalendarEventId: 1 }], Next: endpoint + '?bookmark=1' }, { Objects: [{ CalendarEventId: 2, IsAllDayEvent: true, StartDay: '2026-10-22T00:00:00' }], Next: null }]);
    expect(await client.getEvents(1, '2026-10-20T00:00:00Z', '2026-10-23T00:00:00Z')).toHaveLength(2);
    expect(get).toHaveBeenCalledTimes(2);
  });
  it.each(['https://example.com/steal', endpoint.replace('/1/calendar/', '/2/calendar/'), endpoint + '?bookmark=loop'])('rejects unsafe or looping next links: %s', async next => {
    const { client } = api([{ Objects: [], Next: next }, { Objects: [], Next: next }]);
    await expect(client.getEvents(1, '2026-10-20T00:00:00Z', '2026-10-23T00:00:00Z')).rejects.toMatchObject({ code: 'INVALID_PAGINATION' });
  });
  it('rejects malformed results rather than claiming an empty calendar', async () => {
    const { client } = api([{ Items: [] }]);
    await expect(client.getEvents(1, '2026-10-20T00:00:00Z', '2026-10-23T00:00:00Z')).rejects.toMatchObject({ code: 'INVALID_UPSTREAM_RESPONSE' });
  });
});
it('reports course failures and preserves all-day and recurring entries', async () => {
  const c = { listCourses: async () => [1,2].map(id => ({ id, name: `${id}`, code: null, homeUrl: 'https://elearn.smu.edu.sg' } as Course)), getEvents: async (id: number) => { if (id === 2) throw new Error('Denied'); return [{ CalendarEventId: 1, Title: 'All day', StartDateTime: null, EndDateTime: null, IsAllDayEvent: true, StartDay: '2026-10-22T00:00:00', IsRecurring: true }]; } };
  const result = await listEvents(c, eventInput.parse({ courseIds: [1,2,99] }));
  expect(result).toMatchObject({ partial: true, unavailableCourseIds: [99], failures: [{ courseId: 2 }], events: [{ allDay: true, recurring: true, startDay: '2026-10-22T00:00:00' }] });
});
it('reads news from the course endpoint and rejects invalid result shapes', async () => {
  const { client } = api([[{ Id: 1 }], { Items: [] }]);
  expect(await client.getAnnouncements(1)).toEqual([{ Id: 1 }]);
  await expect(client.getAnnouncements(1)).rejects.toMatchObject({ code: 'INVALID_UPSTREAM_RESPONSE' });
});
