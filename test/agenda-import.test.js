// Agenda import (src/agenda-import.js): Sessionize's "All" JSON and calendar (.ics) files become agenda rows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromSessionizeData, sessionizeId, fromIcsText, icsTime } from '../src/agenda-import.js';
import { parseSchedule } from '../src/schedule.js';

test('Sessionize: rooms and speakers by id, breaks left out, then matched to the event’s rooms', () => {
  const data = {
    sessions: [
      { id: '1', title: 'Designing cities for everyone', startsAt: '2026-10-05T10:30:00', roomId: 10, speakers: ['a', 'b'] },
      { id: '2', title: 'Coffee break', startsAt: '2026-10-05T11:15:00', roomId: 10, speakers: [], isServiceSession: true },
      { id: '3', title: 'Opening keynote', startsAt: '2026-10-05T09:00:00', roomId: 11, speakers: ['a'] },
    ],
    speakers: [{ id: 'a', fullName: 'María José Pérez' }, { id: 'b', firstName: 'Ana', lastName: 'Gómez' }],
    rooms: [{ id: 10, name: 'Room A' }, { id: 11, name: 'Main stage' }],
  };
  const rows = fromSessionizeData(data);
  assert.deepEqual(rows.map((r) => [r.stage, r.title, r.speaker]), [['Room A', 'Designing cities for everyone', 'María José Pérez, Ana Gómez'], ['Main stage', 'Opening keynote', 'María José Pérez']]);
  const agenda = parseSchedule(rows, new Date(2026, 9, 5), { rooms: [{ id: 'main', name: 'Main stage' }, { id: 'room-a', name: 'Room A' }] });
  assert.deepEqual(agenda.map((e) => [e.stage, new Date(e.start).getHours(), new Date(e.start).getMinutes()]), [['main', 9, 0], ['room-a', 10, 30]]);
});

test('Sessionize: the API link or just its id', () => {
  assert.equal(sessionizeId('https://sessionize.com/api/v2/ab12cd34/view/All'), 'ab12cd34');
  assert.equal(sessionizeId(' ab12cd34 '), 'ab12cd34');
  assert.throws(() => sessionizeId('https://evil.example/../x'), /Sessionize API link/);
});

test('calendar: times in UTC, in a named time zone (summer and winter) and floating', () => {
  assert.equal(new Date(icsTime('20261005T100000Z')).toISOString(), '2026-10-05T10:00:00.000Z');
  assert.equal(new Date(icsTime('20260705T100000', { TZID: 'Europe/Madrid' })).toISOString(), '2026-07-05T08:00:00.000Z', 'CEST, +2');
  assert.equal(new Date(icsTime('20261205T100000', { TZID: 'Europe/Madrid' })).toISOString(), '2026-12-05T09:00:00.000Z', 'CET, +1');
  assert.equal(new Date(icsTime('20261005T100000', { TZID: 'America/Argentina/Buenos_Aires' })).toISOString(), '2026-10-05T13:00:00.000Z');
  assert.equal(new Date(icsTime('20261005T100000')).getHours(), 10, 'floating = the server’s time');
  assert.ok(Number.isNaN(icsTime('20261005', { VALUE: 'DATE' })), 'all-day events have no time');
});

test('calendar: events become rows; folded lines, escapes, cancelled and all-day events', () => {
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0',
    'BEGIN:VEVENT', 'DTSTART;TZID=Europe/Madrid:20261005T103000', 'SUMMARY:Designing cities\\, for every', ' one', 'LOCATION:Room A\\, floor 2', 'DESCRIPTION:Speaker: Ana Gómez\\nMore text', 'END:VEVENT',
    'BEGIN:VEVENT', 'DTSTART:20261005T070000Z', 'SUMMARY:Opening keynote', 'LOCATION:Main stage', 'END:VEVENT',
    'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261005', 'SUMMARY:Conference day', 'END:VEVENT',
    'BEGIN:VEVENT', 'DTSTART:20261005T120000Z', 'SUMMARY:Moved talk', 'STATUS:CANCELLED', 'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const rows = fromIcsText(ics);
  assert.deepEqual(rows.map((r) => [r.stage, r.title, r.speaker, new Date(r.start).toISOString()]), [
    ['Room A', 'Designing cities, for everyone', 'Ana Gómez', '2026-10-05T08:30:00.000Z'],
    ['Main stage', 'Opening keynote', '', '2026-10-05T07:00:00.000Z'],
  ]);
});
